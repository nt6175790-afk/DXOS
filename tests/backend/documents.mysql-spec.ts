// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  DocumentCategory,
  DocumentSensitivity,
  DocumentStatus,
  PrismaClient,
} from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';
import { StorageService } from '../../backend/src/modules/files/storage.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'documents-fixture-secret-not-production';

mysqlDescribe('Documents & HR Compliance Integration & RBAC (TASK 9)', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let admin: string, employeeUser: string, foreignUser: string;
  let org: string, foreignOrg: string;
  let adminEmp: string, employeeEmp: string;
  let adminSession: string, employeeSession: string, foreignSession: string;
  let adminToken: string, employeeToken: string, foreignToken: string;
  let storageService: StorageService;

  const orgBase = (organizationId = org) => '/api/v1/organizations/' + organizationId;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) {
      throw new Error('Disposable database required.');
    }
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {}));
    await app.init();
    storageService = app.get(StorageService);
  });

  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  beforeEach(async () => {
    admin = randomUUID();
    employeeUser = randomUUID();
    foreignUser = randomUUID();
    adminSession = randomUUID();
    employeeSession = randomUUID();
    foreignSession = randomUUID();

    await db.user.createMany({
      data: [
        { id: admin, email: admin + '@example.test', displayName: 'Admin User', passwordHash: 'fixture-hash' },
        { id: employeeUser, email: employeeUser + '@example.test', displayName: 'Employee User', passwordHash: 'fixture-hash' },
        { id: foreignUser, email: foreignUser + '@example.test', displayName: 'Foreign User', passwordHash: 'fixture-hash' },
      ],
    });

    await db.authSession.createMany({
      data: [
        { id: adminSession, userId: admin, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
        { id: employeeSession, userId: employeeUser, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
        { id: foreignSession, userId: foreignUser, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
      ],
    });

    adminToken = sign({ sub: admin, sid: adminSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });
    employeeToken = sign({ sub: employeeUser, sid: employeeSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });
    foreignToken = sign({ sub: foreignUser, sid: foreignSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });

    const orgService = app.get(OrganizationsService);
    org = (await orgService.create(admin, { name: 'Docs Org ' + randomUUID().slice(0, 8), slug: 'docs-a-' + randomUUID().slice(0, 8) })).id;
    foreignOrg = (await orgService.create(foreignUser, { name: 'Foreign Org ' + randomUUID().slice(0, 8), slug: 'docs-b-' + randomUUID().slice(0, 8) })).id;

    // Membership for employeeUser in org
    const empMembership = await db.organizationMembership.create({
      data: { id: randomUUID(), organizationId: org, userId: employeeUser, status: 'ACTIVE' },
    });

    // Departments
    const techDept = await db.department.create({
      data: { id: randomUUID(), organizationId: org, code: 'TECH', name: 'Engineering', status: 'ACTIVE' },
    });

    // Employees
    adminEmp = (await db.employee.create({
      data: {
        id: randomUUID(),
        organizationId: org,
        userId: admin,
        employeeCode: 'EMP-ADM',
        displayName: 'Admin Employee',
        departmentId: techDept.id,
        status: 'ACTIVE',
      },
    })).id;

    employeeEmp = (await db.employee.create({
      data: {
        id: randomUUID(),
        organizationId: org,
        userId: employeeUser,
        employeeCode: 'EMP-002',
        displayName: 'Standard Employee',
        departmentId: techDept.id,
        status: 'ACTIVE',
      },
    })).id;

    // Permissions: Admin role in org gets all document permissions
    const adminMembership = await db.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: org, userId: admin } },
    });
    const adminRole = await db.role.create({
      data: { organizationId: org, key: 'admin', name: 'Admin Role', isActive: true },
    });
    await db.membershipRole.create({
      data: { organizationId: org, membershipId: adminMembership.id, roleId: adminRole.id },
    });

    const docPerms = [
      PERMISSIONS.DOCUMENT_READ,
      PERMISSIONS.DOCUMENT_CREATE,
      PERMISSIONS.DOCUMENT_UPDATE,
      PERMISSIONS.DOCUMENT_DELETE,
      PERMISSIONS.DOCUMENT_DOWNLOAD,
      PERMISSIONS.DOCUMENT_SENSITIVE_READ,
      PERMISSIONS.DOCUMENT_MANAGE,
    ];

    for (const key of docPerms) {
      const p = await db.permission.upsert({
        where: { key },
        update: {},
        create: { key, name: key },
      });
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: p.id },
      });
    }

    // Standard employee gets document:read but NOT document:sensitive:read or document:manage
    const empRole = await db.role.create({
      data: { id: randomUUID(), organizationId: org, key: 'employee', name: 'Employee', isActive: true },
    });
    const readPerm = await db.permission.findUniqueOrThrow({ where: { key: PERMISSIONS.DOCUMENT_READ } });
    const downloadPerm = await db.permission.findUniqueOrThrow({ where: { key: PERMISSIONS.DOCUMENT_DOWNLOAD } });
    await db.rolePermission.createMany({
      data: [
        { roleId: empRole.id, permissionId: readPerm.id },
        { roleId: empRole.id, permissionId: downloadPerm.id },
      ],
    });
    await db.membershipRole.create({
      data: { organizationId: org, membershipId: empMembership.id, roleId: empRole.id },
    });
  });

  // Helper to create real file in test
  async function createTestFile(filename = 'test.pdf') {
    const dummyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    const storageKey = randomUUID();
    const stored = await storageService.put(storageKey, Readable.from(dummyPdf));

    return db.fileObject.create({
      data: {
        organizationId: org,
        uploadedByUserId: admin,
        originalFilename: filename,
        contentType: 'application/pdf',
        storageProvider: 'LOCAL',
        storageKey,
        status: 'AVAILABLE',
        size: stored.size,
        checksum: stored.checksum,
      },
    });
  }

  describe('Document CRUD & Multi-Versioning', () => {
    it('creates document with initial version, updates metadata, and adds version 2', async () => {
      const file1 = await createTestFile('Contract-v1.pdf');

      const createRes = await http()
        .post(`${orgBase()}/documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: employeeEmp,
          title: 'Labor Contract 2026',
          documentNumber: 'LC-2026-001',
          category: DocumentCategory.LABOR_CONTRACT,
          sensitivity: DocumentSensitivity.NORMAL,
          issueDate: '2026-01-01',
          expiryDate: '2028-01-01',
          notes: 'Standard 2-year contract',
          fileId: file1.id,
          changeSummary: 'Initial signing',
        })
        .expect(201);

      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.title).toBe('Labor Contract 2026');
      expect(createRes.body.versions).toHaveLength(1);
      expect(createRes.body.versions[0].versionNumber).toBe(1);
      expect(createRes.body.versions[0].fileName).toBe('Contract-v1.pdf');

      const docId = createRes.body.id;

      // Create Version 2
      const file2 = await createTestFile('Contract-v2-Annex.pdf');
      const v2Res = await http()
        .post(`${orgBase()}/documents/${docId}/versions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fileId: file2.id,
          changeSummary: 'Add appendix salary revision',
        })
        .expect(201);

      expect(v2Res.body.versionNumber).toBe(2);
      expect(v2Res.body.fileName).toBe('Contract-v2-Annex.pdf');

      // Get Document Detail with all versions
      const detailRes = await http()
        .get(`${orgBase()}/documents/${docId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detailRes.body.versions).toHaveLength(2);
      expect(detailRes.body.versions[0].versionNumber).toBe(2);
      expect(detailRes.body.versions[1].versionNumber).toBe(1);
    });

    it('supports archive, restore, and soft-delete', async () => {
      const file = await createTestFile('ID-Card.pdf');
      const doc = await http()
        .post(`${orgBase()}/documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: employeeEmp,
          title: 'Citizen ID',
          category: DocumentCategory.IDENTIFICATION,
          fileId: file.id,
        })
        .expect(201);

      // Archive
      const archiveRes = await http()
        .post(`${orgBase()}/documents/${doc.body.id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(archiveRes.body.status).toBe(DocumentStatus.ARCHIVED);

      // Restore
      const restoreRes = await http()
        .post(`${orgBase()}/documents/${doc.body.id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(restoreRes.body.status).toBe(DocumentStatus.ACTIVE);

      // Soft delete
      await http()
        .delete(`${orgBase()}/documents/${doc.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify excluded from list
      const listRes = await http()
        .get(`${orgBase()}/documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(listRes.body.items.some((d: { id: string }) => d.id === doc.body.id)).toBe(false);
    });
  });

  describe('Sensitivity RBAC & Employee Self-Service', () => {
    it('restricts SENSITIVE document access for users without document:sensitive:read, but allows owner', async () => {
      const file = await createTestFile('Bonus-Decision.pdf');

      // Create sensitive document for admin
      const adminDoc = await http()
        .post(`${orgBase()}/documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: adminEmp,
          title: 'Executive Bonus Decision',
          category: DocumentCategory.DECISION,
          sensitivity: DocumentSensitivity.SENSITIVE,
          fileId: file.id,
        })
        .expect(201);

      // Standard employee attempts to access admin's sensitive document -> 403
      await http()
        .get(`${orgBase()}/documents/${adminDoc.body.id}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);

      // Standard employee listing all documents does NOT see admin's sensitive document
      const listRes = await http()
        .get(`${orgBase()}/documents`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(listRes.body.items.some((d: { id: string }) => d.id === adminDoc.body.id)).toBe(false);

      // Create sensitive document for standard employee
      const empSensitiveFile = await createTestFile('Emp-Salary.pdf');
      const empDoc = await http()
        .post(`${orgBase()}/documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: employeeEmp,
          title: 'Employee Salary Decision',
          category: DocumentCategory.DECISION,
          sensitivity: DocumentSensitivity.SENSITIVE,
          fileId: empSensitiveFile.id,
        })
        .expect(201);

      // Standard employee CAN access their OWN sensitive document
      const selfRes = await http()
        .get(`${orgBase()}/documents/${empDoc.body.id}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(selfRes.body.title).toBe('Employee Salary Decision');
    });
  });

  describe('Document Download & Audit Logging', () => {
    it('streams file content and records DOCUMENT_DOWNLOADED audit event', async () => {
      const file = await createTestFile('Certificate.pdf');
      const doc = await http()
        .post(`${orgBase()}/documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: employeeEmp,
          title: 'Professional Certificate',
          category: DocumentCategory.CERTIFICATE,
          fileId: file.id,
        })
        .expect(201);

      const downloadRes = await http()
        .get(`${orgBase()}/documents/${doc.body.id}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(downloadRes.headers['content-type']).toContain('application/pdf');

      // Verify audit log
      const audit = await db.auditEvent.findFirst({
        where: {
          organizationId: org,
          event: 'document.downloaded',
          resourceId: doc.body.id,
        },
      });
      expect(audit).toBeDefined();
    });
  });

  describe('Compliance Calculations & Missing Detection', () => {
    it('calculates compliance summary, missing documents, and department rates', async () => {
      // 1. Get summary - should initialize default 4 requirements
      const summaryRes = await http()
        .get(`${orgBase()}/compliance/summary`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(summaryRes.body.totalExpectedRequirements).toBeGreaterThan(0);

      // 2. Fulfill one requirement for employeeEmp
      const file = await createTestFile('Contract.pdf');
      await http()
        .post(`${orgBase()}/documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: employeeEmp,
          title: 'Labor Contract',
          category: DocumentCategory.LABOR_CONTRACT,
          fileId: file.id,
        })
        .expect(201);

      // 3. Check missing documents endpoint
      const missingRes = await http()
        .get(`${orgBase()}/compliance/missing`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(missingRes.body)).toBe(true);
      // employeeEmp should not be missing LABOR_CONTRACT anymore, but still missing IDENTIFICATION, etc.
      const empMissingLabor = missingRes.body.find(
        (m: { employeeId: string; category: DocumentCategory }) =>
          m.employeeId === employeeEmp && m.category === DocumentCategory.LABOR_CONTRACT,
      );
      expect(empMissingLabor).toBeUndefined();

      const empMissingId = missingRes.body.find(
        (m: { employeeId: string; category: DocumentCategory }) =>
          m.employeeId === employeeEmp && m.category === DocumentCategory.IDENTIFICATION,
      );
      expect(empMissingId).toBeDefined();

      // 4. Check departments compliance
      const deptRes = await http()
        .get(`${orgBase()}/compliance/departments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(deptRes.body).toHaveLength(1);
      expect(deptRes.body[0].departmentCode).toBe('TECH');
      expect(deptRes.body[0].complianceRate).toBeGreaterThan(0);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('prevents foreign organization from accessing documents', async () => {
      const file = await createTestFile('Secret.pdf');
      const doc = await http()
        .post(`${orgBase()}/documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: adminEmp,
          title: 'Tenant A Secret',
          category: DocumentCategory.HR_RECORD,
          fileId: file.id,
        })
        .expect(201);

      const foreignRes = await http()
        .get(`${orgBase(foreignOrg)}/documents/${doc.body.id}`)
        .set('Authorization', `Bearer ${foreignToken}`);
      expect([403, 404]).toContain(foreignRes.status);
    });
  });
  describe('document permission regressions', () => {
    async function sensitiveDocument(employeeId: string) {
      const file = await createTestFile('private-personnel.pdf');
      const result = await http().post(orgBase() + '/documents').set('Authorization', 'Bearer ' + adminToken)
        .send({ employeeId, title: 'Private personnel', category: DocumentCategory.IDENTIFICATION,
          sensitivity: DocumentSensitivity.SENSITIVE, fileId: file.id }).expect(201);
      return { document: result.body, file };
    }
    it('does not let an update-only operator downgrade another employee sensitive document', async () => {
      const hidden = await sensitiveDocument(adminEmp);
      const role = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org, key: 'employee' } } });
      const permission = await db.permission.findUniqueOrThrow({ where: { key: 'document:update' } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      await http().patch(orgBase() + '/documents/' + hidden.document.id).set('Authorization', 'Bearer ' + employeeToken)
        .send({ sensitivity: DocumentSensitivity.NORMAL }).expect(403);
      expect((await db.employeeDocument.findUniqueOrThrow({ where: { id: hidden.document.id } })).sensitivity).toBe('SENSITIVE');
    });
    it('keeps explicit SENSITIVE searches scoped to the owner without sensitive-read', async () => {
      const foreign = await sensitiveDocument(adminEmp);
      const own = await sensitiveDocument(employeeEmp);
      const result = await http().get(orgBase() + '/documents?sensitivity=SENSITIVE')
        .set('Authorization', 'Bearer ' + employeeToken).expect(200);
      expect(result.body.items.map((d: { id: string }) => d.id)).toContain(own.document.id);
      expect(result.body.items.map((d: { id: string }) => d.id)).not.toContain(foreign.document.id);
    });
    it.each(['INACTIVE', 'SUSPENDED', 'REMOVED'] as const)('rejects own-document access for %s membership', async status => {
      const own = await sensitiveDocument(employeeEmp);
      await db.organizationMembership.update({ where: { organizationId_userId: { organizationId: org, userId: employeeUser } }, data: { status } });
      for (const suffix of ['/documents', '/documents/' + own.document.id, '/documents/' + own.document.id + '/download', '/compliance/employees/' + employeeEmp]) {
        await http().get(orgBase() + suffix).set('Authorization', 'Bearer ' + employeeToken).expect(403);
      }
      await http().post(orgBase() + '/documents').set('Authorization', 'Bearer ' + employeeToken)
        .send({ employeeId: employeeEmp, title: 'Blocked', category: DocumentCategory.IDENTIFICATION, fileId: own.file.id }).expect(403);
    });
    it('does not expose another employee sensitive attachment through the generic file catalog or download', async () => {
      const hidden = await sensitiveDocument(adminEmp);
      const own = await sensitiveDocument(employeeEmp);
      const role = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org, key: 'employee' } } });
      const permission = await db.permission.upsert({ where: { key: 'file:read' }, update: {}, create: { key: 'file:read', name: 'Read files' } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      const result = await http().get(orgBase() + '/files').set('Authorization', 'Bearer ' + employeeToken).expect(200);
      expect(result.body.items.map((f: { id: string }) => f.id)).not.toContain(hidden.file.id);
      expect(result.body.items.map((f: { id: string }) => f.id)).toContain(own.file.id);
      await http().get(orgBase() + '/files/' + hidden.file.id + '/content').set('Authorization', 'Bearer ' + employeeToken).expect(403);
      await http().get(orgBase() + '/files/' + own.file.id + '/content').set('Authorization', 'Bearer ' + employeeToken).expect(200);
    });
  });
});

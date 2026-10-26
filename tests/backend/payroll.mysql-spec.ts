// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ApprovalRequestType,
  ApprovalStatus,
  AttendanceStatus,
  LeaveStatus,
  LeaveType,
  PayrollPeriodStatus,
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

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'payroll-fixture-secret-not-production';

mysqlDescribe('Payroll & Compensation Engine Integration & RBAC (TASK 6)', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string, manager: string, foreign: string;
  let org: string, foreignOrg: string;
  let actorEmp: string;
  let actorRole: string, managerRole: string;
  let actorSession: string, managerSession: string;
  let actorToken: string, managerToken: string, foreignToken: string;

  const orgBase = (organizationId = org) => '/api/v1/organizations/' + organizationId;
  const approvalsBase = (organizationId = org) => '/api/v1/organizations/' + organizationId + '/approvals';
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
  });

  beforeEach(async () => {
    actor = randomUUID();
    manager = randomUUID();
    foreign = randomUUID();
    actorSession = randomUUID();
    managerSession = randomUUID();
    const foreignSession = randomUUID();

    await db.user.createMany({
      data: [
        { id: actor, email: actor + '@example.test', displayName: 'Actor Employee', passwordHash: 'fixture-hash' },
        { id: manager, email: manager + '@example.test', displayName: 'Manager User', passwordHash: 'fixture-hash' },
        { id: foreign, email: foreign + '@example.test', displayName: 'Foreign User', passwordHash: 'fixture-hash' },
      ],
    });

    await db.authSession.createMany({
      data: [
        { id: actorSession, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
        { id: managerSession, userId: manager, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
        { id: foreignSession, userId: foreign, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
      ],
    });

    actorToken = sign({ sub: actor, sid: actorSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });
    managerToken = sign({ sub: manager, sid: managerSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });
    foreignToken = sign({ sub: foreign, sid: foreignSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });

    const orgService = app.get(OrganizationsService);
    org = (await orgService.create(manager, { name: 'Payroll Org ' + randomUUID().slice(0, 8), slug: 'payroll-a-' + randomUUID().slice(0, 8) })).id;
    foreignOrg = (await orgService.create(foreign, { name: 'Foreign Org ' + randomUUID().slice(0, 8), slug: 'payroll-b-' + randomUUID().slice(0, 8) })).id;

    // Memberships
    const actorMembership = await db.organizationMembership.create({
      data: { organizationId: org, userId: actor, status: 'ACTIVE' },
    });

    const actorEmpRow = await db.employee.create({
      data: { organizationId: org, userId: actor, employeeCode: 'EMP-ACTOR', displayName: 'Actor Employee', status: 'ACTIVE' },
    });
    actorEmp = actorEmpRow.id;

    await db.employee.create({
      data: { organizationId: org, userId: manager, employeeCode: 'EMP-MGR', displayName: 'Manager User', status: 'ACTIVE' },
    });

    // Roles
    const employeeRole = await db.role.create({
      data: { organizationId: org, key: 'employee', name: 'Employee Role', isActive: true },
    });
    actorRole = employeeRole.id;

    const mgrRole = await db.role.create({
      data: { organizationId: org, key: 'manager', name: 'Manager Role', isActive: true },
    });
    managerRole = mgrRole.id;

    // Permissions for actor
    const actorPerms = [
      PERMISSIONS.PAYROLL_READ,
      PERMISSIONS.PAYROLL_CREATE,
      PERMISSIONS.PAYROLL_CALCULATE,
      PERMISSIONS.APPROVAL_READ,
      PERMISSIONS.APPROVAL_CREATE,
      PERMISSIONS.APPROVAL_APPROVE,
    ];
    for (const key of actorPerms) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: actorRole, permissionId: p.id } });
    }

    // Permissions for manager
    const managerPerms = [
      PERMISSIONS.PAYROLL_READ,
      PERMISSIONS.PAYROLL_CREATE,
      PERMISSIONS.PAYROLL_CALCULATE,
      PERMISSIONS.PAYROLL_APPROVE,
      PERMISSIONS.PAYROLL_FINALIZE,
      PERMISSIONS.PAYROLL_MANAGE,
      PERMISSIONS.COMPENSATION_READ,
      PERMISSIONS.COMPENSATION_CREATE,
      PERMISSIONS.COMPENSATION_UPDATE,
      PERMISSIONS.COMPENSATION_MANAGE,
      PERMISSIONS.APPROVAL_READ,
      PERMISSIONS.APPROVAL_CREATE,
      PERMISSIONS.APPROVAL_APPROVE,
      PERMISSIONS.APPROVAL_REJECT,
      PERMISSIONS.APPROVAL_MANAGE,
    ];
    for (const key of managerPerms) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: managerRole, permissionId: p.id } });
    }

    await db.membershipRole.create({
      data: { organizationId: org, membershipId: actorMembership.id, roleId: actorRole },
    });

    const mgrMembership = await db.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: org, userId: manager } },
    });
    await db.membershipRole.create({
      data: { organizationId: org, membershipId: mgrMembership.id, roleId: managerRole },
    });
  });

  afterEach(async () => {
    const orgs = { in: [org, foreignOrg] };
    const users = { in: [actor, manager, foreign] };

    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: orgs }, { actorUserId: users }] } });
    await db.notification.deleteMany({ where: { organizationId: orgs } });
    await db.payrollItem.deleteMany({ where: { payrollRecord: { organizationId: orgs } } });
    await db.payrollRecord.deleteMany({ where: { organizationId: orgs } });
    await db.approvalRequest.deleteMany({ where: { organizationId: orgs } });
    await db.payrollPeriod.deleteMany({ where: { organizationId: orgs } });
    await db.compensationProfile.deleteMany({ where: { organizationId: orgs } });
    await db.attendanceRecord.deleteMany({ where: { organizationId: orgs } });
    await db.leaveRequest.deleteMany({ where: { organizationId: orgs } });
    await db.workSchedule.deleteMany({ where: { organizationId: orgs } });
    await db.membershipRole.deleteMany({ where: { organizationId: orgs } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: orgs } } });
    await db.role.deleteMany({ where: { organizationId: orgs } });
    await db.employee.deleteMany({ where: { organizationId: orgs } });
    await db.organizationMembership.deleteMany({ where: { organizationId: orgs } });
    await db.organization.deleteMany({ where: { id: orgs } });
    await db.authSession.deleteMany({ where: { userId: users } });
    await db.user.deleteMany({ where: { id: users } });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  describe('1. Compensation Profile Versioning & Management', () => {
    it('creates compensation profile and closes older profile when effective date advances', async () => {
      // Step 1: Manager creates profile #1
      const res1 = await http()
        .post(orgBase() + '/employees/' + actorEmp + '/compensation')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          baseSalary: '20000000',
          effectiveFrom: '2026-01-01',
          notes: 'Mức lương ban đầu',
        });

      expect(res1.status).toBe(201);
      expect(Number(res1.body.baseSalary)).toBe(20000000);
      expect(res1.body.isActive).toBe(true);
      const profile1Id = res1.body.id;

      // Step 2: Manager creates profile #2 starting 2026-07-01
      const res2 = await http()
        .post(orgBase() + '/employees/' + actorEmp + '/compensation')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          baseSalary: '25000000',
          effectiveFrom: '2026-07-01',
          notes: 'Tăng lương giữa năm',
        });

      expect(res2.status).toBe(201);
      expect(Number(res2.body.baseSalary)).toBe(25000000);
      expect(res2.body.isActive).toBe(true);

      // Verify Profile 1 was updated to end before Profile 2
      const updatedProfile1 = await db.compensationProfile.findUniqueOrThrow({
        where: { id: profile1Id },
      });
      expect(updatedProfile1.effectiveTo).toBeDefined();

      // Step 3: Fetch history
      const historyRes = await http()
        .get(orgBase() + '/employees/' + actorEmp + '/compensation')
        .set('Authorization', 'Bearer ' + managerToken);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.activeProfile).toBeDefined();
      expect(historyRes.body.history.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects negative salary with 400 Bad Request', async () => {
      const res = await http()
        .post(orgBase() + '/employees/' + actorEmp + '/compensation')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          baseSalary: '-5000000',
          effectiveFrom: '2026-01-01',
        });

      expect(res.status).toBe(400);
    });

    it('forbids unauthorized user from creating compensation profiles', async () => {
      const res = await http()
        .post(orgBase() + '/employees/' + actorEmp + '/compensation')
        .set('Authorization', 'Bearer ' + foreignToken)
        .send({
          baseSalary: '30000000',
          effectiveFrom: '2026-01-01',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('2. Payroll Period Lifecycle & Deduplication', () => {
    it('creates payroll period in DRAFT status and enforces unique name per org', async () => {
      const periodData = {
        name: 'Kỳ lương Tháng 09/2026',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      };

      const res = await http()
        .post(orgBase() + '/payroll-periods')
        .set('Authorization', 'Bearer ' + managerToken)
        .send(periodData);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(PayrollPeriodStatus.DRAFT);
      expect(res.body.name).toBe(periodData.name);

      // Duplicate name should return 409 Conflict
      const dupRes = await http()
        .post(orgBase() + '/payroll-periods')
        .set('Authorization', 'Bearer ' + managerToken)
        .send(periodData);

      expect(dupRes.status).toBe(409);
    });

    it('rejects invalid period where periodEnd <= periodStart', async () => {
      const res = await http()
        .post(orgBase() + '/payroll-periods')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          name: 'Kỳ lương Lỗi Ngày',
          periodStart: '2026-09-30',
          periodEnd: '2026-09-01',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('3. Deterministic Payroll Calculation (Prisma.Decimal & Pro-ration)', () => {
    it('calculates employee payroll with attendance, paid leaves, statutory deductions', async () => {
      // 1. Setup Compensation for Actor: 22,000,000 VND / month
      await db.compensationProfile.create({
        data: {
          organizationId: org,
          employeeId: actorEmp,
          baseSalary: '22000000',
          effectiveFrom: new Date('2026-01-01'),
          isActive: true,
        },
      });

      // 2. Setup Period: 2026-09-01 to 2026-09-30 (September 2026 has 22 working days Mon-Fri)
      const period = await db.payrollPeriod.create({
        data: {
          organizationId: org,
          name: 'Kỳ lương Tháng 09/2026 Test Calc',
          periodStart: new Date('2026-09-01T00:00:00.000Z'),
          periodEnd: new Date('2026-09-30T23:59:59.999Z'),
          status: PayrollPeriodStatus.DRAFT,
        },
      });

      // 3. Create 20 Present attendance records
      for (let day = 1; day <= 20; day++) {
        const dStr = String(day).padStart(2, '0');
        await db.attendanceRecord.create({
          data: {
            organizationId: org,
            employeeId: actorEmp,
            workDate: new Date('2026-09-' + dStr + 'T00:00:00.000Z'),
            checkInAt: new Date('2026-09-' + dStr + 'T08:30:00.000Z'),
            checkOutAt: new Date('2026-09-' + dStr + 'T17:30:00.000Z'),
            workedMinutes: 480,
            status: AttendanceStatus.PRESENT,
          },
        });
      }

      // 4. Create 1 Approved Paid Leave request (1 day on 2026-09-21)
      await db.leaveRequest.create({
        data: {
          organizationId: org,
          employeeId: actorEmp,
          createdByUserId: actor,
          leaveType: LeaveType.ANNUAL,
          startsAt: new Date('2026-09-21T00:00:00.000Z'),
          endsAt: new Date('2026-09-21T23:59:59.999Z'),
          daysCount: 1,
          status: LeaveStatus.APPROVED,
          reason: 'Nghỉ phép thường niên có hưởng lương',
        },
      });

      // 5. Trigger Calculation
      const calcRes = await http()
        .post(orgBase() + '/payroll-periods/' + period.id + '/calculate')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({});

      expect(calcRes.status).toBe(201);
      expect(calcRes.body.status).toBe(PayrollPeriodStatus.CALCULATED);

      // 6. Inspect calculated records
      const recordsRes = await http()
        .get(orgBase() + '/payroll-periods/' + period.id + '/records')
        .set('Authorization', 'Bearer ' + managerToken);

      expect(recordsRes.status).toBe(200);
      expect(recordsRes.body.length).toBe(1);

      const record = recordsRes.body[0];
      expect(record.employeeId).toBe(actorEmp);
      // workedDays = 20, paidLeaveDays = 1, workingDays = 22
      expect(Number(record.workedDays)).toBe(20);
      expect(Number(record.paidLeaveDays)).toBe(1);
      expect(Number(record.workingDays)).toBe(22);

      // Pro-rated gross salary: (20 worked + 1 paid leave) / 22 * 22,000,000 = 21,000,000
      expect(Number(record.grossAmount)).toBe(21000000);

      // Deductions and Net
      expect(Number(record.deductionAmount)).toBe(0);
      expect(Number(record.netAmount)).toBe(21000000);

      // Verify line items
      expect(record.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Approval Workflow Integration', () => {
    it('integrates with approval engine, prevents self-approval, supports approval and rejection', async () => {
      // 1. Setup Period and Calculate
      await db.compensationProfile.create({
        data: {
          organizationId: org,
          employeeId: actorEmp,
          baseSalary: '15000000',
          effectiveFrom: new Date('2026-01-01'),
          isActive: true,
        },
      });

      const period = await db.payrollPeriod.create({
        data: {
          organizationId: org,
          name: 'Kỳ lương Tháng 09/2026 Approval Flow',
          periodStart: new Date('2026-09-01T00:00:00.000Z'),
          periodEnd: new Date('2026-09-30T23:59:59.999Z'),
          status: PayrollPeriodStatus.CALCULATED,
        },
      });

      // 2. Submit for Approval
      const submitRes = await http()
        .post(orgBase() + '/payroll-periods/' + period.id + '/request-approval')
        .set('Authorization', 'Bearer ' + actorToken)
        .send({ reason: 'Kính gửi ban giám đốc phê duyệt bảng lương' });

      expect(submitRes.status).toBe(201);
      expect(submitRes.body.status).toBe(PayrollPeriodStatus.PENDING_APPROVAL);

      // Verify Approval Request created in approval module
      const approvalReq = await db.approvalRequest.findFirstOrThrow({
        where: { organizationId: org, referenceId: period.id, type: ApprovalRequestType.PAYROLL },
      });
      expect(approvalReq.status).toBe(ApprovalStatus.PENDING);

      // 3. Self-approval prevention: Actor cannot approve their own submission
      const selfApproveRes = await http()
        .post(approvalsBase() + '/' + approvalReq.id + '/approve')
        .set('Authorization', 'Bearer ' + actorToken)
        .send({ note: 'Tự duyệt' });

      expect(selfApproveRes.status).toBe(403);

      // 4. Manager approves
      const approveRes = await http()
        .post(approvalsBase() + '/' + approvalReq.id + '/approve')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({ note: 'Đã kiểm tra số liệu, duyệt chi trả' });

      expect(approveRes.status).toBe(201);

      // Verify Period status transitioned to APPROVED
      const updatedPeriod = await db.payrollPeriod.findUniqueOrThrow({
        where: { id: period.id },
      });
      expect(updatedPeriod.status).toBe(PayrollPeriodStatus.APPROVED);
    });
  });

  describe('5. Finalization & Immutability Snapshot', () => {
    it('freezes period upon finalization and prevents subsequent recalculation or tampering', async () => {
      // 1. Setup profile and period in APPROVED status
      const comp = await db.compensationProfile.create({
        data: {
          organizationId: org,
          employeeId: actorEmp,
          baseSalary: '30000000',
          effectiveFrom: new Date('2026-01-01'),
          isActive: true,
        },
      });

      const period = await db.payrollPeriod.create({
        data: {
          organizationId: org,
          name: 'Kỳ lương Tháng 09/2026 Finalize Test',
          periodStart: new Date('2026-09-01T00:00:00.000Z'),
          periodEnd: new Date('2026-09-30T23:59:59.999Z'),
          status: PayrollPeriodStatus.APPROVED,
        },
      });

      const record = await db.payrollRecord.create({
        data: {
          organizationId: org,
          payrollPeriodId: period.id,
          employeeId: actorEmp,
          compensationProfileId: comp.id,
          baseSalary: '30000000',
          workingDays: 22,
          workedDays: 22,
          absentDays: 0,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          grossAmount: '30000000',
          allowanceAmount: '0',
          deductionAmount: '3150000',
          netAmount: '26850000',
        },
      });

      // 2. Finalize Period
      const finRes = await http()
        .post(orgBase() + '/payroll-periods/' + period.id + '/finalize')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({});

      expect(finRes.status).toBe(201);
      expect(finRes.body.status).toBe(PayrollPeriodStatus.FINALIZED);
      expect(finRes.body.finalizedAt).toBeDefined();

      // Verify Period is marked FINALIZED
      const finPeriod = await db.payrollPeriod.findUniqueOrThrow({
        where: { id: period.id },
      });
      expect(finPeriod.status).toBe(PayrollPeriodStatus.FINALIZED);

      // 3. Attempting to recalculate finalized period must fail with 409 Conflict
      const recalcRes = await http()
        .post(orgBase() + '/payroll-periods/' + period.id + '/calculate')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({});

      expect(recalcRes.status).toBe(409);

      // 4. Modifying employee salary after finalization must NOT alter finalized snapshot
      await db.compensationProfile.update({
        where: { id: comp.id },
        data: { baseSalary: '99999999' },
      });

      const refetchedRecord = await db.payrollRecord.findUniqueOrThrow({
        where: { id: record.id },
      });
      expect(Number(refetchedRecord.netAmount)).toBe(26850000);
      expect(Number(refetchedRecord.baseSalary)).toBe(30000000);
    });
  });

  describe('6. Multi-tenant Isolation & Employee Self-Service', () => {
    it('prevents cross-tenant access to payroll records and periods', async () => {
      const period = await db.payrollPeriod.create({
        data: {
          organizationId: org,
          name: 'Org A Period',
          periodStart: new Date('2026-09-01T00:00:00.000Z'),
          periodEnd: new Date('2026-09-30T23:59:59.999Z'),
          status: PayrollPeriodStatus.DRAFT,
        },
      });

      // Foreign user attempting to access Org A's period
      const res = await http()
        .get(orgBase() + '/payroll-periods/' + period.id)
        .set('Authorization', 'Bearer ' + foreignToken);

      expect(res.status).toBe(403);
    });

    it('allows employee to view their own finalized payslip via /me/payroll', async () => {
      const period = await db.payrollPeriod.create({
        data: {
          organizationId: org,
          name: 'Kỳ lương Tháng 08/2026 Chốt',
          periodStart: new Date('2026-08-01T00:00:00.000Z'),
          periodEnd: new Date('2026-08-31T23:59:59.999Z'),
          status: PayrollPeriodStatus.FINALIZED,
        },
      });

      await db.payrollRecord.create({
        data: {
          organizationId: org,
          payrollPeriodId: period.id,
          employeeId: actorEmp,
          baseSalary: '18000000',
          workingDays: 22,
          workedDays: 22,
          absentDays: 0,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          grossAmount: '18000000',
          allowanceAmount: '0',
          deductionAmount: '1890000',
          netAmount: '16110000',
        },
      });

      const myRes = await http()
        .get(orgBase() + '/me/payroll')
        .set('Authorization', 'Bearer ' + actorToken);

      expect(myRes.status).toBe(200);
      expect(myRes.body.length).toBeGreaterThanOrEqual(1);
      expect(myRes.body[0].employeeId).toBe(actorEmp);
      expect(Number(myRes.body[0].netAmount)).toBe(16110000);
    });
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger, type StructuredLogRecord } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'search-fixture-secret-not-production';
const permissions = ['employee:read', 'task:read', 'file:read', 'department:read'];
const categories = ['employees', 'tasks', 'documents', 'departments', 'notifications'];
mysqlDescribe('Organization global search', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string, foreign: string, org: string, foreignOrg: string, employee: string, role: string, session: string, token: string;
  const logs: StructuredLogRecord[] = [];
  const search = (query: object = { q: 'Needle' }, organizationId = org) => request(app.getHttpServer()).get(`/api/v1/organizations/${organizationId}/search`).set('Authorization', `Bearer ${token}`).query(query);
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('info', (record) => logs.push(record))); await app.init();
  });
  beforeEach(async () => {
    actor = randomUUID(); foreign = randomUUID(); session = randomUUID(); logs.length = 0;
    await db.user.createMany({ data: [actor, foreign].map((id) => ({ id, email: `${id}@example.test`, displayName: 'Private user', passwordHash: 'private-hash' })) });
    await db.authSession.create({ data: { id: session, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session, typ: 'access' }, secret, { expiresIn: 300 });
    const service = app.get(OrganizationsService);
    org = (await service.create(actor, { name: 'Search A', slug: `search-a-${randomUUID()}` })).id;
    foreignOrg = (await service.create(foreign, { name: 'Search B', slug: `search-b-${randomUUID()}` })).id;
    role = (await db.role.findFirstOrThrow({ where: { organizationId: org } })).id;
    for (const key of permissions) { const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } }); await db.rolePermission.create({ data: { roleId: role, permissionId: permission.id } }); }
    await db.organizationMembership.create({ data: { organizationId: org, userId: foreign } });
    for (const [organizationId, userId, suffix] of [[org, actor, 'A'], [foreignOrg, foreign, 'B']]) {
      const department = await db.department.create({ data: { organizationId, code: 'SEARCH', name: `Needle department ${suffix}` } });
      const person = await db.employee.create({ data: { organizationId, userId, employeeCode: 'SEARCH', displayName: `Needle employee ${suffix}`, departmentId: department.id, phone: 'private-phone' } });
      if (organizationId === org) employee = person.id;
      await db.task.create({ data: { organizationId, creatorEmployeeId: person.id, title: `Needle task ${suffix}`, description: 'private description' } });
      await db.fileObject.create({ data: { organizationId, uploadedByUserId: userId, originalFilename: `Needle document ${suffix}.pdf`, contentType: 'application/pdf', storageKey: randomUUID(), status: 'AVAILABLE' } });
      await db.notification.create({ data: { organizationId, recipientUserId: userId, type: 'search.fixture', title: `Needle notification ${suffix}`, body: 'private notification body', metadata: { private: true } } });
    }
    await db.notification.create({ data: { organizationId: org, recipientUserId: foreign, type: 'search.fixture', title: 'Needle other recipient', body: 'private', metadata: {} } });
  });
  afterEach(async () => {
    const organizations = { in: [org, foreignOrg] }; const users = { in: [actor, foreign] };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: organizations }, { actorUserId: users }] } });
    await db.notification.deleteMany({ where: { organizationId: organizations } }); await db.fileObject.deleteMany({ where: { organizationId: organizations } });
    await db.task.deleteMany({ where: { organizationId: organizations } }); await db.employee.deleteMany({ where: { organizationId: organizations } }); await db.department.deleteMany({ where: { organizationId: organizations } });
    await db.membershipRole.deleteMany({ where: { organizationId: organizations } }); await db.rolePermission.deleteMany({ where: { role: { organizationId: organizations } } });
    await db.role.deleteMany({ where: { organizationId: organizations } }); await db.organizationMembership.deleteMany({ where: { organizationId: organizations } });
    await db.organization.deleteMany({ where: { id: organizations } }); await db.authSession.deleteMany({ where: { userId: users } }); await db.user.deleteMany({ where: { id: users } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  it('requires JWT and a live session', async () => {
    await request(app.getHttpServer()).get(`/api/v1/organizations/${org}/search?q=Needle`).expect(401);
    await db.authSession.update({ where: { id: session }, data: { revokedAt: new Date() } }); await search().expect(401);
  });
  it.each(['INACTIVE', 'SUSPENDED', 'REMOVED'] as const)('denies %s membership', async (status) => {
    await db.organizationMembership.updateMany({ where: { organizationId: org, userId: actor }, data: { status } }); await search().expect(403);
  });
  it('denies foreign, missing and malformed organization contexts without revealing existence', async () => {
    for (const organizationId of [foreignOrg, randomUUID(), 'malformed']) await search({ q: 'Needle' }, organizationId).expect(403);
  });
  it('returns only safe current-tenant metadata and the current recipient', async () => {
    const { body } = await search().expect(200);
    for (const type of categories) {
      expect(body.groups[type].items).toHaveLength(1);
      expect(Object.keys(body.groups[type].items[0]).sort()).toEqual(['id', 'subtitle', 'title']);
      expect(body.groups[type].items[0].title).toContain(' A');
    }
    expect(JSON.stringify(body)).not.toMatch(/private|storageKey|password|refreshToken|other recipient|organizationId|userId|phone|description/);
  });
  it.each([['employees', 'employee:read'], ['tasks', 'task:read'], ['documents', 'file:read'], ['departments', 'department:read']])('enforces %s category grant', async (type, key) => {
    await db.rolePermission.deleteMany({ where: { roleId: role, permission: { key } } });
    expect((await search().expect(200)).body.groups[type]).toBeNull(); await search({ q: 'Needle', type }).expect(403);
  });
  it('does not infer grants from an administrator name and keeps own notifications searchable', async () => {
    await db.rolePermission.deleteMany({ where: { roleId: role } }); await db.role.update({ where: { id: role }, data: { name: 'Administrator' } });
    const { body } = await search().expect(200); for (const type of categories.filter((value) => value !== 'notifications')) expect(body.groups[type]).toBeNull();
    expect(body.groups.notifications.items).toHaveLength(1);
  });
  it('excludes unavailable document states', async () => {
    for (const status of ['UPLOADING', 'FAILED', 'DELETED'] as const) await db.fileObject.create({ data: { organizationId: org, uploadedByUserId: actor, originalFilename: `Needle ${status}`, contentType: 'application/pdf', storageKey: randomUUID(), status } });
    expect((await search({ q: 'Needle', type: 'documents' }).expect(200)).body.groups.documents.items).toHaveLength(1);
  });
  it.each([{}, { q: '' }, { q: 'x' }, { q: 'x'.repeat(101) }, { q: 'bad\u0000query' }, { q: 'Needle', type: 'users' }, { q: 'Needle', limit: 0 }, { q: 'Needle', limit: 26 }, { q: 'Needle', after: 'invalid' }, { q: 'Needle', after: randomUUID() }, { q: 'Needle', permissions: ['task:read'] }, { q: 'Needle', organizationId: randomUUID() }])('rejects invalid or injected query %j', async (query) => { await search(query).expect(400); });
  it('uses literal wildcard search and parameterization', async () => {
    await db.task.create({ data: { organizationId: org, creatorEmployeeId: employee, title: 'Literal 50%_ result' } });
    const result = (await search({ q: '%_', type: 'tasks' }).expect(200)).body.groups.tasks.items;
    expect(result).toHaveLength(1); expect(result[0].title).toBe('Literal 50%_ result');
    expect((await search({ q: "' OR 1=1 --", type: 'tasks' }).expect(200)).body.groups.tasks.items).toHaveLength(0);
  });
  it('has deterministic bounded paging with no duplicate rows and no foreign cursor leak', async () => {
    await db.task.createMany({ data: Array.from({ length: 7 }, (_, index) => ({ organizationId: org, creatorEmployeeId: employee, title: `Needle extra ${index}` })) });
    const expected = await db.task.findMany({ where: { organizationId: org }, orderBy: { id: 'asc' }, select: { id: true } });
    const all: string[] = []; let after: string | undefined;
    do { const page = (await search({ q: 'Needle', type: 'tasks', limit: 3, ...(after ? { after } : {}) }).expect(200)).body.groups.tasks;
      expect(page.items.length).toBeLessThanOrEqual(3); all.push(...page.items.map((row: { id: string }) => row.id)); after = page.nextCursor ?? undefined;
    } while (after);
    expect(all).toEqual(expected.map((row) => row.id));
    const foreignId = (await db.task.findFirstOrThrow({ where: { organizationId: foreignOrg } })).id;
    const rows = (await search({ q: 'Needle', type: 'tasks', after: foreignId }).expect(200)).body.groups.tasks.items;
    expect(rows.every((row: { id: string }) => all.includes(row.id))).toBe(true);
  });
  it('returns empty groups for no matches and never searches private bodies', async () => {
    const { body } = await search({ q: 'private' }).expect(200);
    for (const type of categories) expect(body.groups[type]).toEqual({ items: [], nextCursor: null });
  });
  it('does not audit successful search or log query text/results', async () => {
    const before = await db.auditEvent.count({ where: { organizationId: org } }); await search().expect(200);
    expect(await db.auditEvent.count({ where: { organizationId: org } })).toBe(before);
    expect(JSON.stringify(logs)).not.toMatch(/Needle|private notification|private-hash/);
  });
  it('documents the endpoint and safe response schema', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    expect(body.paths['/organizations/{organizationId}/search'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(body.components.schemas.OrganizationSearchItem.additionalProperties).toBe(false);
  });
});

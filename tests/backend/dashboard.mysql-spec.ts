// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type TaskStatus } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'dashboard-fixture-signing-key-not-production';
mysqlDescribe('Permission-aware organization dashboard', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let org: string, foreignOrg: string, actor: string, foreign: string, session: string, token: string, role: string, employee: string, department: string;
  const http = () => request(app.getHttpServer());
  const base = (id = org) => `/api/v1/organizations/${id}/dashboard`;
  const get = (id = org) => http().get(base(id)).set('Authorization', `Bearer ${token}`);
  const revoke = (permission: string) => db.rolePermission.deleteMany({ where: { roleId: role, permission: { key: permission } } });
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {}));
    await app.init();
  });
  beforeEach(async () => {
    actor = randomUUID(); foreign = randomUUID(); session = randomUUID();
    await db.user.createMany({ data: [actor, foreign].map((id) => ({ id, email: `${id}@example.test`, passwordHash: 'private-dashboard-fixture' })) });
    await db.authSession.create({ data: { id: session, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session, typ: 'access' }, secret, { expiresIn: 300 });
    const service = app.get(OrganizationsService);
    org = (await service.create(actor, { name: 'Dashboard A', slug: `dash-${randomUUID()}` })).id;
    foreignOrg = (await service.create(foreign, { name: 'Private B', slug: `dash-${randomUUID()}` })).id;
    role = (await db.role.findFirstOrThrow({ where: { organizationId: org } })).id;
    for (const key of ['task:read', 'employee:read', 'department:read', 'audit:read']) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.createMany({ data: [{ roleId: role, permissionId: permission.id }], skipDuplicates: true });
    }
    department = (await db.department.create({ data: { organizationId: org, code: 'A', name: 'Engineering' } })).id;
    await db.department.create({ data: { organizationId: org, code: 'INACTIVE', name: 'Old team', status: 'INACTIVE' } });
    employee = (await db.employee.create({ data: { organizationId: org, userId: actor, employeeCode: 'A', displayName: 'An', departmentId: department } })).id;
    await db.organizationMembership.create({ data: { organizationId: org, userId: foreign } });
    await db.employee.create({ data: { organizationId: org, userId: foreign, employeeCode: 'OLD', displayName: 'Binh', status: 'INACTIVE' } });
    const foreignEmployee = (await db.employee.create({ data: { organizationId: foreignOrg, userId: foreign, employeeCode: 'B', displayName: 'Private B' } })).id;
    await db.task.create({ data: { organizationId: foreignOrg, creatorEmployeeId: foreignEmployee, title: 'Never disclose B', dueAt: new Date('2000-01-01') } });
    const statuses: TaskStatus[] = ['TODO', 'TODO', 'IN_PROGRESS', 'IN_PROGRESS', 'DONE', 'DONE', 'CANCELLED'];
    await db.task.createMany({ data: statuses.map((status, index) => ({ organizationId: org, creatorEmployeeId: employee,
      assigneeEmployeeId: index % 3 === 0 ? employee : null, departmentId: department, title: `Task ${index}`, status,
      progressPercent: status === 'DONE' ? 100 : 0, dueAt: new Date(index % 2 === 0 ? '2000-01-01' : '3000-01-01') })) });
    await db.notification.createMany({ data: [
      { organizationId: org, recipientUserId: actor, type: 'task.assigned', title: 'Own', body: 'Own', metadata: {} },
      { organizationId: org, recipientUserId: actor, type: 'task.assigned', title: 'Own read', body: 'Own', metadata: {}, readAt: new Date() },
      { organizationId: org, recipientUserId: foreign, type: 'task.assigned', title: 'Private other recipient', body: 'Private', metadata: {} },
      { organizationId: foreignOrg, recipientUserId: foreign, type: 'task.assigned', title: 'Private B', body: 'Private', metadata: {} },
    ] });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const scope = { in: [org, foreignOrg] }, users = { in: [actor, foreign] };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: scope }, { actorUserId: users }] } });
    await db.notification.deleteMany({ where: { organizationId: scope } });
    await db.task.deleteMany({ where: { organizationId: scope } });
    await db.employee.deleteMany({ where: { organizationId: scope } });
    await db.department.deleteMany({ where: { organizationId: scope } });
    await db.membershipRole.deleteMany({ where: { organizationId: scope } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: scope } } });
    await db.role.deleteMany({ where: { organizationId: scope } });
    await db.organizationMembership.deleteMany({ where: { organizationId: scope } });
    await db.organization.deleteMany({ where: { id: scope } });
    await db.authSession.deleteMany({ where: { userId: users } });
    await db.user.deleteMany({ where: { id: users } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  it('requires JWT', async () => { await http().get(base()).expect(401); });
  it('rejects a revoked session', async () => { await db.authSession.update({ where: { id: session }, data: { revokedAt: new Date() } }); await get().expect(401); });
  it('rejects an inactive account', async () => { await db.user.update({ where: { id: actor }, data: { accountStatus: 'INACTIVE' } }); await get().expect(401); });
  it.each(['INACTIVE', 'SUSPENDED', 'REMOVED'] as const)('denies %s membership', async (status) => {
    await db.organizationMembership.updateMany({ where: { organizationId: org, userId: actor }, data: { status } }); await get().expect(403);
  });
  it('denies suspended organization', async () => { await db.organization.update({ where: { id: org }, data: { status: 'SUSPENDED' } }); await get().expect(403); });
  it('denies foreign, missing and malformed organizations identically', async () => {
    for (const id of [foreignOrg, randomUUID(), 'bad']) await get(id).expect(403);
  });
  it('uses exact full-organization counts, explicit denominators and current-recipient notifications', async () => {
    const { body } = await get().expect(200);
    expect(body.organizationId).toBe(org);
    expect(body.tasks).toMatchObject({ total: 7, byStatus: { TODO: 2, IN_PROGRESS: 2, DONE: 2, CANCELLED: 1 }, open: 4, overdue: 2, unassigned: 2, completionPercent: 33.3, health: 'ATTENTION' });
    expect(body.departments).toMatchObject({ total: 2, active: 1, inactive: 1, hasMore: false });
    expect(body.departments.items.find((row: { id: string }) => row.id === department)).toMatchObject({ employeeCount: 1, openTasks: 4 });
    expect(body.employees).toEqual({ total: 2, active: 1, inactive: 1 });
    expect(body.workload.items).toEqual([{ employeeId: employee, displayName: 'An', status: 'ACTIVE', openTasks: 2 }]);
    expect(body.notifications).toEqual({ total: 2, unread: 1 });
    expect(JSON.stringify(body)).not.toMatch(/Never disclose B|Private B|Private other recipient|private-dashboard-fixture/);
  });
  it.each([
    ['task:read', 'tasks'], ['employee:read', 'employees'], ['department:read', 'departments'], ['audit:read', 'activity'],
  ])('omits %s data without the grant', async (permission, section) => {
    await revoke(permission); const { body } = await get().expect(200); expect(body[section]).toBeNull();
    if (permission === 'task:read' || permission === 'employee:read') expect(body.workload).toBeNull();
    if (permission === 'task:read') expect(body.departments.items.every((row: { openTasks: unknown }) => row.openTasks === null)).toBe(true);
    if (permission === 'employee:read') expect(body.departments.items.every((row: { employeeCount: unknown }) => row.employeeCount === null)).toBe(true);
  });
  it('allows a member with no grants to see only their own notifications and does not grant permissions', async () => {
    await db.rolePermission.deleteMany({ where: { roleId: role } });
    await db.role.update({ where: { id: role }, data: { name: 'Administrator' } });
    const { body } = await get().expect(200);
    for (const section of ['tasks', 'employees', 'departments', 'workload', 'activity']) expect(body[section]).toBeNull();
    expect(body.notifications).toEqual({ total: 2, unread: 1 });
    expect(await db.rolePermission.count({ where: { roleId: role } })).toBe(0);
  });
  it('inactive roles do not contribute permissions', async () => {
    await db.role.update({ where: { id: role }, data: { isActive: false } }); expect((await get().expect(200)).body.tasks).toBeNull();
  });
  it.each([{ limit: 5 }, { permissions: ['task:read'] }, { roleId: 'crafted' }, { employeeId: 'foreign' }, { organizationId: 'foreign' }])('rejects unsupported query %j', async (query) => { await get().query(query).expect(400); });
  it('caps preview lists without capping counters and orders overdue by dueAt then UUID', async () => {
    const ids = Array.from({ length: 8 }, () => randomUUID()).sort();
    await db.task.createMany({ data: ids.map((id) => ({ id, organizationId: org, creatorEmployeeId: employee, title: 'Earlier task', dueAt: new Date('1999-01-01') })) });
    await db.department.createMany({ data: Array.from({ length: 12 }, (_, index) => ({ organizationId: org, code: `D${index}`, name: `Department ${index}` })) });
    const { body } = await get().expect(200);
    expect(body.tasks.total).toBe(15); expect(body.tasks.overdue).toBe(10); expect(body.tasks.overdueHasMore).toBe(true);
    expect(body.tasks.overdueItems.map((row: { id: string }) => row.id)).toEqual(ids.slice(0, 5));
    expect(body.departments.total).toBe(14); expect(body.departments.items).toHaveLength(10); expect(body.departments.hasMore).toBe(true);
    const departments = body.departments.items.map((row: { id: string }) => row.id); expect(departments).toEqual([...departments].sort());
  });
  it('distinguishes empty and cancelled-only populations without NaN or false 100%', async () => {
    await db.task.deleteMany({ where: { organizationId: org, status: { not: 'CANCELLED' } } });
    expect((await get().expect(200)).body.tasks).toMatchObject({ total: 1, open: 0, overdue: 0, completionPercent: null, health: 'EMPTY' });
    await db.task.deleteMany({ where: { organizationId: org } });
    expect((await get().expect(200)).body.tasks).toMatchObject({ total: 0, completionPercent: null, health: 'EMPTY' });
  });
  it('completed work is on track even with historical past deadlines', async () => {
    await db.task.updateMany({ where: { organizationId: org }, data: { status: 'DONE', progressPercent: 100 } });
    expect((await get().expect(200)).body.tasks).toMatchObject({ overdue: 0, open: 0, unassigned: 0, health: 'ON_TRACK', completionPercent: 100 });
  });
  it('uses a safe, ordered activity projection and successful reads create no audit', async () => {
    await db.auditEvent.deleteMany({ where: { organizationId: org } });
    const ids = Array.from({ length: 12 }, () => randomUUID()).sort().reverse();
    await db.auditEvent.createMany({ data: ids.map((id) => ({ id, organizationId: org, actorUserId: actor, event: 'task.updated', resourceType: 'task',
      outcome: 'SUCCESS', source: 'HTTP', metadata: { sensitive: 'not-for-dashboard' }, requestId: 'private-correlation', createdAt: new Date('2026-01-01T00:00:00.000Z') })) });
    const { body } = await get().expect(200);
    expect(body.activity.hasMore).toBe(true); expect(body.activity.items.map((row: { id: string }) => row.id)).toEqual(ids.slice(0, 10));
    expect(Object.keys(body.activity.items[0]).sort()).toEqual(['id', 'event', 'resourceType', 'resourceId', 'outcome', 'createdAt'].sort());
    expect(JSON.stringify(body)).not.toMatch(/not-for-dashboard|private-correlation|password|refreshToken|storageKey|actorUserId/);
    expect(await db.auditEvent.count({ where: { organizationId: org } })).toBe(12);
  });
  it('propagates operational failure instead of claiming empty statistics', async () => {
    jest.spyOn(db, '$transaction').mockRejectedValueOnce(new Error('private-database-diagnostic'));
    const { body } = await get().expect(500); expect(JSON.stringify(body)).not.toContain('private-database-diagnostic');
    expect(body.tasks).toBeUndefined();
  });
  it('publishes the additive OpenAPI schema', async () => {
    const { body } = await http().get('/api/v1/docs/openapi.json').expect(200);
    expect(body.paths['/organizations/{organizationId}/dashboard'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(body.components.schemas.Dashboard.properties.tasks.nullable).toBe(true);
  });
});

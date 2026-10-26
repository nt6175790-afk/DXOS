// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipStatus, OrganizationStatus, PrismaClient, TaskStatus, UserAccountStatus } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger, type StructuredLogRecord } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { EmployeesService } from '../../backend/src/modules/people/employees.service';
import { DepartmentsService } from '../../backend/src/modules/departments/departments.service';
import { TasksService } from '../../backend/src/modules/work/tasks.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { NotificationService } from '../../backend/src/modules/notifications/notification.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';
import { PasswordService } from '../../backend/src/modules/auth/password.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'task-test-only-secret-not-a-real-credential';
mysqlDescribe('Task V1 with real IAM, RBAC, audit and notification transactions', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  const logs: StructuredLogRecord[] = [];
  let actor: string, target: string, peer: string, foreign: string, noProfile: string, users: string[];
  let orgA: string, orgB: string, deptA: string, deptB: string, empA: string, empTarget: string, empPeer: string, empB: string;
  let taskA: string, taskB: string, session: string, token: string;
  const path = (org = orgA, id?: string) => `/api/v1/organizations/${org}/tasks${id ? '/' + id : ''}`;
  const auth = () => `Bearer ${token}`;
  const input = () => ({ title: 'New task' });
  const audits = () => db.auditEvent.count({ where: { organizationId: orgA, event: { startsWith: 'task.' } } });
  const notices = () => db.notification.findMany({ where: { organizationId: orgA, type: 'task.assigned' } });
  const patch = (body: object) => request(app.getHttpServer()).patch(path(orgA, taskA)).set('Authorization', auth()).send(body);
  const revoke = (key: string) => db.rolePermission.deleteMany({ where: { role: { organizationId: orgA }, permission: { key } } });
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('debug', (r) => logs.push(r))); await app.init();
  });
  beforeEach(async () => {
    [actor, target, peer, foreign, noProfile] = Array.from({ length: 5 }, () => randomUUID()); users = [actor, target, peer, foreign, noProfile];
    await db.user.createMany({ data: users.map((id) => ({ id, email: `${id}@example.test`, passwordHash: 'fixture-hash-never-return' })) });
    session = randomUUID(); await db.authSession.create({ data: { id: session, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session, typ: 'access' }, secret, { expiresIn: 300 });
    const orgs = app.get(OrganizationsService);
    orgA = (await orgs.create(actor, { name: 'A', slug: `a-${randomUUID()}` })).id;
    orgB = (await orgs.create(foreign, { name: 'B', slug: `b-${randomUUID()}` })).id;
    await db.organizationMembership.createMany({ data: [target, peer, noProfile].map((userId) => ({ userId, organizationId: orgA })) });
    const role = await db.role.findFirstOrThrow({ where: { organizationId: orgA } });
    for (const key of [PERMISSIONS.TASK_READ, PERMISSIONS.TASK_CREATE, PERMISSIONS.TASK_UPDATE, PERMISSIONS.TASK_ASSIGN]) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
    deptA = (await db.department.create({ data: { organizationId: orgA, code: 'A', name: 'Dept A' } })).id;
    deptB = (await db.department.create({ data: { organizationId: orgB, code: 'B', name: 'Dept B' } })).id;
    const employee = (org: string, userId: string, code: string, departmentId?: string) => db.employee.create({ data: { organizationId: org, userId, employeeCode: code, displayName: code, departmentId } });
    empA = (await employee(orgA, actor, 'ACTOR')).id; empTarget = (await employee(orgA, target, 'TARGET', deptA)).id;
    empPeer = (await employee(orgA, peer, 'PEER')).id; empB = (await employee(orgB, foreign, 'FOREIGN', deptB)).id;
    taskA = (await db.task.create({ data: { organizationId: orgA, creatorEmployeeId: empA, title: 'Task A' } })).id;
    taskB = (await db.task.create({ data: { organizationId: orgB, creatorEmployeeId: empB, title: 'Task B' } })).id;
    logs.length = 0;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const orgs = await db.organization.findMany({ where: { memberships: { some: { userId: { in: users } } } } });
    const organizationId = { in: orgs.map((r) => r.id) };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: users } }] } });
    await db.notification.deleteMany({ where: { organizationId } }); await db.task.deleteMany({ where: { organizationId } });
    await db.employee.deleteMany({ where: { organizationId } }); await db.department.deleteMany({ where: { organizationId } });
    await db.membershipRole.deleteMany({ where: { organizationId } }); await db.rolePermission.deleteMany({ where: { role: { organizationId } } });
    await db.role.deleteMany({ where: { organizationId } }); await db.organizationMembership.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } }); await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });
  function op(method: string) {
    const agent = request(app.getHttpServer()); return method === 'create' ? agent.post(path()).send(input())
      : method === 'update' ? agent.patch(path(orgA, taskA)).send({ title: 'Updated' }) : agent.get(method === 'list' ? path() : path(orgA, taskA));
  }
  describe('DXOS-INTEGRATION-001 business workflow', () => {
    async function grant(organizationId: string, keys: string[]) {
      const role = await db.role.findFirstOrThrow({ where: { organizationId } });
      for (const key of keys) {
        const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
        await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {}, create: { roleId: role.id, permissionId: permission.id } });
      }
    }
    async function login(userId: string) {
      const password = `Fixture-only-${randomUUID()}`;
      await db.user.update({ where: { id: userId }, data: { passwordHash: await app.get(PasswordService).hash(password) } });
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: `${userId}@example.test`, password }).expect(200);
      return { bearer: `Bearer ${r.body.accessToken}`, password, accessToken: r.body.accessToken, refreshToken: r.body.refreshToken };
    }
    it('runs login -> organization -> department -> people -> task -> assignment -> inbox -> audit over HTTP', async () => {
      const a = await login(actor), b = await login(target);
      const http = request(app.getHttpServer());
      const org = (await http.post('/api/v1/organizations').set('Authorization', a.bearer)
        .send({ name: 'Workflow', slug: `workflow-${randomUUID()}` }).expect(201)).body;
      const base = `/api/v1/organizations/${org.id}`;
      // Explicit operator fixtures: no public membership/grant provisioning API is invented.
      await db.organizationMembership.create({ data: { organizationId: org.id, userId: target } });
      await grant(org.id, ['department:create', 'department:read', 'employee:create', 'employee:read',
        'task:create', 'task:read', 'task:update', 'task:assign', 'audit:read']);
      await http.get(base).set('Authorization', a.bearer).expect(200);
      const dept = (await http.post(`${base}/departments`).set('Authorization', a.bearer)
        .send({ code: 'OPS', name: 'Operations' }).expect(201)).body;
      const employees = [];
      for (const [userId, code] of [[actor, 'A'], [target, 'B']]) {
        employees.push((await http.post(`${base}/employees`).set('Authorization', a.bearer)
          .send({ userId, employeeCode: code, displayName: code, departmentId: dept.id }).expect(201)).body);
      }
      const created = await http.post(`${base}/tasks`).set('Authorization', a.bearer).set('x-request-id', 'workflow-create-001')
        .send({ title: 'Private work title', description: 'Private work details', departmentId: dept.id }).expect(201);
      expect(created.headers['x-request-id']).toBe('workflow-create-001');
      expect(created.body).toMatchObject({ organizationId: org.id, creatorEmployeeId: employees[0].id,
        assigneeEmployeeId: null, departmentId: dept.id, status: 'TODO' });
      expect(await db.notification.count({ where: { organizationId: org.id } })).toBe(0);
      const taskPath = `${base}/tasks/${created.body.id}`;
      await http.patch(taskPath).set('Authorization', a.bearer).set('x-request-id', 'workflow-assign-001')
        .send({ assigneeEmployeeId: employees[1].id }).expect(200);
      const read = await http.get(taskPath).set('Authorization', a.bearer).expect(200);
      expect(read.body).toMatchObject({ creatorEmployeeId: employees[0].id, assigneeEmployeeId: employees[1].id, departmentId: dept.id });
      await http.patch(taskPath).set('Authorization', a.bearer).set('x-request-id', 'workflow-title-001')
        .send({ title: 'Private revised title' }).expect(200);
      const repeat = await http.patch(taskPath).set('Authorization', a.bearer).set('x-request-id', 'workflow-noop-001')
        .send({ assigneeEmployeeId: employees[1].id }).expect(200);
      const inbox = await http.get(`${base}/notifications`).set('Authorization', b.bearer).expect(200);
      expect(inbox.body.items).toHaveLength(1);
      const notice = inbox.body.items[0];
      expect(notice).toMatchObject({ organizationId: org.id, recipientUserId: target, type: 'task.assigned',
        title: 'Task assigned', body: 'A task was assigned to you.', metadata: { taskId: created.body.id }, isRead: false });
      await http.patch(`${base}/notifications/${notice.id}/read`).set('Authorization', b.bearer).send({}).expect(200);
      await http.get(taskPath).set('Authorization', b.bearer).expect(403);
      await http.get(`${base}/audit-logs`).set('Authorization', b.bearer).expect(403);
      const audit = await http.get(`${base}/audit-logs`).set('Authorization', a.bearer).query({ limit: 100 }).expect(200);
      const events = audit.body.items.filter((e: { event: string }) => e.event.startsWith('task.') || e.event === 'notification.created');
      expect(events).toHaveLength(5);
      for (const event of events) {
        expect(event).toMatchObject({ actorUserId: actor, organizationId: org.id, outcome: 'SUCCESS', source: 'HTTP' });
        expect(Buffer.byteLength(JSON.stringify(event.metadata))).toBeLessThanOrEqual(1024);
        expect(event.requestId).toBe(event.event === 'task.created' ? 'workflow-create-001'
          : event.metadata.changedFields?.[0] === 'title' ? 'workflow-title-001' : 'workflow-assign-001');
        expect(event.resourceId).toBe(event.event === 'notification.created' ? notice.id : created.body.id);
      }
      expect(events.map((e: { event: string }) => e.event).sort()).toEqual(
        ['notification.created', 'task.assigned', 'task.created', 'task.updated', 'task.updated']);
      expect(await db.auditEvent.count({ where: { requestId: 'workflow-noop-001' } })).toBe(0);
      const docs = (await http.get('/api/v1/docs/openapi.json').expect(200)).body;
      for (const [name, body] of [['Department', dept], ['Employee', employees[0]], ['Task', repeat.body], ['Notification', notice]] as const) {
        expect(Object.keys(body).sort()).toEqual(Object.keys(docs.components.schemas[name].properties).sort());
      }
      for (const value of [a.password, a.accessToken, a.refreshToken, b.password, b.accessToken, b.refreshToken,
        'passwordHash', 'Private work', 'Private revised']) expect(JSON.stringify({ events, notice, logs })).not.toContain(value);
    });
    it('preserves actor, tenant and correlation across concurrent requests from different organizations', async () => {
      const foreignLogin = await login(foreign);
      await grant(orgB, ['task:create', 'task:assign', 'task:read', 'task:update']);
      const responses = await Promise.all([
        request(app.getHttpServer()).post(path()).set('Authorization', auth()).set('x-request-id', 'parallel-tenant-a')
          .send({ title: 'A concurrent', assigneeEmployeeId: empTarget, departmentId: deptA }).expect(201),
        request(app.getHttpServer()).post(path(orgB)).set('Authorization', foreignLogin.bearer).set('x-request-id', 'parallel-tenant-b')
          .send({ title: 'B concurrent', assigneeEmployeeId: empB, departmentId: deptB }).expect(201),
      ]);
      for (const [index, requestId, organizationId, actorUserId, count] of [
        [0, 'parallel-tenant-a', orgA, actor, 3], [1, 'parallel-tenant-b', orgB, foreign, 2],
      ] as const) {
        const events = await db.auditEvent.findMany({ where: { requestId } });
        expect(events).toHaveLength(count);
        expect(events.every((e) => e.organizationId === organizationId && e.actorUserId === actorUserId)).toBe(true);
        expect(responses[index].body.organizationId).toBe(organizationId);
      }
      expect(await db.notification.count({ where: { organizationId: orgB } })).toBe(0);
      expect(await notices()).toHaveLength(1);
    });
    it('rejects foreign task URLs even for an authorized operator of each tenant without side effects', async () => {
      const b = await login(foreign);
      await grant(orgB, ['task:read', 'task:update']);
      const before = await db.auditEvent.count({ where: { organizationId: { in: [orgA, orgB] } } });
      for (const [org, id, bearer] of [[orgA, taskB, auth()], [orgB, taskA, b.bearer]]) {
        await request(app.getHttpServer()).get(path(org, id)).set('Authorization', bearer).expect(404);
        await request(app.getHttpServer()).patch(path(org, id)).set('Authorization', bearer).send({ title: 'Escape' }).expect(404);
      }
      for (const fields of [{ assigneeEmployeeId: empB }, { departmentId: deptB }]) {
        await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'Escape', ...fields }).expect(404);
        await patch(fields).expect(404);
      }
      expect(await db.auditEvent.count({ where: { organizationId: { in: [orgA, orgB] } } })).toBe(before);
      expect(await db.notification.count({ where: { organizationId: { in: [orgA, orgB] } } })).toBe(0);
      expect((await db.task.findUniqueOrThrow({ where: { id: taskA } })).title).toBe('Task A');
      expect((await db.task.findUniqueOrThrow({ where: { id: taskB } })).title).toBe('Task B');
    });
    it('rejects same-tenant creator impersonation without a task, notice or success audit', async () => {
      const before = await db.task.count({ where: { organizationId: orgA } });
      await request(app.getHttpServer()).post(path()).set('Authorization', auth())
        .send({ title: 'Spoof', creatorEmployeeId: empTarget, assigneeEmployeeId: empTarget }).expect(400);
      await patch({ creatorEmployeeId: empTarget }).expect(400);
      expect(await db.task.count({ where: { organizationId: orgA } })).toBe(before);
      expect(await audits()).toBe(0); expect(await notices()).toHaveLength(0);
    });
    it('rolls back assignment when notification audit fails after the notification row is written', async () => {
      const audit = app.get(AuditService), original = audit.record.bind(audit);
      jest.spyOn(audit, 'record').mockImplementation(async (...args) => {
        if (args[0].event === 'notification.created') throw new Error('notification audit unavailable');
        return original(...args);
      });
      await patch({ assigneeEmployeeId: empTarget }).expect(500);
      expect((await db.task.findUniqueOrThrow({ where: { id: taskA } })).assigneeEmployeeId).toBeNull();
      expect(await audits()).toBe(0); expect(await notices()).toHaveLength(0);
      expect(await db.auditEvent.count({ where: { organizationId: orgA, event: 'notification.created' } })).toBe(0);
    });
    it('assignment persistence failure leaves the task, notification and audit unchanged', async () => {
      const before = await db.task.findUniqueOrThrow({ where: { id: taskA } });
      const failing = db.$extends({ query: { task: { async update() { throw new Error('assignment persistence unavailable'); } } } });
      const service = new TasksService(failing as unknown as PrismaService, app.get(AuthorizationService), app.get(AuditService),
        app.get(EmployeesService), app.get(DepartmentsService), app.get(NotificationService));
      await expect(service.update(actor, orgA, taskA, { assigneeEmployeeId: empTarget })).rejects.toThrow('assignment persistence unavailable');
      expect(await db.task.findUniqueOrThrow({ where: { id: taskA } })).toEqual(before);
      expect(await audits()).toBe(0); expect(await notices()).toHaveLength(0);
    });
    it.each(['creatorEmployeeId', 'assigneeEmployeeId', 'departmentId'])('database rejects cross-tenant update of %s', async (field) => {
      const before = await db.task.findUniqueOrThrow({ where: { id: taskA } });
      await expect(db.task.update({ where: { id: taskA }, data: { [field]: field === 'departmentId' ? deptB : empB } }))
        .rejects.toMatchObject({ code: 'P2003' });
      expect(await db.task.findUniqueOrThrow({ where: { id: taskA } })).toEqual(before);
    });
  });
  it.each(['list', 'get', 'create', 'update'])('requires valid JWT for %s', async (method) => {
    for (const credential of [undefined, 'invalid', sign({ sub: actor, sid: session, typ: 'access' }, secret, { expiresIn: -1 })]) {
      const req = op(method); if (credential) req.set('Authorization', `Bearer ${credential}`);
      const r = await req.expect(401); expect(r.body.error.code).toBe('UNAUTHORIZED');
    }
  });
  it.each(['revoked', 'expired', 'missing'])('rejects %s server session', async (state) => {
    if (state === 'missing') await db.authSession.delete({ where: { id: session } });
    else await db.authSession.update({ where: { id: session }, data: state === 'revoked' ? { revokedAt: new Date() } : { expiresAt: new Date(0) } });
    for (const method of ['list', 'get', 'create', 'update']) await op(method).set('Authorization', auth()).expect(401);
  });
  it.each([UserAccountStatus.INACTIVE, UserAccountStatus.SUSPENDED])('rejects actor %s', async (accountStatus) => {
    await db.user.update({ where: { id: actor }, data: { accountStatus } });
    for (const method of ['list', 'get', 'create', 'update']) await op(method).set('Authorization', auth()).expect(401);
  });
  it.each([MembershipStatus.INACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.REMOVED])('rejects actor membership %s', async (status) => {
    await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId: actor }, data: { status } });
    for (const method of ['list', 'get', 'create', 'update']) await op(method).set('Authorization', auth()).expect(403);
  });
  it.each([OrganizationStatus.SUSPENDED, OrganizationStatus.ARCHIVED])('rejects organization %s', async (status) => {
    await db.organization.update({ where: { id: orgA }, data: { status } }); await op('create').set('Authorization', auth()).expect(403);
    await op('list').set('Authorization', auth()).expect(403);
  });
  it.each([['list', PERMISSIONS.TASK_READ], ['get', PERMISSIONS.TASK_READ], ['create', PERMISSIONS.TASK_CREATE], ['update', PERMISSIONS.TASK_UPDATE]])('requires grant for %s', async (method, key) => {
    await revoke(key); await op(method).set('Authorization', auth()).expect(403);
  });
  it('new owner bootstrap has no Task grants', async () => {
    const org = await app.get(OrganizationsService).create(actor, { name: 'New', slug: `new-${randomUUID()}` });
    await request(app.getHttpServer()).get(path(org.id)).set('Authorization', auth()).expect(403);
    const grants = await db.rolePermission.findMany({ where: { role: { organizationId: org.id } }, include: { permission: true } });
    expect(grants.map((r) => r.permission.key).sort()).toEqual(['organization:read', 'organization:update']);
  });
  it('inactive roles and creator identity do not grant access', async () => {
    await db.role.updateMany({ where: { organizationId: orgA }, data: { isActive: false, key: 'SUPER_ADMIN' } });
    await op('get').set('Authorization', auth()).expect(403);
  });
  it('creates defaults and derives creator without credential or content leakage', async () => {
    const r = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).set('x-request-id', 'task-create-1234').send({ title: ' New task ' }).expect(201);
    expect(r.body).toEqual({ id: expect.any(String), organizationId: orgA, creatorEmployeeId: empA, assigneeEmployeeId: null, departmentId: null,
      title: 'New task', description: null, status: 'TODO', progressPercent: 0, priority: 'MEDIUM', dueAt: null, createdAt: expect.any(String), updatedAt: expect.any(String) });
    const event = await db.auditEvent.findFirstOrThrow({ where: { resourceId: r.body.id } });
    expect(event).toMatchObject({ event: 'task.created', organizationId: orgA, actorUserId: actor, resourceType: 'task', outcome: 'SUCCESS', source: 'HTTP', requestId: 'task-create-1234', metadata: {} });
    for (const value of [token, secret, 'passwordHash', 'fixture-hash-never-return', 'refreshToken']) expect(JSON.stringify({ r: r.body, logs, event })).not.toContain(value);
    expect(await notices()).toHaveLength(0);
  });
  it.each(['missing', 'inactive'])('rejects %s creator profile without creating identity', async (kind) => {
    if (kind === 'missing') { await db.task.delete({ where: { id: taskA } }); await db.employee.delete({ where: { id: empA } }); }
    else await db.employee.update({ where: { id: empA }, data: { status: 'INACTIVE' } });
    const count = await db.employee.count(); await op('create').set('Authorization', auth()).expect(kind === 'missing' ? 404 : 409);
    expect(await db.employee.count()).toBe(count); expect(await audits()).toBe(0);
  });
  it('requires task:assign for non-null assignee at create, but not null', async () => {
    await revoke(PERMISSIONS.TASK_ASSIGN);
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'Denied', assigneeEmployeeId: empTarget }).expect(403);
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'Unassigned', assigneeEmployeeId: null }).expect(201);
    expect(await notices()).toHaveLength(0);
  });
  it('creates assignment and notification in the correct tenant with fixed safe content', async () => {
    const r = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'Sensitive title', description: 'Sensitive description',
      assigneeEmployeeId: empTarget, departmentId: deptA, priority: 'HIGH', dueAt: '2026-09-10T10:00:00+07:00' }).expect(201);
    expect(r.body).toMatchObject({ creatorEmployeeId: empA, assigneeEmployeeId: empTarget, departmentId: deptA, dueAt: '2026-09-10T03:00:00.000Z', priority: 'HIGH' });
    const rows = await notices(); expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organizationId: orgA, recipientUserId: target, type: 'task.assigned', title: 'Task assigned', body: 'A task was assigned to you.', metadata: { taskId: r.body.id } });
    const events = await db.auditEvent.findMany({ where: { organizationId: orgA, event: { in: ['task.created', 'task.assigned', 'notification.created'] } } });
    expect(events).toHaveLength(3); expect(events.every((e) => e.actorUserId === actor)).toBe(true);
    expect(JSON.stringify({ rows, events })).not.toContain('Sensitive');
  });
  it('does not grant permissions or modify identity records when creating Tasks', async () => {
    const snapshot = async () => Promise.all([db.user.count(), db.employee.count(), db.organizationMembership.count(), db.role.count(), db.permission.count(), db.rolePermission.count(), db.membershipRole.count(), db.authSession.count()]);
    const before = await snapshot(); await op('create').set('Authorization', auth()).expect(201); expect(await snapshot()).toEqual(before);
  });
  it.each(['creatorEmployeeId', 'createdByMembershipId', 'creatorUserId', 'organizationId', 'organization_id', 'roles', 'permissions', 'id', 'createdAt', 'status'])('rejects creation injection %s', async (key) => {
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'Bad', [key]: empB }).expect(400); expect(await audits()).toBe(0);
  });
  it('rejects foreign/missing assignees and User IDs on create and update', async () => {
    for (const id of [empB, randomUUID(), target, noProfile]) {
      await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'Bad', assigneeEmployeeId: id }).expect(404);
      await patch({ assigneeEmployeeId: id }).expect(404);
    }
    expect(await notices()).toHaveLength(0);
  });
  it.each(['employee', 'membership', 'user'])('rejects ineligible assignee %s', async (kind) => {
    if (kind === 'employee') await db.employee.update({ where: { id: empTarget }, data: { status: 'INACTIVE' } });
    if (kind === 'membership') await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId: target }, data: { status: 'SUSPENDED' } });
    if (kind === 'user') await db.user.update({ where: { id: target }, data: { accountStatus: 'INACTIVE' } });
    await patch({ assigneeEmployeeId: empTarget }).expect(409);
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'Bad', assigneeEmployeeId: empTarget }).expect(409);
    expect(await audits()).toBe(0); expect(await notices()).toHaveLength(0);
  });
  it('rejects cross-tenant or inactive new departments and permits cross-department collaboration', async () => {
    for (const id of [deptB, randomUUID()]) {
      await patch({ departmentId: id }).expect(404);
      await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'Bad', departmentId: id }).expect(404);
    }
    await db.department.update({ where: { id: deptA }, data: { status: 'INACTIVE' } }); await patch({ departmentId: deptA }).expect(409);
    const other = await db.department.create({ data: { organizationId: orgA, code: 'OTHER', name: 'Other' } });
    await patch({ departmentId: other.id, assigneeEmployeeId: empTarget }).expect(200);
  });
  it('returns identical 404 for missing/foreign task IDs', async () => {
    for (const id of [taskB, randomUUID()]) {
      for (const method of ['get', 'patch'] as const) {
        const req = request(app.getHttpServer())[method](path(orgA, id)).set('Authorization', auth()).set('x-request-id', 'task-tampering-1234');
        if (method === 'patch') req.send({ title: 'Bad' });
        const r = await req.expect(404); expect(r.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'The requested resource was not found.', details: {}, requestId: 'task-tampering-1234' } });
      }
    }
    expect((await db.task.findUniqueOrThrow({ where: { id: taskB } })).title).toBe('Task B');
  });
  it('tenant URL cannot be overridden by body, query or headers', async () => {
    for (const org of [orgB, randomUUID(), 'bad']) {
      await request(app.getHttpServer()).get(path(org, taskA)).set('Authorization', auth()).set('x-organization-id', orgA).expect(403);
      await request(app.getHttpServer()).patch(path(org, taskA)).set('Authorization', auth()).query({ organizationId: orgA }).send({ title: 'Bad', organizationId: orgA }).expect(403);
    }
  });
  it('task:update alone cannot assign, unassign or repeat the current assignee', async () => {
    await revoke(PERMISSIONS.TASK_ASSIGN);
    for (const id of [empTarget, null]) await patch({ assigneeEmployeeId: id }).expect(403);
    await patch({ title: 'Allowed' }).expect(200);
  });
  it('assignment-only requires no task:update/read but mixed content requires both', async () => {
    await revoke(PERMISSIONS.TASK_UPDATE); await revoke(PERMISSIONS.TASK_READ);
    await patch({ assigneeEmployeeId: empTarget }).expect(200);
    await patch({ assigneeEmployeeId: null }).expect(200);
    await patch({ assigneeEmployeeId: empPeer, title: 'Mixed' }).expect(403);
    await patch({ title: 'Content' }).expect(403);
    await op('get').set('Authorization', auth()).expect(403);
  });
  it('updates all content fields and clears nullable fields without modifying creator', async () => {
    const r = await patch({ title: ' Updated ', description: ' First\n\tsecond ', priority: 'URGENT', departmentId: deptA,
      status: 'IN_PROGRESS', dueAt: '2000-01-01T01:00:00.123+01:00' }).set('x-request-id', 'task-update-1234').expect(200);
    expect(r.body).toMatchObject({ title: 'Updated', description: 'First\n\tsecond', priority: 'URGENT', departmentId: deptA,
      status: 'IN_PROGRESS', dueAt: '2000-01-01T00:00:00.123Z', creatorEmployeeId: empA });
    const event = await db.auditEvent.findFirstOrThrow({ where: { resourceId: taskA, event: 'task.updated' } });
    expect(event).toMatchObject({ actorUserId: actor, requestId: 'task-update-1234', metadata: { changedFields: ['title', 'description', 'departmentId', 'status', 'priority', 'dueAt'] } });
    const cleared = await patch({ description: null, departmentId: null, dueAt: null }).expect(200);
    expect(cleared.body).toMatchObject({ description: null, departmentId: null, dueAt: null, creatorEmployeeId: empA });
  });
  it.each(Object.values(TaskStatus).flatMap((from) => Object.values(TaskStatus).map((to) => ({ from, to }))))('lifecycle $from -> $to', async ({ from, to }) => {
    await db.task.update({ where: { id: taskA }, data: { status: from, progressPercent: from === 'DONE' ? 100 : 0 } });
    const valid = from === to || from === 'TODO' || from === 'IN_PROGRESS';
    await patch({ status: to }).expect(valid ? 200 : 409);
    expect((await db.task.findUniqueOrThrow({ where: { id: taskA } })).status).toBe(valid ? to : from);
    expect(await audits()).toBe(valid && from !== to ? 2 : 0);
  });
  it.each(['DONE', 'CANCELLED'] as const)('terminal %s rejects content/assignment edits', async (status) => {
    await db.task.update({ where: { id: taskA }, data: { status } });
    for (const body of [{ title: 'Edited' }, { assigneeEmployeeId: empTarget }, { priority: 'LOW' }, { departmentId: deptA }]) await patch(body).expect(409);
    expect(await notices()).toHaveLength(0); expect(await audits()).toBe(0);
  });
  it('normalizes equivalent due timestamp and title into a no-op', async () => {
    const before = await db.task.update({ where: { id: taskA }, data: { dueAt: new Date('2026-09-10T00:00:00.000Z') } });
    const r = await patch({ title: ' Task A ', dueAt: '2026-09-10T07:00:00+07:00' }).expect(200);
    expect(r.body.updatedAt).toBe(before.updatedAt.toISOString()); expect(await audits()).toBe(0);
  });
  it('preserves historical inactive references on unrelated edits', async () => {
    await db.task.update({ where: { id: taskA }, data: { assigneeEmployeeId: empTarget, departmentId: deptA } });
    await db.employee.update({ where: { id: empTarget }, data: { status: 'INACTIVE' } });
    await db.employee.update({ where: { id: empA }, data: { status: 'INACTIVE' } });
    await db.department.update({ where: { id: deptA }, data: { status: 'INACTIVE' } });
    const r = await patch({ title: 'History', assigneeEmployeeId: empTarget, departmentId: deptA }).expect(200);
    expect(r.body).toMatchObject({ assigneeEmployeeId: empTarget, departmentId: deptA, creatorEmployeeId: empA });
    await patch({ assigneeEmployeeId: null, departmentId: null }).expect(200);
  });
  it('suppresses self/unassigned/unchanged/ordinary-edit notices; reassignments notify new recipient only', async () => {
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'Self', assigneeEmployeeId: empA }).expect(201);
    expect(await notices()).toHaveLength(0);
    await patch({ assigneeEmployeeId: empTarget }).expect(200); await patch({ assigneeEmployeeId: empTarget }).expect(200);
    await patch({ title: 'Ordinary edit' }).expect(200); expect(await notices()).toHaveLength(1);
    await patch({ assigneeEmployeeId: empPeer }).expect(200); await patch({ assigneeEmployeeId: null }).expect(200);
    expect((await notices()).map((r) => r.recipientUserId).sort()).toEqual([target, peer].sort());
  });
  it('concurrent identical assignment commits one notification', async () => {
    const responses = await Promise.all([1, 2].map(() => patch({ assigneeEmployeeId: empTarget })));
    expect(responses.map((r) => r.status)).toEqual([200, 200]); expect(await notices()).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: 'task.assigned' } })).toBe(1);
  });
  it('notification recipient does not gain task:read from assignment', async () => {
    await patch({ assigneeEmployeeId: empTarget }).expect(200);
    const sid = randomUUID(); await db.authSession.create({ data: { id: sid, userId: target, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    const recipientToken = sign({ sub: target, sid, typ: 'access' }, secret, { expiresIn: 300 });
    await request(app.getHttpServer()).get(path(orgA, taskA)).set('Authorization', `Bearer ${recipientToken}`).expect(403);
    const r = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/notifications`).set('Authorization', `Bearer ${recipientToken}`).expect(200);
    expect(r.body.items).toHaveLength(1); expect(r.body.items[0].metadata).toEqual({ taskId: taskA });
  });
  it.each([{ title: '' }, { title: null }, { title: 'x'.repeat(201) }, { title: 'x\u0000y' }, { description: '' },
    { description: 'x'.repeat(10001) }, { description: 'a\rb' }, { assigneeEmployeeId: 'bad' }, { departmentId: 'bad' },
    { priority: 'NORMAL' }, { priority: null }, { dueAt: '2026-02-30T10:00:00Z' }, { dueAt: '2026-01-01' }, { dueAt: 1 }])('validates create %j', async (fields) => {
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), ...fields }).expect(400);
  });
  it.each([{}, { title: null }, { status: null }, { status: 'REOPENED' }, { creatorEmployeeId: 'other' }, { organizationId: 'other' },
    { id: 'other' }, { createdAt: 'yesterday' }, { permissions: [] }, { dueAt: '' }])('rejects invalid or immutable update %j', async (body) => {
    await patch(body).expect(400); expect(await audits()).toBe(0);
  });
  it('accepts maximum strings and past due dates', async () => {
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'x'.repeat(200), description: 'd'.repeat(10000), dueAt: '1000-01-01T00:00:00Z' }).expect(201);
  });
  it('tenant keyset pagination and each filter return only matching tasks', async () => {
    const extra = await db.task.create({ data: { organizationId: orgA, creatorEmployeeId: empA, assigneeEmployeeId: empTarget, departmentId: deptA,
      title: 'Extra', status: 'IN_PROGRESS', priority: 'HIGH' } });
    const first = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ limit: 1 }).expect(200);
    const second = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ limit: 1, after: first.body.nextCursor }).expect(200);
    expect([first.body.items[0].id, second.body.items[0].id]).toEqual([taskA, extra.id].sort()); expect(second.body.nextCursor).toBeNull();
    for (const query of [{ status: 'IN_PROGRESS' }, { priority: 'HIGH' }, { assigneeEmployeeId: empTarget }, { departmentId: deptA },
      { status: 'IN_PROGRESS', priority: 'HIGH', assigneeEmployeeId: empTarget, departmentId: deptA }]) {
      const r = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query(query).expect(200);
      expect(r.body.items.map((row: { id: string }) => row.id)).toEqual([extra.id]);
    }
    for (const query of [{ departmentId: deptB }, { assigneeEmployeeId: empB }, { departmentId: randomUUID() }]) {
      const r = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query(query).expect(200);
      expect(r.body).toEqual({ items: [], nextCursor: null });
    }
    const cursor = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ after: taskB }).expect(200);
    expect(cursor.body.items.every((r: { organizationId: string }) => r.organizationId === orgA)).toBe(true);
  });
  it('default 25 and maximum 100 bound page size', async () => {
    await db.task.createMany({ data: Array.from({ length: 100 }, () => ({ organizationId: orgA, creatorEmployeeId: empA, title: 'Batch' })) });
    const first = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).expect(200); expect(first.body.items).toHaveLength(25);
    const max = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ limit: 100 }).expect(200); expect(max.body.items).toHaveLength(100);
  });
  it.each([{ limit: 0 }, { limit: 101 }, { limit: '1.5' }, { limit: ['1', '2'] }, { after: 'bad' }, { status: 'todo' },
    { priority: 'normal' }, { assigneeEmployeeId: 'bad' }, { departmentId: 'bad' }, { organizationId: 'other' }, { sort: 'dueAt' }])('rejects invalid query %j', async (query) => {
    await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query(query).expect(400);
  });
  it('rejects malformed detail UUID and unsupported detail query', async () => {
    await request(app.getHttpServer()).get(path(orgA, 'bad')).set('Authorization', auth()).expect(400);
    await request(app.getHttpServer()).get(path(orgA, taskA)).set('Authorization', auth()).query({ creator: empB }).expect(400);
  });
  it('rejects malformed JSON/arrays/non-JSON and limits decoded input to 64 KiB', async () => {
    for (const raw of ['{', '[]', 'null']) await request(app.getHttpServer()).post(path()).set('Authorization', auth()).type('json').send(raw).expect(400);
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).type('form').send(input()).expect(400);
    const payload = JSON.stringify({ title: 'x'.repeat(65536) });
    const r = await request(app.getHttpServer()).post(path().toUpperCase()).set('Authorization', auth()).type('json').send(payload).expect(413);
    expect(r.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    const compressed = request(app.getHttpServer()).post(path()).set('Authorization', auth()).type('json').set('Content-Encoding', 'gzip');
    compressed.write(gzipSync(payload)); await compressed.expect(413);
  });
  it.each(['create', 'update'])('audit failure rolls back %s', async (method) => {
    jest.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('audit failure'));
    await op(method).set('Authorization', auth()).expect(500);
    expect(await db.task.count({ where: { organizationId: orgA } })).toBe(1); expect(await audits()).toBe(0);
    expect((await db.task.findUniqueOrThrow({ where: { id: taskA } })).title).toBe('Task A');
  });
  it.each(['create', 'update'])('notification failure rolls back task and audits on %s', async (method) => {
    jest.spyOn(app.get(NotificationService), 'createForRecipient').mockRejectedValueOnce(new Error('notification failure'));
    if (method === 'create') await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ title: 'New', assigneeEmployeeId: empTarget }).expect(500);
    else await patch({ assigneeEmployeeId: empTarget }).expect(500);
    expect(await db.task.count({ where: { organizationId: orgA } })).toBe(1); expect(await audits()).toBe(0); expect(await notices()).toHaveLength(0);
    expect((await db.task.findUniqueOrThrow({ where: { id: taskA } })).assigneeEmployeeId).toBeNull();
  });
  it('post-notification failure rolls back already-written notification and audit', async () => {
    const notifications = app.get(NotificationService); const original = notifications.createForRecipient.bind(notifications);
    jest.spyOn(notifications, 'createForRecipient').mockImplementationOnce(async (...args) => { await original(...args); throw new Error('after notice'); });
    await patch({ assigneeEmployeeId: empTarget }).expect(500); expect(await notices()).toHaveLength(0); expect(await audits()).toBe(0);
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: 'notification.created' } })).toBe(0);
  });
  it('persistence failure emits no success audit', async () => {
    const failing = db.$extends({ query: { task: { async create() { throw new Error('persistence failure'); } } } });
    const service = new TasksService(failing as unknown as PrismaService, app.get(AuthorizationService), app.get(AuditService),
      app.get(EmployeesService), app.get(DepartmentsService), app.get(NotificationService));
    await expect(service.create(actor, orgA, input())).rejects.toThrow('persistence failure'); expect(await audits()).toBe(0);
  });
  it.each(['list', 'get', 'create', 'update'])('rechecks actor membership after guard on %s', async (method) => {
    const authorization = app.get(AuthorizationService); const original = authorization.can.bind(authorization);
    jest.spyOn(authorization, 'can').mockImplementationOnce(async (...args) => {
      const allowed = await original(...args); await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId: actor }, data: { status: 'SUSPENDED' } }); return allowed;
    });
    await op(method).set('Authorization', auth()).expect(403); expect(await audits()).toBe(0);
  });
  it('rechecks task:assign inside transaction after guard grant revocation', async () => {
    const authorization = app.get(AuthorizationService); const original = authorization.can.bind(authorization);
    jest.spyOn(authorization, 'can').mockImplementationOnce(async (...args) => { const allowed = await original(...args); await revoke(PERMISSIONS.TASK_ASSIGN); return allowed; });
    await patch({ assigneeEmployeeId: empTarget }).expect(403); expect(await notices()).toHaveLength(0);
  });
  it.each(['employee', 'department'])('checks target %s changed after guard', async (kind) => {
    const authorization = app.get(AuthorizationService); const original = authorization.can.bind(authorization);
    jest.spyOn(authorization, 'can').mockImplementationOnce(async (...args) => {
      const allowed = await original(...args);
      if (kind === 'employee') await db.employee.update({ where: { id: empTarget }, data: { status: 'INACTIVE' } });
      else await db.department.update({ where: { id: deptA }, data: { status: 'INACTIVE' } }); return allowed;
    });
    await patch(kind === 'employee' ? { assigneeEmployeeId: empTarget } : { departmentId: deptA }).expect(409);
  });
  it('database composite foreign keys reject tenant escapes and preserve referenced history', async () => {
    for (const fields of [{ creatorEmployeeId: empB }, { assigneeEmployeeId: empB }, { departmentId: deptB }]) {
      await expect(db.task.create({ data: { organizationId: orgA, creatorEmployeeId: empA, title: 'Bad', ...fields } })).rejects.toMatchObject({ code: 'P2003' });
    }
    await expect(db.employee.delete({ where: { id: empA } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('OpenAPI documents creator rejection, filters, field grants and terminal lifecycle', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    const collection = body.paths['/organizations/{organizationId}/tasks'], detail = body.paths['/organizations/{organizationId}/tasks/{taskId}'];
    for (const op of [collection.get, collection.post, detail.get, detail.patch]) { expect(op.security).toEqual([{ bearerAuth: [] }]); for (const code of ['400', '401', '403', '404', '409', '500']) expect(op.responses[code]).toBeDefined(); }
    expect(detail.patch['x-permission-matrix'].assignmentOnly).toEqual(['task:assign']);
    expect(collection.get.parameters.map((p: { name: string }) => p.name).sort()).toEqual(['after', 'assigneeEmployeeId', 'departmentId', 'limit', 'priority', 'status']);
    expect(body.components.schemas.CreateTask.additionalProperties).toBe(false);
    expect(body.components.schemas.CreateTask.properties.creatorEmployeeId).toBeUndefined();
    expect(body.components.schemas.Task.properties.creatorEmployeeId.format).toBe('uuid');
    expect(body.components.schemas.Task.properties.createdByMembershipId).toBeUndefined();
    expect(body.components.schemas.Notification.properties.type.enum).toContain('task.assigned');
  });
});


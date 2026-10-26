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
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'task-planning-fixture-secret-not-production';
const permissionKeys = ['task:read', 'task:update', 'task:assign', 'employee:read'];

mysqlDescribe('DXOS-FEATURE-EXPANSION-001 tenant-safe Task planning', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string, foreign: string, org: string, foreignOrg: string, employee: string, reviewer: string;
  let task: string, otherTask: string, foreignTask: string, role: string, session: string, token: string;
  const base = (organizationId = org, taskId = task) => `/api/v1/organizations/${organizationId}/tasks/${taskId}`;
  const http = () => request(app.getHttpServer());
  const auth = () => `Bearer ${token}`;
  const planning = (organizationId = org, taskId = task) => http().get(`${base(organizationId, taskId)}/planning`).set('Authorization', auth());
  const activity = (query = {}) => http().get(`${base()}/activity`).set('Authorization', auth()).query(query);
  const createItem = (body: object = { title: 'Thiết kế màn hình' }, taskId = task) => http().post(`${base(org, taskId)}/checklist`).set('Authorization', auth()).send(body);
  const setReviewer = (body: object, taskId = task) => http().patch(`${base(org, taskId)}/planning/reviewer`).set('Authorization', auth()).send(body);
  const revoke = (key: string) => db.rolePermission.deleteMany({ where: { roleId: role, permission: { key } } });
  const events = () => db.auditEvent.findMany({ where: { organizationId: org, resourceType: 'task', resourceId: task }, orderBy: { id: 'asc' } });

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {}));
    await app.init();
  });
  beforeEach(async () => {
    actor = randomUUID(); foreign = randomUUID(); session = randomUUID();
    await db.user.createMany({ data: [actor, foreign].map((id) => ({ id, email: `${id}@example.test`, displayName: `User-${id.slice(0, 5)}`, passwordHash: 'private-fixture-hash' })) });
    await db.authSession.create({ data: { id: session, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session, typ: 'access' }, secret, { expiresIn: 300 });
    const organizations = app.get(OrganizationsService);
    org = (await organizations.create(actor, { name: 'Organization A', slug: `planning-a-${randomUUID()}` })).id;
    foreignOrg = (await organizations.create(foreign, { name: 'Organization B', slug: `planning-b-${randomUUID()}` })).id;
    role = (await db.role.findFirstOrThrow({ where: { organizationId: org } })).id;
    for (const key of permissionKeys) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role, permissionId: permission.id } });
    }
    await db.organizationMembership.create({ data: { organizationId: org, userId: foreign } });
    employee = (await db.employee.create({ data: { organizationId: org, userId: actor, employeeCode: 'ACTOR', displayName: 'Người tạo' } })).id;
    reviewer = (await db.employee.create({ data: { organizationId: org, userId: foreign, employeeCode: 'REVIEWER', displayName: 'Người kiểm tra' } })).id;
    const foreignEmployee = (await db.employee.create({ data: { organizationId: foreignOrg, userId: foreign, employeeCode: 'FOREIGN', displayName: 'Foreign' } })).id;
    task = (await db.task.create({ data: { organizationId: org, creatorEmployeeId: employee, title: 'Task A' } })).id;
    otherTask = (await db.task.create({ data: { organizationId: org, creatorEmployeeId: employee, title: 'Task A2' } })).id;
    foreignTask = (await db.task.create({ data: { organizationId: foreignOrg, creatorEmployeeId: foreignEmployee, title: 'Task B' } })).id;
  });
  afterEach(async () => {
    jest.restoreAllMocks(); const organizations = { in: [org, foreignOrg] }; const users = { in: [actor, foreign] };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: organizations }, { actorUserId: users }] } });
    await db.taskChecklistItem.deleteMany({ where: { organizationId: organizations } }); await db.taskReviewer.deleteMany({ where: { organizationId: organizations } });
    await db.task.deleteMany({ where: { organizationId: organizations } }); await db.employee.deleteMany({ where: { organizationId: organizations } });
    await db.membershipRole.deleteMany({ where: { organizationId: organizations } }); await db.rolePermission.deleteMany({ where: { role: { organizationId: organizations } } });
    await db.role.deleteMany({ where: { organizationId: organizations } }); await db.organizationMembership.deleteMany({ where: { organizationId: organizations } });
    await db.organization.deleteMany({ where: { id: organizations } }); await db.authSession.deleteMany({ where: { userId: users } }); await db.user.deleteMany({ where: { id: users } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  it.each([
    ['planning', () => http().get(`${base()}/planning`)], ['reviewer', () => http().patch(`${base()}/planning/reviewer`).send({ reviewerEmployeeId: reviewer })],
    ['create checklist', () => http().post(`${base()}/checklist`).send({ title: 'Item' })], ['activity', () => http().get(`${base()}/activity`)],
  ])('%s requires JWT', async (_name, operation) => { await operation().expect(401); });
  it.each(['INACTIVE', 'SUSPENDED', 'REMOVED'] as const)('denies %s membership', async (status) => {
    await db.organizationMembership.updateMany({ where: { organizationId: org, userId: actor }, data: { status } }); await planning().expect(403);
  });
  it('denies revoked sessions and foreign organization context', async () => {
    await db.authSession.update({ where: { id: session }, data: { revokedAt: new Date() } }); await planning().expect(401);
    await db.authSession.update({ where: { id: session }, data: { revokedAt: null } }); await planning(foreignOrg, foreignTask).expect(403);
  });
  it('requires exact existing permissions and does not infer an administrator bypass', async () => {
    await revoke('task:read'); await planning().expect(403); await activity().expect(403);
    await db.role.update({ where: { id: role }, data: { name: 'Administrator', key: 'administrator' } });
    await createItem().expect(201); await revoke('task:update'); await createItem().expect(403);
    await revoke('task:assign'); await setReviewer({ reviewerEmployeeId: reviewer }).expect(403);
  });
  it('returns scoped checklist, reviewer and safe name projection', async () => {
    const first = (await createItem({ title: '  Chuẩn bị  ' }).expect(201)).body;
    const second = (await createItem({ title: 'Kiểm thử' }).expect(201)).body;
    await setReviewer({ reviewerEmployeeId: reviewer }).expect(200);
    await db.taskChecklistItem.create({ data: { organizationId: org, taskId: otherTask, title: 'Other' } });
    const { body } = await planning().expect(200);
    expect(body.reviewer).toEqual({ employeeId: reviewer, displayName: 'Người kiểm tra' });
    expect(body.checklist.map((item: { id: string }) => item.id)).toEqual([first.id, second.id]);
    expect(JSON.stringify(body)).not.toContain('Other');
    await revoke('employee:read'); expect((await planning().expect(200)).body.reviewer).toEqual({ employeeId: reviewer, displayName: null });
  });
  it.each([{ title: '' }, { title: ' '.repeat(3) }, { title: 'x'.repeat(201) }, { title: 'bad\u0000title' }, { title: 'ok', taskId: randomUUID() }, { title: 'ok', isCompleted: true }, { title: 'ok', permissions: ['task:update'] }])('rejects invalid/injected checklist body %j', async (body) => { await createItem(body).expect(400); });
  it('does not change parent task progress, status or updatedAt when checklist changes', async () => {
    const before = await db.task.findUniqueOrThrow({ where: { organizationId_id: { organizationId: org, id: task } } });
    const item = (await createItem().expect(201)).body;
    const updated = await http().patch(`${base()}/checklist/${item.id}`).set('Authorization', auth()).send({ isCompleted: true }).expect(200);
    expect(updated.body).toMatchObject({ id: item.id, isCompleted: true });
    const after = await db.task.findUniqueOrThrow({ where: { organizationId_id: { organizationId: org, id: task } } });
    expect(after).toMatchObject({ status: before.status, progressPercent: before.progressPercent, updatedAt: before.updatedAt });
  });
  it('preserves no-op timestamps/audit and validates item scope', async () => {
    const item = (await createItem().expect(201)).body;
    await db.auditEvent.deleteMany({ where: { organizationId: org } });
    const same = await http().patch(`${base()}/checklist/${item.id}`).set('Authorization', auth()).send({ title: item.title, isCompleted: false }).expect(200);
    expect(same.body.updatedAt).toBe(item.updatedAt); expect(await events()).toHaveLength(0);
    const other = await db.taskChecklistItem.create({ data: { organizationId: org, taskId: otherTask, title: 'Other task item' } });
    await http().patch(`${base()}/checklist/${other.id}`).set('Authorization', auth()).send({ isCompleted: true }).expect(404);
    await http().patch(`${base(foreignOrg, foreignTask)}/checklist/${other.id}`).set('Authorization', auth()).send({ isCompleted: true }).expect(403);
    await http().delete(`${base()}/checklist/${randomUUID()}`).set('Authorization', auth()).expect(404);
  });
  it('locks reviewer/checklist mutations after terminal state while retaining reads', async () => {
    await db.task.update({ where: { organizationId_id: { organizationId: org, id: task } }, data: { status: 'DONE', progressPercent: 100 } });
    await planning().expect(200); await setReviewer({ reviewerEmployeeId: reviewer }).expect(409); await createItem().expect(409);
  });
  it('validates reviewer tenant/lifecycle, supports clear and makes no implicit permission grant', async () => {
    const foreignReviewer = (await db.employee.findFirstOrThrow({ where: { organizationId: foreignOrg } })).id;
    await setReviewer({ reviewerEmployeeId: foreignReviewer }).expect(404);
    await db.employee.update({ where: { id: reviewer }, data: { status: 'INACTIVE' } });
    await setReviewer({ reviewerEmployeeId: reviewer }).expect(409);
    await db.employee.update({ where: { id: reviewer }, data: { status: 'ACTIVE' } });
    await setReviewer({ reviewerEmployeeId: reviewer }).expect(200); const auditCount = await events();
    await setReviewer({ reviewerEmployeeId: reviewer }).expect(200); expect(await events()).toHaveLength(auditCount.length);
    await setReviewer({ reviewerEmployeeId: null }).expect(200); expect((await planning()).body.reviewer).toBeNull();
    expect(await db.rolePermission.count({ where: { roleId: role, permission: { key: 'task:read' } } })).toBe(1);
  });
  it.each(['missing', 'invalid', 'organizationId', 'roleId', 'permissions'])('rejects reviewer injection %s', async (field) => {
    const body = field === 'missing' ? {} : field === 'invalid' ? { reviewerEmployeeId: 'bad' }
      : { reviewerEmployeeId: reviewer, [field]: field === 'permissions' ? ['task:assign'] : foreignOrg };
    await setReviewer(body).expect(400);
  });
  it('enforces the checklist maximum without accepting a 101st row', async () => {
    await db.taskChecklistItem.createMany({ data: Array.from({ length: 100 }, (_, index) => ({ organizationId: org, taskId: task, title: `Item ${index}` })) });
    await createItem().expect(409); expect(await db.taskChecklistItem.count({ where: { organizationId: org, taskId: task } })).toBe(100);
  });
  it('has bounded safe activity scoped to this task and no successful-read audit', async () => {
    const item = (await createItem().expect(201)).body;
    await http().patch(`${base()}/checklist/${item.id}`).set('Authorization', auth()).send({ isCompleted: true }).expect(200);
    await setReviewer({ reviewerEmployeeId: reviewer }).expect(200);
    await db.auditEvent.create({ data: { organizationId: org, actorUserId: actor, event: 'task.comment.added', resourceType: 'task_comment', resourceId: randomUUID(), outcome: 'SUCCESS', source: 'HTTP', metadata: { } } });
    await db.auditEvent.create({ data: { organizationId: org, actorUserId: actor, event: 'task.created', resourceType: 'task', resourceId: otherTask, outcome: 'SUCCESS', source: 'HTTP', metadata: { } } });
    const before = await db.auditEvent.count({ where: { organizationId: org } }); const first = (await activity({ limit: 2 }).expect(200)).body;
    expect(first.items).toHaveLength(2); expect(first.items.every((row: { event: string }) => row.event.startsWith('task.'))).toBe(true);
    expect(first.items.every((row: object) => Object.keys(row).sort().join(',') === 'createdAt,event,id')).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/comment|metadata|actor|private/i);
    if (first.nextCursor) await activity({ after: first.nextCursor }).expect(200);
    for (const after of [randomUUID(), (await db.auditEvent.findFirstOrThrow({ where: { organizationId: org, resourceId: otherTask } })).id]) await activity({ after }).expect(400);
    expect(await db.auditEvent.count({ where: { organizationId: org } })).toBe(before);
  });
  it('rolls back the checklist mutation when audit persistence fails', async () => {
    const audit = app.get(AuditService); jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('private audit failure'));
    const response = await createItem({ title: 'Will roll back' }).expect(500); expect(JSON.stringify(response.body)).not.toContain('private audit failure');
    expect(await db.taskChecklistItem.count({ where: { organizationId: org, taskId: task } })).toBe(0);
  });
  it('paginates activity chronologically with stable ties and no duplicate or missing rows', async () => {
    const ids = Array.from({ length: 4 }, () => randomUUID()).sort();
    const now = new Date('2026-09-16T00:00:00Z');
    await db.auditEvent.createMany({ data: ids.map((id, index) => ({ id, organizationId: org, actorUserId: actor,
      event: 'task.created', resourceType: 'task', resourceId: task, outcome: 'SUCCESS', source: 'HTTP', metadata: {},
      createdAt: index === 3 ? new Date('2026-09-15T00:00:00Z') : now })) });
    const first = (await activity({ limit: 2 }).expect(200)).body;
    const second = (await activity({ limit: 2, after: first.nextCursor }).expect(200)).body;
    expect([...first.items, ...second.items].map((row: { id: string }) => row.id)).toEqual([ids[2], ids[1], ids[0], ids[3]]);
    expect(second.nextCursor).toBeNull();
  });
  it.each([{ limit: 0 }, { limit: 101 }, { after: 'invalid' }, { organizationId: randomUUID() }, { permissions: ['task:read'] }])('rejects invalid activity query %j', async (query) => {
    await activity(query).expect(400);
  });
  it('keeps checklist capacity under concurrent requests', async () => {
    await db.taskChecklistItem.createMany({ data: Array.from({ length: 99 }, (_, index) => ({ organizationId: org, taskId: task, title: `Item ${index}` })) });
    const results = await Promise.all([createItem({ title: 'Concurrent one' }), createItem({ title: 'Concurrent two' })]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await db.taskChecklistItem.count({ where: { organizationId: org, taskId: task } })).toBe(100);
  });
  it('rejects checklist field injection, handles deletion and freezes cancelled tasks', async () => {
    const item = (await createItem().expect(201)).body;
    for (const body of [{}, { isCompleted: 'true' }, { title: null }, { organizationId: foreignOrg }, { reviewerEmployeeId: reviewer }]) {
      await http().patch(`${base()}/checklist/${item.id}`).set('Authorization', auth()).send(body).expect(400);
    }
    await http().delete(`${base()}/checklist/${item.id}`).set('Authorization', auth()).expect(204);
    expect((await planning().expect(200)).body.checklist).toEqual([]);
    await db.task.update({ where: { id: task }, data: { status: 'CANCELLED' } });
    await createItem().expect(409); await setReviewer({ reviewerEmployeeId: null }).expect(409);
  });
  it('rejects reviewers without active membership but retains historical assignments', async () => {
    await setReviewer({ reviewerEmployeeId: reviewer }).expect(200);
    await db.organizationMembership.updateMany({ where: { organizationId: org, userId: foreign }, data: { status: 'INACTIVE' } });
    expect((await planning().expect(200)).body.reviewer.employeeId).toBe(reviewer);
    await setReviewer({ reviewerEmployeeId: reviewer }).expect(200);
    await setReviewer({ reviewerEmployeeId: null }).expect(200);
    await setReviewer({ reviewerEmployeeId: reviewer }).expect(409);
  });
  it('documents every additive planning endpoint and safe schemas in OpenAPI', async () => {
    const { body } = await http().get('/api/v1/docs/openapi.json').expect(200);
    for (const path of ['/planning', '/planning/reviewer', '/checklist', '/checklist/{itemId}', '/activity']) expect(body.paths[`/organizations/{organizationId}/tasks/{taskId}${path}`]).toBeDefined();
    expect(body.components.schemas.TaskChecklistItem.additionalProperties).toBe(false); expect(body.components.schemas.TaskReviewer.properties.displayName.nullable).toBe(true);
  });
});

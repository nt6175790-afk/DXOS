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
const secret = 'calendar-fixture-secret-not-production';
const range = { from: '2026-09-01T00:00:00Z', until: '2026-10-01T00:00:00Z' };
const payload = { title: 'Họp kế hoạch', kind: 'MEETING', startsAt: '2026-09-16T09:00:00+07:00', endsAt: '2026-09-16T10:00:00+07:00', location: 'Phòng họp', description: 'Nội dung họp' };
mysqlDescribe('Organization calendar', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string, foreign: string, org: string, foreignOrg: string, employee: string, foreignEvent: string, role: string, session: string, token: string;
  const base = (organizationId = org) => `/api/v1/organizations/${organizationId}/calendar`;
  const http = () => request(app.getHttpServer());
  const list = (query: object = {}, organizationId = org) => http().get(base(organizationId)).set('Authorization', `Bearer ${token}`).query({ ...range, ...query });
  const create = (body: object = payload) => http().post(`${base()}/events`).set('Authorization', `Bearer ${token}`).send(body);
  const patch = (id: string, body: object) => http().patch(`${base()}/events/${id}`).set('Authorization', `Bearer ${token}`).send(body);
  const revoke = (key: string) => db.rolePermission.deleteMany({ where: { roleId: role, permission: { key } } });
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {})); await app.init();
  });
  beforeEach(async () => {
    actor = randomUUID(); foreign = randomUUID(); session = randomUUID();
    await db.user.createMany({ data: [actor, foreign].map((id) => ({ id, email: `${id}@example.test`, displayName: 'Private user', passwordHash: 'private-hash' })) });
    await db.authSession.create({ data: { id: session, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session, typ: 'access' }, secret, { expiresIn: 300 });
    const service = app.get(OrganizationsService);
    org = (await service.create(actor, { name: 'Calendar A', slug: `calendar-a-${randomUUID()}` })).id;
    foreignOrg = (await service.create(foreign, { name: 'Calendar B', slug: `calendar-b-${randomUUID()}` })).id;
    role = (await db.role.findFirstOrThrow({ where: { organizationId: org } })).id;
    for (const key of ['task:read', 'calendar:read', 'calendar:create', 'calendar:update']) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } }); await db.rolePermission.create({ data: { roleId: role, permissionId: permission.id } });
    }
    employee = (await db.employee.create({ data: { organizationId: org, userId: actor, employeeCode: 'CAL', displayName: 'Calendar user' } })).id;
    foreignEvent = (await db.calendarEvent.create({ data: { organizationId: foreignOrg, createdByUserId: foreign, title: 'Foreign meeting', kind: 'MEETING', startsAt: new Date(payload.startsAt), endsAt: new Date(payload.endsAt) } })).id;
  });
  afterEach(async () => {
    jest.restoreAllMocks(); const organizations = { in: [org, foreignOrg] }; const users = { in: [actor, foreign] };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: organizations }, { actorUserId: users }] } });
    await db.calendarEvent.deleteMany({ where: { organizationId: organizations } }); await db.task.deleteMany({ where: { organizationId: organizations } }); await db.employee.deleteMany({ where: { organizationId: organizations } });
    await db.membershipRole.deleteMany({ where: { organizationId: organizations } }); await db.rolePermission.deleteMany({ where: { role: { organizationId: organizations } } });
    await db.role.deleteMany({ where: { organizationId: organizations } }); await db.organizationMembership.deleteMany({ where: { organizationId: organizations } });
    await db.organization.deleteMany({ where: { id: organizations } }); await db.authSession.deleteMany({ where: { userId: users } }); await db.user.deleteMany({ where: { id: users } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  it('requires JWT for reads and mutations', async () => {
    await http().get(base()).query(range).expect(401); await http().post(`${base()}/events`).send(payload).expect(401);
    await http().patch(`${base()}/events/${foreignEvent}`).send({ title: 'No' }).expect(401);
    await db.authSession.update({ where: { id: session }, data: { revokedAt: new Date() } }); await list().expect(401);
  });
  it.each(['INACTIVE', 'SUSPENDED', 'REMOVED'] as const)('denies %s membership', async (status) => {
    await db.organizationMembership.updateMany({ where: { organizationId: org, userId: actor }, data: { status } }); await list().expect(403); await create().expect(403);
  });
  it('denies foreign contexts and hides foreign event identifiers', async () => {
    await list({}, foreignOrg).expect(403); await list({}, randomUUID()).expect(403);
    await patch(foreignEvent, { title: 'Tamper' }).expect(404); await patch(randomUUID(), { title: 'Tamper' }).expect(404);
    await list({ type: 'events', after: foreignEvent }).expect(400);
  });
  it('uses independent explicit grants and never grants creator privileges automatically', async () => {
    await revoke('calendar:read'); expect((await list().expect(200)).body.events).toBeNull(); await list({ type: 'events' }).expect(403);
    const event = (await create().expect(201)).body; await revoke('calendar:update'); await patch(event.id, { title: 'No' }).expect(403);
    await revoke('calendar:create'); await create().expect(403); await revoke('task:read'); await list().expect(403);
  });
  it('creates safe UTC metadata and atomically records a redacted audit', async () => {
    const { body } = await create().expect(201); expect(body.startsAt).toBe('2026-09-16T02:00:00.000Z'); expect(body.status).toBe('SCHEDULED');
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'description', 'endsAt', 'id', 'kind', 'location', 'startsAt', 'status', 'title', 'updatedAt']);
    const row = await db.calendarEvent.findUniqueOrThrow({ where: { id: body.id } }); expect(row.createdByUserId).toBe(actor); expect(row.organizationId).toBe(org);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { resourceId: body.id, event: 'calendar.event.created' } }); expect(audit.metadata).toEqual({});
    expect((await list().expect(200)).body.events.items.map((event: { id: string }) => event.id)).toEqual([body.id]);
  });
  it('preserves no-op timestamps and supports clearing fields, cancellation and terminal protection', async () => {
    const event = (await create().expect(201)).body;
    expect((await patch(event.id, payload).expect(200)).body.updatedAt).toBe(event.updatedAt);
    expect(await db.auditEvent.count({ where: { resourceId: event.id, event: 'calendar.event.updated' } })).toBe(0);
    expect((await patch(event.id, { location: null, description: null }).expect(200)).body.location).toBeNull();
    await patch(event.id, { status: 'CANCELLED' }).expect(200); await patch(event.id, { status: 'CANCELLED' }).expect(200);
    await patch(event.id, { status: 'SCHEDULED' }).expect(409); await patch(event.id, { title: 'Edited' }).expect(409);
    expect((await list().expect(200)).body.events.items[0].status).toBe('CANCELLED');
  });
  it.each([{ title: '' }, { kind: 'PRIVATE' }, { startsAt: '2026-09-31T00:00:00Z' }, { endsAt: payload.startsAt }, { endsAt: '2026-11-01T00:00:00Z' }, { startsAt: '2026-09-16T09:00:00' }, { location: 'x'.repeat(201) }, { description: 'x'.repeat(4001) }, { organizationId: randomUUID() }, { createdByUserId: randomUUID() }, { permissions: ['calendar:create'] }, { status: 'CANCELLED' }])('rejects invalid or injected create payload %j', async (input) => { await create({ ...payload, ...input }).expect(400); });
  it.each([{ from: 'bad' }, { until: range.from }, { until: '2027-01-01T00:00:00Z' }, { limit: 101 }, { after: randomUUID() }, { type: 'private' }, { permissions: ['calendar:read'] }])('rejects invalid range/query %j', async (query) => { await list(query).expect(400); });
  it('uses half-open boundaries and event overlap without discarding multi-day meetings', async () => {
    for (const [title, dueAt, status] of [['before', '2026-08-31T23:59:59Z', 'TODO'], ['start', range.from, 'TODO'], ['end', range.until, 'TODO'], ['cancelled', payload.startsAt, 'CANCELLED']] as const) {
      await db.task.create({ data: { organizationId: org, creatorEmployeeId: employee, title, dueAt: new Date(dueAt), status } });
    }
    await create({ ...payload, startsAt: '2026-08-31T22:00:00Z', endsAt: '2026-09-01T01:00:00Z' }).expect(201);
    await create({ ...payload, startsAt: '2026-08-31T22:00:00Z', endsAt: range.from }).expect(201);
    const { body } = await list().expect(200); expect(body.tasks.items.map((row: { title: string }) => row.title)).toEqual(['start']); expect(body.events.items).toHaveLength(1);
  });
  it('paginates tasks and events deterministically without missing equal timestamps', async () => {
    for (let index = 0; index < 4; index++) {
      await create({ ...payload, title: `Event ${index}` }).expect(201);
      await db.task.create({ data: { organizationId: org, creatorEmployeeId: employee, title: `Task ${index}`, dueAt: new Date(payload.startsAt) } });
    }
    for (const type of ['tasks', 'events']) {
      const first = (await list({ type, limit: 2 }).expect(200)).body[type];
      const second = (await list({ type, limit: 2, after: first.nextCursor }).expect(200)).body[type];
      const ids = [...first.items, ...second.items].map((row: { id: string }) => row.id);
      expect(new Set(ids).size).toBe(4); expect(ids).toEqual([...ids].sort()); expect(second.nextCursor).toBeNull();
    }
  });
  it('rolls back on audit failure and rejects oversized JSON', async () => {
    jest.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('Private database failure'));
    const response = await create().expect(500); expect(JSON.stringify(response.body)).not.toContain('Private'); expect(await db.calendarEvent.count({ where: { organizationId: org } })).toBe(0);
    await create({ ...payload, description: 'x'.repeat(70000) }).expect(413);
  });
  it('rejects empty or injected updates and does not audit successful reads', async () => {
    const event = (await create().expect(201)).body;
    for (const body of [{}, { createdByUserId: foreign }, { title: null }, { status: null }]) await patch(event.id, body).expect(400);
    const count = await db.auditEvent.count({ where: { organizationId: org } }); await list().expect(200); expect(await db.auditEvent.count({ where: { organizationId: org } })).toBe(count);
  });
  it('publishes calendar OpenAPI and does not grant new permissions to a fresh organization', async () => {
    const { body } = await http().get('/api/v1/docs/openapi.json').expect(200);
    expect(body.paths['/organizations/{organizationId}/calendar/events'].post['x-required-permission']).toBe('calendar:create');
    expect(await db.rolePermission.count({ where: { role: { organizationId: foreignOrg }, permission: { key: { startsWith: 'calendar:' } } } })).toBe(0);
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { NotificationService } from '../../backend/src/modules/notifications/notification.service';
import { NOTIFICATION_TYPES } from '../../backend/src/modules/notifications/notification-catalog';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'notification-test-only-key-not-production';
mysqlDescribe('notification tenant and recipient security with real MySQL and HTTP', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let service: NotificationService;
  let organizations: OrganizationsService;
  let users: string[];
  let tokens: string[];
  let orgs: string[];
  const path = (org = orgs[0]) => `/api/v1/organizations/${org}/notifications`;
  const create = (user = users[0], org = orgs[0]) => service.createForRecipient({
    organizationId: org, recipientUserId: user, type: NOTIFICATION_TYPES.ORGANIZATION_UPDATED, metadata: { changedFields: ['name'] },
  });
  const get = (org = orgs[0], token = tokens[0]) => request(app.getHttpServer()).get(path(org)).set('Authorization', `Bearer ${token}`);
  const read = (id: string, org = orgs[0], token = tokens[0]) => request(app.getHttpServer())
    .patch(`${path(org)}/${id}/read`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    service = module.get(NotificationService); organizations = module.get(OrganizationsService);
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => undefined));
    await app.init();
  });
  beforeEach(async () => {
    users = [randomUUID(), randomUUID(), randomUUID()]; tokens = []; orgs = [];
    await db.user.createMany({ data: users.map((id) => ({ id, email: `${id}@example.test` })) });
    for (const id of users) {
      const sid = randomUUID();
      await db.authSession.create({ data: { id: sid, userId: id,
        refreshTokenHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''), expiresAt: new Date(Date.now() + 300000) } });
      tokens.push(sign({ sub: id, sid, typ: 'access' }, secret, { expiresIn: 300 }));
    }
    for (const user of [users[0], users[2]]) orgs.push((await organizations.create(user, { name: 'Notify fixture', slug: `notify-${randomUUID()}` })).id);
    await db.organizationMembership.createMany({ data: [
      { organizationId: orgs[0], userId: users[1] }, { organizationId: orgs[1], userId: users[0] },
    ] });
  });
  afterEach(async () => {
    const organizationId = { in: orgs };
    await db.notification.deleteMany({ where: { organizationId } });
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: users } }] } });
    await db.membershipRole.deleteMany({ where: { organizationId } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId } } });
    await db.role.deleteMany({ where: { organizationId } });
    await db.organizationMembership.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  it.each(['list', 'read'])('returns 401 for missing, malformed and expired authentication on %s', async (method) => {
    for (const token of [undefined, 'invalid', sign({ sub: users[0], typ: 'access', sid: randomUUID() }, secret, { expiresIn: -1 })]) {
      const req = method === 'list' ? request(app.getHttpServer()).get(path()) : request(app.getHttpServer()).patch(`${path()}/${randomUUID()}/read`);
      if (token) req.set('Authorization', `Bearer ${token}`);
      await req.expect(401);
    }
  });
  it('creates durable typed content linked to the recipient and organization with a system audit event', async () => {
    const row = await create();
    expect(row).toMatchObject({ organizationId: orgs[0], recipientUserId: users[0], type: 'organization.updated',
      title: 'Organization updated', body: 'Your organization details were updated.', readAt: null, isRead: false, metadata: { changedFields: ['name'] } });
    expect(await db.notification.findUnique({ where: { id: row.id } })).not.toBeNull();
    expect(await db.auditEvent.findFirst({ where: { resourceId: row.id } })).toMatchObject({
      event: 'notification.created', source: 'SYSTEM', organizationId: orgs[0], resourceType: 'notification', actorUserId: null,
    });
  });
  it('lists only the authenticated recipient and selected organization, including members without roles', async () => {
    const own = await create(users[1]); await create();
    expect((await get(orgs[0], tokens[1]).expect(200)).body.items.map((r: { id: string }) => r.id)).toEqual([own.id]);
    const otherOrg = await create(users[0], orgs[1]);
    const response = await get(orgs[1]).expect(200);
    expect(response.body.items.map((r: { id: string }) => r.id)).toEqual([otherOrg.id]);
    await get(orgs[1], tokens[1]).expect(403);
  });
  it('rejects another recipient, another tenant, nonexistent and malformed read identifiers', async () => {
    const other = await create(users[1]); const foreign = await create(users[0], orgs[1]);
    for (const id of [other.id, foreign.id, randomUUID(), 'invalid']) await read(id).expect(403);
    await read(other.id, orgs[1], tokens[1]).expect(403);
    expect(await db.notification.count({ where: { readAt: { not: null } } })).toBe(0);
  });
  it.each(['user_id', 'recipientUserId', 'organization_id', 'organizationId', 'isAdmin'])('rejects query spoofing field %s', async (key) => {
    await get().query({ [key]: users[2] }).expect(400);
  });
  it('cannot override tenant scope with headers or access invalid/nonmember organizations', async () => {
    await get(orgs[1], tokens[1]).set('x-organization-id', orgs[0]).expect(403);
    for (const id of ['invalid', randomUUID()]) await get(id).expect(403);
  });
  it('has no public creation, content mutation, or deletion route', async () => {
    await request(app.getHttpServer()).post(path()).set('Authorization', `Bearer ${tokens[0]}`).send({ recipientUserId: users[2] }).expect(404);
    await request(app.getHttpServer()).post('/api/v1/notifications').set('Authorization', `Bearer ${tokens[0]}`).send({}).expect(404);
    const row = await create();
    await request(app.getHttpServer()).patch(`${path()}/${row.id}`).set('Authorization', `Bearer ${tokens[0]}`).send({ body: 'forged' }).expect(404);
    await request(app.getHttpServer()).delete(`${path()}/${row.id}`).set('Authorization', `Bearer ${tokens[0]}`).expect(404);
  });
  it.each(['recipientUserId', 'organizationId', 'type', 'createdAt', 'readAt', 'title', 'body', 'isAdmin'])('rejects read mutation field %s', async (key) => {
    const row = await create();
    await read(row.id).send({ [key]: 'forged' }).expect(400);
    expect((await db.notification.findUniqueOrThrow({ where: { id: row.id } })).readAt).toBeNull();
  });
  it('marks own read idempotently, preserves all immutable fields, and creates no read audit', async () => {
    const row = await create(users[1]);
    const count = await db.auditEvent.count();
    const first = await read(row.id, orgs[0], tokens[1]).send({}).expect(200);
    const again = await read(row.id, orgs[0], tokens[1]).expect(200);
    expect(first.body.isRead).toBe(true); expect(first.body.readAt).toEqual(expect.any(String));
    expect(again.body).toEqual(first.body);
    const { readAt: originalRead, ...original } = await db.notification.findUniqueOrThrow({ where: { id: row.id } });
    const { readAt: previousRead, isRead, ...previous } = row;
    expect(original).toEqual(previous); expect(originalRead).not.toBeNull(); expect(previousRead).toBeNull(); expect(isRead).toBe(false);
    expect(await db.auditEvent.count()).toBe(count);
  });
  it('concurrent mark-read requests preserve one timestamp', async () => {
    const row = await create();
    const results = await Promise.all([read(row.id).expect(200), read(row.id).expect(200)]);
    expect(results[0].body.readAt).toBe(results[1].body.readAt);
  });
  it.each(['membership', 'organization', 'user'])('blocks inactive %s on creation, list and read', async (kind) => {
    const row = await create();
    if (kind === 'membership') await db.organizationMembership.update({ where: { organizationId_userId: { organizationId: orgs[0], userId: users[0] } }, data: { status: 'REMOVED' } });
    if (kind === 'organization') await db.organization.update({ where: { id: orgs[0] }, data: { status: 'SUSPENDED' } });
    if (kind === 'user') await db.user.update({ where: { id: users[0] }, data: { accountStatus: 'INACTIVE' } });
    await expect(create()).rejects.toMatchObject({ status: 403 });
    await get().expect(kind === 'user' ? 401 : 403);
    await read(row.id).expect(kind === 'user' ? 401 : 403);
  });
  it('rejects cross-tenant/nonexistent recipients and enforces the composite membership FK', async () => {
    for (const id of [users[2], randomUUID(), 'invalid']) await expect(create(id)).rejects.toMatchObject({ status: 403 });
    await expect(db.notification.create({ data: { organizationId: orgs[0], recipientUserId: users[2],
      type: 'organization.updated', title: 'test', body: 'test', metadata: {} } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('paginates ties deterministically and keeps unread cursor valid after read', async () => {
    const rows = []; for (let i = 0; i < 5; i++) rows.push(await create());
    await db.notification.updateMany({ where: { organizationId: orgs[0] }, data: { createdAt: new Date('2026-01-01T00:00:00Z') } });
    const ordered = rows.map((r) => r.id).sort().reverse();
    const first = (await get().query({ limit: 2, state: 'unread' }).expect(200)).body;
    expect(first.items.map((r: { id: string }) => r.id)).toEqual(ordered.slice(0, 2));
    await read(first.nextCursor).expect(200);
    const second = (await get().query({ limit: 2, state: 'unread', after: first.nextCursor }).expect(200)).body;
    const third = (await get().query({ limit: 2, after: second.nextCursor }).expect(200)).body;
    expect([...first.items, ...second.items, ...third.items].map((r: { id: string }) => r.id)).toEqual(ordered);
    expect(third.nextCursor).toBeNull();
    expect((await get().query({ state: 'read' }).expect(200)).body.items.map((r: { id: string }) => r.id)).toEqual([first.nextCursor]);
    const foreign = await create(users[0], orgs[1]); const other = await create(users[1]);
    for (const after of [randomUUID(), foreign.id, other.id, 'invalid']) await get().query({ after }).expect(400);
  });
  it.each([0, -1, 101, 1.5, 'NaN', 'Infinity'])('rejects invalid page size %s', async (limit) => {
    await get().query({ limit }).expect(400);
  });
  it('enforces default and maximum page sizes against more than 100 rows', async () => {
    // Fixture bulk insert solely to exercise bounded SQL pagination.
    await db.notification.createMany({ data: Array.from({ length: 102 }, () => ({
      organizationId: orgs[0], recipientUserId: users[0], type: 'organization.updated', title: 'Organization updated', body: 'Fixture', metadata: {},
    })) });
    expect((await get().expect(200)).body.items).toHaveLength(25);
    expect((await get().query({ limit: 100 }).expect(200)).body.items).toHaveLength(100);
    await get().query({ state: 'anything' }).expect(400);
  });
  it('organization update creates exactly one actor notification and correlated audit in the same operation', async () => {
    const correlation = randomUUID();
    await request(app.getHttpServer()).patch(`/api/v1/organizations/${orgs[0]}`)
      .set('Authorization', `Bearer ${tokens[0]}`).set('x-request-id', correlation).send({ name: 'Private name never in notification' }).expect(200);
    const rows = await db.notification.findMany({ where: { organizationId: orgs[0] } });
    expect(rows).toHaveLength(1); expect(rows[0].recipientUserId).toBe(users[0]);
    expect(JSON.stringify(rows[0])).not.toContain('Private name');
    expect(await db.auditEvent.findFirst({ where: { resourceId: rows[0].id } })).toMatchObject({
      event: 'notification.created', actorUserId: users[0], requestId: correlation, source: 'HTTP', organizationId: orgs[0],
    });
  });
  it.each(['notification', 'audit'])('rolls back organization, notification and audit writes when %s creation fails', async (failure) => {
    const failing = db.$extends({ query: {
      notification: { async create({ args, query }) { if (failure === 'notification') throw new Error('Injected notification failure'); return query(args); } },
      auditEvent: { async create({ args, query }) { if (failure === 'audit' && args.data.event === 'notification.created') throw new Error('Injected audit failure'); return query(args); } },
    } });
    const prisma = failing as unknown as PrismaService;
    const auth = new AuthorizationService(prisma); const audit = new AuditService(prisma);
    const producer = new OrganizationsService(prisma, auth, audit, new NotificationService(prisma, auth, audit));
    const count = await db.auditEvent.count();
    await expect(producer.update(users[0], orgs[0], { name: 'Must roll back' })).rejects.toThrow('Injected');
    expect((await db.organization.findUniqueOrThrow({ where: { id: orgs[0] } })).name).toBe('Notify fixture');
    expect(await db.notification.count({ where: { organizationId: orgs[0] } })).toBe(0);
    expect(await db.auditEvent.count()).toBe(count);
  });
  it('exposes notification schemas and secured paths in OpenAPI', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    expect(result.body.paths['/organizations/{organizationId}/notifications'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(result.body.components.schemas.Notification.properties.title.maxLength).toBe(200);
  });
  it('reports exact recipient counters beyond the first page and partitions categories', async () => {
    for (let index = 0; index < 27; index++) await create();
    const taskNotification = await service.createForRecipient({ organizationId: orgs[0], recipientUserId: users[0], type: NOTIFICATION_TYPES.TASK_ASSIGNED, metadata: { taskId: randomUUID() } });
    await read(taskNotification.id).expect(200); await create(users[1]); await create(users[0], orgs[1]);
    const { body } = await request(app.getHttpServer()).get(`${path()}/summary`).set('Authorization', `Bearer ${tokens[0]}`).expect(200);
    expect(body).toEqual({ total: 28, unread: 27, read: 1, categories: { work: { total: 1, unread: 0 }, organization: { total: 27, unread: 27 }, other: { total: 0, unread: 0 } } });
    expect((await get().query({ category: 'work', state: 'read' }).expect(200)).body.items.map((item: { id: string }) => item.id)).toEqual([taskNotification.id]);
    expect((await get().query({ category: 'work', state: 'unread' }).expect(200)).body.items).toEqual([]);
    await get().query({ category: 'invalid' }).expect(400);
  });
  it('bulk marks only the current recipient/tenant, preserves timestamps, remains idempotent and unaudited', async () => {
    const alreadyRead = await create(); const unread = await create(); const otherUser = await create(users[1]); const otherOrg = await create(users[0], orgs[1]);
    const firstRead = (await read(alreadyRead.id).expect(200)).body.readAt;
    const auditCount = await db.auditEvent.count();
    const all = () => request(app.getHttpServer()).patch(`${path()}/read-all`).set('Authorization', `Bearer ${tokens[0]}`).send({});
    expect((await all().expect(200)).body).toEqual({ updatedCount: 1 }); expect((await all().expect(200)).body).toEqual({ updatedCount: 0 });
    expect((await db.notification.findUniqueOrThrow({ where: { id: alreadyRead.id } })).readAt?.toISOString()).toBe(firstRead);
    expect((await db.notification.findUniqueOrThrow({ where: { id: unread.id } })).readAt).not.toBeNull();
    for (const id of [otherUser.id, otherOrg.id]) expect((await db.notification.findUniqueOrThrow({ where: { id } })).readAt).toBeNull();
    expect(await db.auditEvent.count()).toBe(auditCount); const later = await create(); expect(later.readAt).toBeNull();
  });
  it.each(['summary', 'read-all'])('requires authentication/active membership and rejects identity injection for %s', async (operation) => {
    const requestFor = (organizationId = orgs[0]) => operation === 'summary' ? request(app.getHttpServer()).get(`${path(organizationId)}/summary`) : request(app.getHttpServer()).patch(`${path(organizationId)}/read-all`);
    await requestFor().expect(401); await requestFor(orgs[1]).set('Authorization', `Bearer ${tokens[1]}`).expect(403);
    await requestFor().set('Authorization', `Bearer ${tokens[0]}`).query({ recipientUserId: users[1] }).expect(400);
    if (operation === 'read-all') await requestFor().set('Authorization', `Bearer ${tokens[0]}`).send({ organizationId: orgs[1] }).expect(400);
    await db.organizationMembership.updateMany({ where: { organizationId: orgs[0], userId: users[0] }, data: { status: 'INACTIVE' } });
    await requestFor().set('Authorization', `Bearer ${tokens[0]}`).expect(403);
  });
});


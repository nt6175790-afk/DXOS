// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { NotificationService } from '../../backend/src/modules/notifications/notification.service';
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
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { AUDIT_EVENTS } from '../../backend/src/modules/audit/audit-catalog';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { PasswordService } from '../../backend/src/modules/auth/password.service';
import { AuthService } from '../../backend/src/modules/auth/auth.service';
import { AccessTokenService } from '../../backend/src/modules/auth/access-token.service';
import { ConfigService } from '@nestjs/config';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'audit-integration-test-only-key-not-production';
mysqlDescribe('audit integration with MySQL and real HTTP guards', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  const writer = new AuditService(db as PrismaService);
  let app: INestApplication;
  let organizations: OrganizationsService;
  let userId: string;
  let outsider: string;
  let organizationId: string;
  let foreignOrganizationId: string;
  let roleId: string;
  let token: string;
  let outsiderToken: string;
  let passwordHash: string;
  const password = 'Test audit password never persisted in metadata!';
  const path = () => `/api/v1/organizations/${organizationId}/audit-logs`;

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    organizations = module.get(OrganizationsService);
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => undefined));
    await app.init();
    passwordHash = await new PasswordService().hash(password);
  });
  beforeEach(async () => {
    userId = randomUUID(); outsider = randomUUID();
    await db.user.createMany({ data: [userId, outsider].map((id) => ({ id, email: `${id}@example.test`, passwordHash })) });
    const tokens = [];
    for (const id of [userId, outsider]) {
      const sid = randomUUID();
      await db.authSession.create({ data: { id: sid, userId: id, refreshTokenHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
        expiresAt: new Date(Date.now() + 300000) } });
      tokens.push(sign({ sub: id, sid, typ: 'access' }, secret, { expiresIn: 300 }));
    }
    [token, outsiderToken] = tokens;
    organizationId = (await organizations.create(userId, { name: 'Audit test', slug: `audit-${randomUUID()}` })).id;
    foreignOrganizationId = (await organizations.create(outsider, { name: 'Foreign', slug: `audit-${randomUUID()}` })).id;
    roleId = (await db.role.findFirstOrThrow({ where: { organizationId } })).id;
  });
  afterEach(async () => {
    const rows = await db.organization.findMany({ where: { memberships: { some: { userId: { in: [userId, outsider] } } } }, select: { id: true } });
    const scope = { in: rows.map(({ id }) => id) };
    // Privileged test-only teardown; application service/API has no deletion method.
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: scope }, { actorUserId: { in: [userId, outsider] } }, { actorUserId: null, organizationId: null }] } });
    await db.membershipRole.deleteMany({ where: { organizationId: scope } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: scope } } });
    await db.role.deleteMany({ where: { organizationId: scope } });
    await db.notification.deleteMany({ where: { organizationId: scope } });
    await db.organizationMembership.deleteMany({ where: { organizationId: scope } });
    await db.organization.deleteMany({ where: { id: scope } });
    await db.authSession.deleteMany({ where: { userId: { in: [userId, outsider] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, outsider] } } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });
  async function grantRead() {
    const permission = await db.permission.upsert({ where: { key: PERMISSIONS.AUDIT_READ }, update: {}, create: { key: PERMISSIONS.AUDIT_READ, name: 'Read audit' } });
    await db.rolePermission.create({ data: { roleId, permissionId: permission.id } });
  }

  it('returns 401 for missing, invalid and expired credentials', async () => {
    for (const credential of [undefined, 'invalid.jwt', sign({ sub: userId, sid: randomUUID(), typ: 'access' }, secret, { expiresIn: -1 })]) {
      const req = request(app.getHttpServer()).get(path());
      if (credential) req.set('Authorization', `Bearer ${credential}`);
      const response = await req.expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    }
  });
  it('denies both nonmembers and members without explicit audit permission', async () => {
    for (const credential of [token, outsiderToken]) {
      const response = await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${credential}`).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  });
  it('returns only the authorized tenant history, excluding global and foreign events', async () => {
    await grantRead();
    await writer.record({ event: AUDIT_EVENTS.LOGIN_SUCCESS, actorUserId: userId });
    const response = await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items.every((row: { organizationId: string }) => row.organizationId === organizationId)).toBe(true);
    await request(app.getHttpServer()).get(`/api/v1/organizations/${foreignOrganizationId}/audit-logs`)
      .set('x-organization-id', organizationId).set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).get(path()).query({ organization_id: foreignOrganizationId })
      .set('Authorization', `Bearer ${token}`).expect(400);
  });
  it('has no public creation, edit or deletion route', async () => {
    await grantRead();
    const entry = await db.auditEvent.findFirstOrThrow({ where: { organizationId } });
    await request(app.getHttpServer()).post(path()).set('Authorization', `Bearer ${token}`).send({ event: 'forged', actorUserId: outsider }).expect(404);
    await request(app.getHttpServer()).patch(`${path()}/${entry.id}`).set('Authorization', `Bearer ${token}`).send({ actorUserId: outsider }).expect(404);
    await request(app.getHttpServer()).delete(`${path()}/${entry.id}`).set('Authorization', `Bearer ${token}`).expect(404);
    expect(await db.auditEvent.findUnique({ where: { id: entry.id } })).toEqual(entry);
  });
  it('captures server actor, organization and existing request ID on updates', async () => {
    await request(app.getHttpServer()).patch(`/api/v1/organizations/${organizationId}`).set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', 'audit-update-request-1234').send({ name: 'Changed' }).expect(200);
    const event = await db.auditEvent.findFirstOrThrow({ where: { organizationId, event: AUDIT_EVENTS.ORGANIZATION_UPDATED } });
    expect(event).toMatchObject({ actorUserId: userId, organizationId, requestId: 'audit-update-request-1234', source: 'HTTP',
      metadata: { changedFields: ['name'] } });
    await request(app.getHttpServer()).patch(`/api/v1/organizations/${organizationId}`).set('Authorization', `Bearer ${token}`)
      .send({ name: 'Fake', actorUserId: outsider, organization_id: foreignOrganizationId }).expect(400);
    expect(await db.auditEvent.count({ where: { organizationId, event: AUDIT_EVENTS.ORGANIZATION_UPDATED } })).toBe(1);
  });
  it('supports system-generated evidence with null actor', async () => {
    await writer.record({ event: AUDIT_EVENTS.ORGANIZATION_UPDATED, organizationId, resourceId: organizationId });
    const event = await db.auditEvent.findFirstOrThrow({ where: { organizationId, event: AUDIT_EVENTS.ORGANIZATION_UPDATED } });
    expect(event).toMatchObject({ actorUserId: null, source: 'SYSTEM', requestId: null });
  });
  it('records authorization denial once globally with correlation, never attributing a hostile tenant', async () => {
    await request(app.getHttpServer()).get(`/api/v1/organizations/${foreignOrganizationId}/audit-logs`)
      .set('Authorization', `Bearer ${token}`).set('X-Request-Id', 'audit-denial-request-1234').expect(403);
    const entries = await db.auditEvent.findMany({ where: { requestId: 'audit-denial-request-1234' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ event: AUDIT_EVENTS.AUTHORIZATION_DENIED, organizationId: null,
      actorUserId: userId, outcome: 'DENIED', metadata: { reason: 'PERMISSION_DENIED' } });
    expect(JSON.stringify(entries)).not.toContain(foreignOrganizationId);
  });
  it.each([{ limit: 0 }, { limit: 101 }, { limit: 'NaN' }, { event: 'arbitrary.sql' }, { after: 'bad' }])('rejects invalid query %j', async (query) => {
    await grantRead();
    await request(app.getHttpServer()).get(path()).query(query).set('Authorization', `Bearer ${token}`).expect(400);
  });
  it('paginates deterministic timestamp/ID order and rejects a foreign cursor', async () => {
    await grantRead();
    const expected = await db.auditEvent.findMany({ where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const ids: string[] = [];
    let after: string | undefined;
    do {
      const response = await request(app.getHttpServer()).get(path()).query({ limit: 2, ...(after ? { after } : {}) })
        .set('Authorization', `Bearer ${token}`).expect(200);
      expect(response.body.items.length).toBeLessThanOrEqual(2);
      ids.push(...response.body.items.map(({ id }: { id: string }) => id));
      after = response.body.nextCursor ?? undefined;
    } while (after);
    expect(ids).toEqual(expected.map(({ id }) => id));
    expect(new Set(ids).size).toBe(ids.length);
    const foreign = await db.auditEvent.findFirstOrThrow({ where: { organizationId: foreignOrganizationId } });
    await request(app.getHttpServer()).get(path()).query({ after: foreign.id }).set('Authorization', `Bearer ${token}`).expect(400);
    const filtered = await request(app.getHttpServer()).get(path()).query({ event: AUDIT_EVENTS.ORGANIZATION_CREATED })
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(filtered.body.items).toHaveLength(1);
  });

  it('bounds both default and maximum pages on a large tenant history', async () => {
    await grantRead();
    await db.$transaction(async (tx) => {
      for (let index = 0; index < 105; index++) {
        await writer.record({ event: AUDIT_EVENTS.ORGANIZATION_UPDATED, organizationId }, tx);
      }
    });
    const standard = await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${token}`).expect(200);
    expect(standard.body.items).toHaveLength(25);
    expect(standard.body.nextCursor).toBeTruthy();
    const maximum = await request(app.getHttpServer()).get(path()).query({ limit: 100 }).set('Authorization', `Bearer ${token}`).expect(200);
    expect(maximum.body.items).toHaveLength(100);
    expect(maximum.body.nextCursor).toBeTruthy();
  });

  it('does not grant access or hide audit storage errors on denial', async () => {
    const spy = jest.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('private database credential detail'));
    try {
      const response = await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${token}`).expect(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('private database credential detail');
    } finally { spy.mockRestore(); }
  });

  it('documents audit permission, bounded query and immutable response schema', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    const operation = response.body.paths['/organizations/{organizationId}/audit-logs'].get;
    expect(operation['x-required-permission']).toBe(PERMISSIONS.AUDIT_READ);
    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(operation.parameters.find(({ name }: { name: string }) => name === 'limit').schema.maximum).toBe(100);
    expect(response.body.components.schemas.AuditEvent.properties.metadata.additionalProperties).toBe(false);
  });
  it('audits login, failure, refresh and logout without storing credentials', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set('X-Request-Id', 'audit-login-request-1234')
      .send({ email: `${userId}@example.test`, password }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: `${userId}@example.test`, password: 'incorrect-password' }).expect(401);
    const refresh = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${refresh.body.accessToken}`).expect(204);
    const events = await db.auditEvent.findMany({ where: { OR: [{ actorUserId: userId, organizationId: null }, { event: AUDIT_EVENTS.LOGIN_FAILURE, actorUserId: null }] } });
    expect(events.map(({ event }) => event)).toEqual(expect.arrayContaining([AUDIT_EVENTS.LOGIN_SUCCESS, AUDIT_EVENTS.LOGIN_FAILURE, AUDIT_EVENTS.REFRESH, AUDIT_EVENTS.LOGOUT]));
    expect(events.find(({ event }) => event === AUDIT_EVENTS.LOGIN_SUCCESS)?.requestId).toBe('audit-login-request-1234');
    const serialized = JSON.stringify(events);
    for (const value of [password, passwordHash, secret, 'incorrect-password', login.body.accessToken, login.body.refreshToken, refresh.body.refreshToken]) {
      expect(serialized).not.toContain(value);
    }
  });
  it('rolls back organization updates when audit persistence fails', async () => {
    const failing = db.$extends({ query: { auditEvent: { async create() { throw new Error('audit persistence failure'); } } } });
    const service = new OrganizationsService(failing as unknown as PrismaService, new AuthorizationService(db as PrismaService), writer, new NotificationService(db as PrismaService, new AuthorizationService(db as PrismaService), writer));
    await expect(service.update(userId, organizationId, { name: 'Must roll back' })).rejects.toThrow('audit persistence failure');
    expect((await db.organization.findUniqueOrThrow({ where: { id: organizationId } })).name).toBe('Audit test');
  });
  it('rolls back login sessions when audit persistence fails', async () => {
    const failing = db.$extends({ query: { auditEvent: { async create() { throw new Error('audit persistence failure'); } } } });
    const config = app.get(ConfigService);
    const service = new AuthService(failing as unknown as PrismaService, new PasswordService(), new AccessTokenService(config), config, writer);
    const before = await db.authSession.count({ where: { userId } });
    await expect(service.login({ email: `${userId}@example.test`, password })).rejects.toThrow('audit persistence failure');
    expect(await db.authSession.count({ where: { userId } })).toBe(before);
  });

  it('rolls back organization bootstrap when any audit write fails', async () => {
    const failing = db.$extends({ query: { auditEvent: { async create() { throw new Error('audit persistence failure'); } } } });
    const service = new OrganizationsService(failing as unknown as PrismaService, new AuthorizationService(db as PrismaService), writer, new NotificationService(db as PrismaService, new AuthorizationService(db as PrismaService), writer));
    const slug = `rollback-${randomUUID()}`;
    const memberships = await db.organizationMembership.count({ where: { userId } });
    await expect(service.create(userId, { name: 'Must roll back', slug })).rejects.toThrow('audit persistence failure');
    expect(await db.organization.count({ where: { slug } })).toBe(0);
    expect(await db.organizationMembership.count({ where: { userId } })).toBe(memberships);
  });

  it('rolls back refresh rotation and logout when audit persistence fails', async () => {
    const normal = app.get(AuthService);
    const tokens = await normal.login({ email: `${userId}@example.test`, password });
    const sessionId = tokens.refreshToken.split('.')[0];
    const failing = db.$extends({ query: { auditEvent: { async create() { throw new Error('audit persistence failure'); } } } });
    const config = app.get(ConfigService);
    const service = new AuthService(failing as unknown as PrismaService, new PasswordService(), new AccessTokenService(config), config, writer);
    const before = await db.authSession.count({ where: { userId } });
    await expect(service.refresh(tokens.refreshToken)).rejects.toThrow('audit persistence failure');
    expect(await db.authSession.count({ where: { userId } })).toBe(before);
    await expect(service.logout(userId, sessionId)).rejects.toThrow('audit persistence failure');
    expect((await db.authSession.findUniqueOrThrow({ where: { id: sessionId } })).revokedAt).toBeNull();
  });

  it('enforces actor and tenant foreign keys without orphan audit records', async () => {
    await expect(writer.record({ event: AUDIT_EVENTS.ORGANIZATION_UPDATED, organizationId: randomUUID() }))
      .rejects.toMatchObject({ code: 'P2003' });
    await expect(writer.record({ event: AUDIT_EVENTS.ORGANIZATION_UPDATED, organizationId, actorUserId: randomUUID() }))
      .rejects.toMatchObject({ code: 'P2003' });
  });
});


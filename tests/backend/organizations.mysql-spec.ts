// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { NotificationService } from '../../backend/src/modules/notifications/notification.service';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipStatus, OrganizationStatus, PrismaClient, UserAccountStatus } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger, type StructuredLogRecord } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService, type OrganizationResponse } from '../../backend/src/modules/organizations/organizations.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';
import { AuditService } from '../../backend/src/modules/audit/audit.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'organization-test-only-secret-not-a-real-credential';
mysqlDescribe('organization API with real IAM, RBAC and MySQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  const logs: StructuredLogRecord[] = [];
  let app: INestApplication;
  let service: OrganizationsService;
  let userA: string;
  let userB: string;
  let token: string;
  let orgA: OrganizationResponse;
  let orgB: OrganizationResponse;
  const base = '/api/v1/organizations';
  const newInput = () => ({ name: 'Organization test', slug: `org-${randomUUID()}` });

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db).compile();
    service = moduleRef.get(OrganizationsService);
    app = moduleRef.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('debug', (record) => logs.push(record)));
    await app.init();
  });
  beforeEach(async () => {
    userA = randomUUID(); userB = randomUUID();
    await db.user.createMany({ data: [userA, userB].map((id) => ({ id, email: `${id}@example.test` })) });
    const sessionId = randomUUID();
    await db.authSession.create({ data: { id: sessionId, userId: userA,
      refreshTokenHash: 'a'.repeat(32) + randomUUID().replaceAll('-', ''), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: userA, sid: sessionId, typ: 'access' }, secret, { expiresIn: 300 });
    orgA = await service.create(userA, newInput());
    orgB = await service.create(userB, newInput());
    logs.length = 0;
  });
  afterEach(async () => {
    const rows = await db.organization.findMany({ where: { memberships: { some: { userId: { in: [userA, userB] } } } }, select: { id: true } });
    const organizationId = { in: rows.map(({ id }) => id) };
    // Test-only fixture teardown in the disposable DB; no application deletion API.
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: [userA, userB] } }] } });
    await db.membershipRole.deleteMany({ where: { organizationId } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId } } });
    await db.role.deleteMany({ where: { organizationId } });
    await db.notification.deleteMany({ where: { organizationId } });
    await db.organizationMembership.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.authSession.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  it.each(['list', 'create', 'detail', 'update'])('returns 401 for missing, invalid and expired JWT on %s', async (method) => {
    for (const credential of [undefined, 'invalid.jwt', sign({ sub: userA, sid: randomUUID(), typ: 'access' }, secret, { expiresIn: -1 })]) {
      const route = method === 'detail' || method === 'update' ? `${base}/${orgA.id}` : base;
      const agent = request(app.getHttpServer());
      const req = method === 'create' ? agent.post(route).send(newInput()) : method === 'update' ? agent.patch(route).send({ name: 'Rename' }) : agent.get(route);
      if (credential) req.set('Authorization', `Bearer ${credential}`);
      const response = await req.expect(401);
      expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED', requestId: expect.any(String) } });
    }
  });

  it('normalizes creation and provisions exactly the two intended creator grants', async () => {
    const slug = `created-${randomUUID()}`;
    const response = await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${token}`)
      .send({ name: '  Created organization  ', slug: `  ${slug.toUpperCase()}  ` }).expect(201);
    expect(response.body).toEqual({ id: expect.any(String), name: 'Created organization', slug, status: 'ACTIVE',
      createdAt: expect.any(String), updatedAt: expect.any(String) });
    const membership = await db.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: response.body.id, userId: userA } },
      include: { roleAssignments: { include: { role: { include: { permissionAssignments: { include: { permission: true } } } } } } },
    });
    expect(membership.status).toBe('ACTIVE');
    expect(membership.roleAssignments).toHaveLength(1);
    const role = membership.roleAssignments[0].role;
    expect(role.organizationId).toBe(response.body.id);
    expect(role.permissionAssignments.map(({ permission }) => permission.key).sort())
      .toEqual([PERMISSIONS.ORGANIZATION_READ, PERMISSIONS.ORGANIZATION_UPDATE]);
    expect(await db.organizationMembership.count({ where: { organizationId: response.body.id } })).toBe(1);
    expect(JSON.stringify(logs)).not.toContain(token);
    expect(JSON.stringify(logs)).not.toContain(secret);
  });

  it('allows bootstrap without any active membership', async () => {
    await db.organizationMembership.updateMany({ where: { userId: userA }, data: { status: MembershipStatus.REMOVED } });
    await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${token}`).send(newInput()).expect(201);
  });

  it('rolls back organization and membership if later owner provisioning fails', async () => {
    const input = newInput();
    const failingDatabase = db.$extends({ query: { role: { async create() { throw new Error('simulated provisioning failure'); } } } });
    const failingService = new OrganizationsService(failingDatabase as unknown as PrismaService, new AuthorizationService(db as PrismaService), new AuditService(db as PrismaService), new NotificationService(db as PrismaService, new AuthorizationService(db as PrismaService), new AuditService(db as PrismaService)));
    const count = await db.organizationMembership.count({ where: { userId: userA } });
    await expect(failingService.create(userA, input)).rejects.toThrow('simulated provisioning failure');
    expect(await db.organization.count({ where: { slug: input.slug } })).toBe(0);
    expect(await db.organizationMembership.count({ where: { userId: userA } })).toBe(count);
  });

  it('rechecks membership after the HTTP guard before updating', async () => {
    const authorization = app.get(AuthorizationService);
    const original = authorization.can.bind(authorization);
    const spy = jest.spyOn(authorization, 'can').mockImplementationOnce(async (...args) => {
      const allowed = await original(...args);
      await db.organizationMembership.updateMany({ where: { userId: userA }, data: { status: MembershipStatus.SUSPENDED } });
      return allowed;
    });
    try {
      await request(app.getHttpServer()).patch(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`)
        .send({ name: 'Stale authorization' }).expect(403);
      expect((await db.organization.findUniqueOrThrow({ where: { id: orgA.id } })).name).toBe(orgA.name);
    } finally { spy.mockRestore(); }
  });

  it.each(['ownerUserId', 'owner_user_id', 'userId', 'role', 'roles', 'permissionIds', 'permissions', 'platformRole', 'systemRole', 'status', 'organization_id', 'membership'])('rejects client-controlled %s on creation', async (field) => {
      const input = newInput();
      const response = await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${token}`)
        .send({ ...input, [field]: 'SUPER_ADMIN' }).expect(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(await db.organization.count({ where: { slug: input.slug } })).toBe(0);
    });

  it.each(['../escape', 'a/b', '%2e%2e', 'foo--bar', '-foo', 'foo-', 'a b', 'ábc', 'a'.repeat(64), 'ab', ''])('rejects unsafe slug %s', async (slug) => {
      await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${token}`).send({ name: 'Name', slug }).expect(400);
    });

  it('returns a safe conflict for duplicate normalized slug without joining another tenant', async () => {
    const before = await db.organizationMembership.count({ where: { userId: userA } });
    const response = await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${token}`)
      .send({ name: 'Take over', slug: orgB.slug.toUpperCase() }).expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(JSON.stringify(response.body)).not.toContain(orgB.id);
    expect(await db.organizationMembership.count({ where: { userId: userA } })).toBe(before);
    expect(await db.organizationMembership.count({ where: { userId: userA, organizationId: orgB.id } })).toBe(0);
  });

  it('commits exactly one tenant for concurrent duplicate-slug requests', async () => {
    const input = newInput();
    const responses = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(base)
      .set('Authorization', `Bearer ${token}`).send(input)));
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const rows = await db.organization.findMany({ where: { slug: input.slug }, include: { memberships: true, roles: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0].memberships).toHaveLength(1);
    expect(rows[0].roles).toHaveLength(1);
  });

  it('lists only caller memberships with bounded keyset pagination', async () => {
    const extra = await service.create(userA, newInput());
    const first = await request(app.getHttpServer()).get(base).query({ limit: 1 }).set('Authorization', `Bearer ${token}`).expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toBe(first.body.items[0].id);
    const second = await request(app.getHttpServer()).get(base).query({ limit: 1, after: first.body.nextCursor })
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(second.body.nextCursor).toBeNull();
    expect([first.body.items[0].id, second.body.items[0].id].sort()).toEqual([orgA.id, extra.id].sort());
    const other = await request(app.getHttpServer()).get(base).query({ after: orgB.id }).set('Authorization', `Bearer ${token}`).expect(200);
    expect(other.body.items.some(({ id }: { id: string }) => id === orgB.id)).toBe(false);
  });

  it('returns an empty list when no active membership exists', async () => {
    await db.organizationMembership.updateMany({ where: { userId: userA }, data: { status: MembershipStatus.INACTIVE } });
    const response = await request(app.getHttpServer()).get(base).set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 'abc' }, { limit: 1.5 }, { after: 'bad' }, { organization_id: 'foreign' }])('validates list query %j', async (query) => {
      await request(app.getHttpServer()).get(base).query(query).set('Authorization', `Bearer ${token}`).expect(400);
    });

  it('allows read and rename only in the caller organization', async () => {
    await request(app.getHttpServer()).get(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    const response = await request(app.getHttpServer()).patch(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`)
      .send({ name: '  Renamed  ' }).expect(200);
    expect(response.body.name).toBe('Renamed');
    expect(response.body.slug).toBe(orgA.slug);
    expect((await db.organization.findUniqueOrThrow({ where: { id: orgB.id } })).name).toBe(orgB.name);
  });

  it('denies foreign, unknown and slug-based route identifiers', async () => {
    for (const id of [orgB.id, randomUUID(), orgA.slug]) {
      const response = await request(app.getHttpServer()).get(`${base}/${id}`).set('Authorization', `Bearer ${token}`).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('cannot override the route tenant through body, query, slug or headers', async () => {
    await request(app.getHttpServer()).patch(`${base}/${orgB.id}`).query({ organization_id: orgA.id, slug: orgA.slug })
      .set('x-organization-id', orgA.id).set('organization_id', orgA.id).set('Authorization', `Bearer ${token}`)
      .send({ name: 'Compromised', organization_id: orgA.id }).expect(403);
    expect((await db.organization.findUniqueOrThrow({ where: { id: orgB.id } })).name).toBe(orgB.name);
  });

  it.each(['slug', 'status', 'ownerUserId', 'roles', 'permissions', 'organizationId', 'organization_id', 'platformRole'])('rejects protected update field %s even for owner', async (field) => {
      await request(app.getHttpServer()).patch(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`)
        .send({ name: 'Name', [field]: 'SUPER_ADMIN' }).expect(400);
    });

  it.each([{}, { name: null }, { name: '' }, { name: '   ' }, { name: 'a'.repeat(201) }, { name: '\u0000bad' }])('validates update %j', async (body) => {
      await request(app.getHttpServer()).patch(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`).send(body).expect(400);
    });

  it.each([MembershipStatus.INACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.REMOVED])('denies membership %s despite stale role assignments', async (status) => {
      await db.organizationMembership.updateMany({ where: { userId: userA }, data: { status } });
      expect(await db.membershipRole.count({ where: { organizationId: orgA.id } })).toBe(1);
      await request(app.getHttpServer()).get(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`).expect(403);
      await request(app.getHttpServer()).patch(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`).send({ name: 'Denied' }).expect(403);
      const list = await request(app.getHttpServer()).get(base).set('Authorization', `Bearer ${token}`).expect(200);
      expect(list.body.items).toEqual([]);
    });

  it.each([OrganizationStatus.SUSPENDED, OrganizationStatus.ARCHIVED])('enforces organization %s consistently', async (status) => {
    await db.organization.update({ where: { id: orgA.id }, data: { status } });
    await request(app.getHttpServer()).get(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).patch(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`).send({ name: 'Denied' }).expect(403);
    const list = await request(app.getHttpServer()).get(base).set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.items).toEqual([]);
    expect(await new AuthorizationService(db as PrismaService).can(userA, PERMISSIONS.ORGANIZATION_READ, orgA.id)).toBe(false);
    await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${token}`).send({ name: 'Reuse', slug: orgA.slug }).expect(409);
  });

  it('uses permission grants, never the owner role name, for resource authorization', async () => {
    await db.rolePermission.deleteMany({ where: { role: { organizationId: orgA.id }, permission: { key: PERMISSIONS.ORGANIZATION_UPDATE } } });
    await request(app.getHttpServer()).get(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).patch(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`).send({ name: 'Denied' }).expect(403);
    await db.rolePermission.deleteMany({ where: { role: { organizationId: orgA.id } } });
    await request(app.getHttpServer()).get(`${base}/${orgA.id}`).set('Authorization', `Bearer ${token}`).expect(403);
    const list = await request(app.getHttpServer()).get(base).set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.items.map(({ id }: { id: string }) => id)).toEqual([orgA.id]);
  });

  it.each([UserAccountStatus.INACTIVE, UserAccountStatus.SUSPENDED])('denies user account %s', async (accountStatus) => {
    await db.user.update({ where: { id: userA }, data: { accountStatus } });
    await request(app.getHttpServer()).get(base).set('Authorization', `Bearer ${token}`).expect(401);
    await request(app.getHttpServer()).post(base).set('Authorization', `Bearer ${token}`).send(newInput()).expect(401);
    await expect(service.create(userA, newInput())).rejects.toMatchObject({ status: 403 });
  });

  it('allows bearer headers in configured browser CORS preflight', async () => {
    const response = await request(app.getHttpServer()).options(base).set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type').expect(204);
    expect(response.headers['access-control-allow-headers'].toLowerCase()).toContain('authorization');
  });

  it('documents all four authenticated operations and strict request schemas', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    for (const [path, methods] of [['/organizations', ['get', 'post']], ['/organizations/{organizationId}', ['get', 'patch']]] as const) {
      for (const method of methods) {
        expect(response.body.paths[path][method].security).toEqual([{ bearerAuth: [] }]);
        expect(response.body.paths[path][method].responses['401']).toBeDefined();
        expect(response.body.paths[path][method].responses['403']).toBeDefined();
      }
    }
    expect(response.body.components.schemas.CreateOrganization.additionalProperties).toBe(false);
    expect(response.body.components.schemas.UpdateOrganization.properties).toHaveProperty('name');
    expect(Object.keys(response.body.paths).some((path) => path.includes('__test'))).toBe(false);
  });
});


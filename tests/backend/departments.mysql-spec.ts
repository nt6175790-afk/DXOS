// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DepartmentStatus, MembershipStatus, OrganizationStatus, PrismaClient, UserAccountStatus } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { DepartmentsService } from '../../backend/src/modules/departments/departments.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'department-test-only-secret-not-a-real-credential';
mysqlDescribe('Department V1 with real IAM, RBAC and MySQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let userId: string, otherUser: string, sessionId: string, token: string;
  let orgA: string, orgB: string, departmentA: string, departmentB: string;
  const path = (organizationId = orgA, id?: string) => `/api/v1/organizations/${organizationId}/departments${id ? '/' + id : ''}`;
  const auth = () => `Bearer ${token}`;
  const createBody = () => ({ code: 'NEW-CODE', name: 'New department' });

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {}));
    await app.init();
  });
  beforeEach(async () => {
    userId = randomUUID(); otherUser = randomUUID(); sessionId = randomUUID();
    await db.user.createMany({ data: [userId, otherUser].map((id) => ({ id, email: `${id}@example.test` })) });
    await db.authSession.create({ data: { id: sessionId, userId, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2),
      expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: userId, sid: sessionId, typ: 'access' }, secret, { expiresIn: 300 });
    const orgs = app.get(OrganizationsService);
    orgA = (await orgs.create(userId, { name: 'A', slug: `a-${randomUUID()}` })).id;
    orgB = (await orgs.create(otherUser, { name: 'B', slug: `b-${randomUUID()}` })).id;
    const role = await db.role.findFirstOrThrow({ where: { organizationId: orgA } });
    for (const key of [PERMISSIONS.DEPARTMENT_READ, PERMISSIONS.DEPARTMENT_CREATE, PERMISSIONS.DEPARTMENT_UPDATE]) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    departmentA = (await db.department.create({ data: { organizationId: orgA, code: 'A', name: 'Department A' } })).id;
    departmentB = (await db.department.create({ data: { organizationId: orgB, code: 'B', name: 'Department B' } })).id;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const organizations = await db.organization.findMany({ where: { memberships: { some: { userId: { in: [userId, otherUser] } } } } });
    const organizationId = { in: organizations.map((row) => row.id) };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: [userId, otherUser] } }] } });
    await db.department.updateMany({ where: { organizationId }, data: { parentDepartmentId: null } });
    await db.department.deleteMany({ where: { organizationId } });
    await db.membershipRole.deleteMany({ where: { organizationId } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId } } });
    await db.role.deleteMany({ where: { organizationId } });
    await db.notification.deleteMany({ where: { organizationId } });
    await db.organizationMembership.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.authSession.deleteMany({ where: { userId: { in: [userId, otherUser] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherUser] } } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  function operation(method: string) {
    const agent = request(app.getHttpServer());
    return method === 'create' ? agent.post(path()).send(createBody()) : method === 'update' ? agent.patch(path(orgA, departmentA)).send({ name: 'Changed' })
      : agent.get(method === 'list' ? path() : path(orgA, departmentA));
  }

  it.each(['list', 'get', 'create', 'update'])('requires valid JWT for %s', async (method) => {
    for (const credential of [undefined, 'invalid', sign({ sub: userId, sid: sessionId, typ: 'access' }, secret, { expiresIn: -1 })]) {
      const req = operation(method);
      if (credential) req.set('Authorization', `Bearer ${credential}`);
      const response = await req.expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    }
  });
  it.each(['revoked', 'expired', 'missing'])('rejects %s server session despite valid JWT', async (state) => {
    if (state === 'missing') await db.authSession.delete({ where: { id: sessionId } });
    else await db.authSession.update({ where: { id: sessionId }, data: state === 'revoked' ? { revokedAt: new Date() } : { expiresAt: new Date(0) } });
    for (const method of ['list', 'get', 'create', 'update']) await operation(method).set('Authorization', auth()).expect(401);
  });
  it.each([UserAccountStatus.INACTIVE, UserAccountStatus.SUSPENDED])('rejects account %s', async (accountStatus) => {
    await db.user.update({ where: { id: userId }, data: { accountStatus } });
    for (const method of ['list', 'get', 'create', 'update']) await operation(method).set('Authorization', auth()).expect(401);
  });
  it.each([['list', PERMISSIONS.DEPARTMENT_READ], ['get', PERMISSIONS.DEPARTMENT_READ],
    ['create', PERMISSIONS.DEPARTMENT_CREATE], ['update', PERMISSIONS.DEPARTMENT_UPDATE]])('requires exact grant for %s', async (method, key) => {
    await db.rolePermission.deleteMany({ where: { role: { organizationId: orgA }, permission: { key } } });
    await operation(method).set('Authorization', auth()).expect(403);
  });
  it.each([MembershipStatus.INACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.REMOVED])('rejects membership %s', async (status) => {
    await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId }, data: { status } });
    for (const method of ['list', 'get', 'create', 'update']) await operation(method).set('Authorization', auth()).expect(403);
  });
  it.each([OrganizationStatus.SUSPENDED, OrganizationStatus.ARCHIVED])('rejects tenant %s', async (status) => {
    await db.organization.update({ where: { id: orgA }, data: { status } });
    await operation('list').set('Authorization', auth()).expect(403);
    await operation('update').set('Authorization', auth()).expect(403);
  });
  it('does not grant Department access to newly bootstrapped owners', async () => {
    const org = await app.get(OrganizationsService).create(userId, { name: 'New tenant', slug: `new-${randomUUID()}` });
    await request(app.getHttpServer()).get(path(org.id)).set('Authorization', auth()).expect(403);
    const grants = await db.rolePermission.findMany({ where: { role: { organizationId: org.id } }, include: { permission: true } });
    expect(grants.map((row) => row.permission.key).sort()).toEqual(['organization:read', 'organization:update']);
  });
  it('rejects inactive roles and does not use role names as privileges', async () => {
    await db.role.updateMany({ where: { organizationId: orgA }, data: { isActive: false, key: 'SUPER_ADMIN' } });
    await operation('get').set('Authorization', auth()).expect(403);
  });
  it('makes foreign and unknown resources indistinguishable in an authorized tenant', async () => {
    for (const id of [departmentB, randomUUID()]) {
      for (const method of ['get', 'patch'] as const) {
        const req = request(app.getHttpServer())[method](path(orgA, id)).set('Authorization', auth()).set('x-request-id', 'department-tampering-1234');
        if (method === 'patch') req.send({ name: 'Compromised' });
        const response = await req.expect(404);
        expect(response.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'The requested resource was not found.', details: {}, requestId: 'department-tampering-1234' } });
      }
    }
    expect((await db.department.findUniqueOrThrow({ where: { id: departmentB } })).name).toBe('Department B');
  });
  it('cannot switch tenant through URL, body, query or headers', async () => {
    for (const organizationId of [orgB, randomUUID(), 'not-a-uuid']) {
      await request(app.getHttpServer()).get(path(organizationId, departmentA)).set('Authorization', auth())
        .set('x-organization-id', orgA).expect(403);
      await request(app.getHttpServer()).patch(path(organizationId, departmentA)).set('Authorization', auth())
        .query({ organizationId: orgA }).send({ name: 'Bad', organizationId: orgA }).expect(403);
    }
  });
  it('keeps resource scoping even when caller belongs to both organizations', async () => {
    await db.organizationMembership.create({ data: { organizationId: orgB, userId } });
    await request(app.getHttpServer()).get(path(orgA, departmentB)).set('Authorization', auth()).expect(404);
    await request(app.getHttpServer()).get(path(orgB, departmentB)).set('Authorization', auth()).expect(403);
  });
  it('normalizes create input and exposes only the flat safe projection', async () => {
    const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).set('x-request-id', 'department-create-1234')
      .send({ code: '  ops_team  ', name: ' Operations ', description: ' First\n\tsecond ' }).expect(201);
    expect(response.body).toEqual({ id: expect.any(String), organizationId: orgA, code: 'OPS_TEAM', name: 'Operations',
      description: 'First\n\tsecond', status: 'ACTIVE', createdAt: expect.any(String), updatedAt: expect.any(String) });
    const audits = await db.auditEvent.findMany({ where: { resourceId: response.body.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ event: 'department.created', organizationId: orgA, actorUserId: userId,
      resourceType: 'department', outcome: 'SUCCESS', source: 'HTTP', requestId: 'department-create-1234', metadata: {} });
    expect(await db.notification.count({ where: { organizationId: orgA } })).toBe(0);
  });
  it('permits same code across tenants but conflicts within tenant including inactive rows', async () => {
    await db.department.update({ where: { id: departmentB }, data: { code: 'SAME' } });
    const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ code: 'same', name: 'Local' }).expect(201);
    await db.department.update({ where: { id: response.body.id }, data: { status: 'INACTIVE' } });
    const conflict = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ code: ' SAME ', name: 'Duplicate' }).expect(409);
    expect(conflict.body.error.code).toBe('CONFLICT');
    expect(JSON.stringify(conflict.body)).not.toContain(departmentB);
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: 'department.created' } })).toBe(1);
  });
  it('commits exactly one concurrent duplicate creation and success audit', async () => {
    const responses = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(path()).set('Authorization', auth()).send(createBody())));
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.department.count({ where: { organizationId: orgA, code: 'NEW-CODE' } })).toBe(1);
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: 'department.created' } })).toBe(1);
  });
  it.each(['organizationId', 'organization_id', 'parentDepartmentId', 'userId', 'roles', 'permissions', 'permissionIds', 'status', 'id', 'createdAt'])('rejects create injection %s', async (field) => {
    const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...createBody(), [field]: orgB }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(await db.department.count({ where: { organizationId: orgA, code: 'NEW-CODE' } })).toBe(0);
  });
  it.each([{ code: '' }, { code: null }, { code: 'a'.repeat(65) }, { code: 'a/b' }, { code: 'a--b' },
    { code: 'a b' }, { code: '-a' }, { code: 'a_' }, { code: 'Tiếng' }, { name: '' }, { name: null },
    { name: 'a'.repeat(201) }, { name: 'a\u0000b' }, { description: '' }, { description: 'a'.repeat(1001) },
    { description: 'a\rb' }, { description: 2 }])('rejects invalid create %j', async (fields) => {
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...createBody(), ...fields }).expect(400);
  });
  it('accepts nullable description and exact maximum lengths', async () => {
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ code: 'A'.repeat(64), name: 'n'.repeat(200), description: 'd'.repeat(1000) }).expect(201);
    const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...createBody(), description: null }).expect(201);
    expect(response.body.description).toBeNull();
  });
  it('updates name, description and lifecycle atomically with bounded audit metadata', async () => {
    const response = await request(app.getHttpServer()).patch(path(orgA, departmentA)).set('Authorization', auth()).set('x-request-id', 'department-update-1234')
      .send({ name: ' Changed ', description: ' Sensitive prose ', status: 'INACTIVE' }).expect(200);
    expect(response.body).toMatchObject({ code: 'A', name: 'Changed', description: 'Sensitive prose', status: 'INACTIVE' });
    const audit = await db.auditEvent.findFirstOrThrow({ where: { resourceId: departmentA, event: 'department.updated' } });
    expect(audit).toMatchObject({ actorUserId: userId, organizationId: orgA, requestId: 'department-update-1234', outcome: 'SUCCESS',
      metadata: { changedFields: ['name', 'description', 'status'] } });
    expect(JSON.stringify(audit)).not.toContain('Sensitive prose');
    const cleared = await request(app.getHttpServer()).patch(path(orgA, departmentA)).set('Authorization', auth()).send({ description: null, status: 'ACTIVE' }).expect(200);
    expect(cleared.body.description).toBeNull();
    expect(cleared.body.name).toBe('Changed');
    expect(cleared.body.status).toBe('ACTIVE');
  });
  it('preserves legacy code/parent on update and does not expose hierarchy', async () => {
    const child = await db.department.create({ data: { organizationId: orgA, code: 'legacy lowercase', name: 'Child', parentDepartmentId: departmentA } });
    const response = await request(app.getHttpServer()).patch(path(orgA, child.id)).set('Authorization', auth()).send({ name: 'Renamed' }).expect(200);
    expect(response.body.code).toBe('legacy lowercase');
    expect(response.body).not.toHaveProperty('parentDepartmentId');
    expect((await db.department.findUniqueOrThrow({ where: { id: child.id } })).parentDepartmentId).toBe(departmentA);
    await request(app.getHttpServer()).patch(path(orgA, departmentA)).set('Authorization', auth()).send({ status: 'INACTIVE' }).expect(200);
    expect((await db.department.findUniqueOrThrow({ where: { id: child.id } })).status).toBe('ACTIVE');
  });
  it('returns no-op without altering timestamp or writing a success audit', async () => {
    const before = await db.department.findUniqueOrThrow({ where: { id: departmentA } });
    const response = await request(app.getHttpServer()).patch(path(orgA, departmentA)).set('Authorization', auth()).send({ name: before.name }).expect(200);
    expect(response.body.updatedAt).toBe(before.updatedAt.toISOString());
    expect(await db.auditEvent.count({ where: { resourceId: departmentA, event: 'department.updated' } })).toBe(0);
  });
  it.each([{}, { code: 'NEW' }, { name: null }, { status: null }, { status: 'ARCHIVED' }, { name: ' ' },
    { description: '' }, { description: [] }, { parentDepartmentId: null }, { organizationId: 'other' }, { permissions: ['department:update'] }])('rejects update %j', async (body) => {
    await request(app.getHttpServer()).patch(path(orgA, departmentA)).set('Authorization', auth()).send(body).expect(400);
    expect(await db.auditEvent.count({ where: { resourceId: departmentA, event: 'department.updated' } })).toBe(0);
  });
  it('lists only tenant rows with deterministic keyset pagination and lifecycle filtering', async () => {
    const extra = await db.department.create({ data: { organizationId: orgA, code: 'EXTRA', name: 'Extra', status: DepartmentStatus.INACTIVE } });
    const first = await request(app.getHttpServer()).get(path()).query({ limit: 1 }).set('Authorization', auth()).expect(200);
    const second = await request(app.getHttpServer()).get(path()).query({ limit: 1, after: first.body.nextCursor }).set('Authorization', auth()).expect(200);
    expect([first.body.items[0].id, second.body.items[0].id]).toEqual([departmentA, extra.id].sort());
    expect(second.body.nextCursor).toBeNull();
    const filtered = await request(app.getHttpServer()).get(path()).query({ status: 'INACTIVE' }).set('Authorization', auth()).expect(200);
    expect(filtered.body.items.map((r: { id: string }) => r.id)).toEqual([extra.id]);
    const foreignCursor = await request(app.getHttpServer()).get(path()).query({ after: departmentB }).set('Authorization', auth()).expect(200);
    expect(foreignCursor.body.items.every((r: { organizationId: string }) => r.organizationId === orgA)).toBe(true);
  });
  it('uses default 25 and maximum 100 with bounded page size', async () => {
    await db.department.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ organizationId: orgA, code: `BATCH-${i}`, name: 'Batch' })) });
    const first = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).expect(200);
    expect(first.body.items).toHaveLength(25);
    expect(first.body.nextCursor).toBe(first.body.items[24].id);
    const max = await request(app.getHttpServer()).get(path()).query({ limit: 100 }).set('Authorization', auth()).expect(200);
    expect(max.body.items).toHaveLength(100);
  });
  it.each([{ limit: 0 }, { limit: 101 }, { limit: '1.5' }, { limit: '' }, { limit: ['1', '2'] },
    { after: 'bad' }, { status: 'active' }, { status: ['ACTIVE', 'INACTIVE'] }, { organizationId: 'other' }, { sort: 'name' }])('rejects query %j', async (query) => {
    await request(app.getHttpServer()).get(path()).query(query).set('Authorization', auth()).expect(400);
  });
  it('rejects detail query fields and malformed resource UUIDs', async () => {
    await request(app.getHttpServer()).get(path(orgA, departmentA)).query({ organizationId: orgB }).set('Authorization', auth()).expect(400);
    await request(app.getHttpServer()).get(path(orgA, 'bad-id')).set('Authorization', auth()).expect(400);
  });
  it('rejects malformed JSON, non-JSON and arrays using safe errors', async () => {
    for (const raw of ['{', '[]', 'null']) {
      const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).set('Content-Type', 'application/json').send(raw).expect(400);
      expect(response.body.error.requestId).toEqual(expect.any(String));
    }
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).type('form').send(createBody()).expect(400);
  });
  it('enforces the 64 KiB body limit before JSON parsing', async () => {
    const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...createBody(), description: 'x'.repeat(65536) }).expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.body.error.requestId).toEqual(expect.any(String));
  });
  it('enforces the decoded body limit for compressed input and case-insensitive routes', async () => {
    const payload = JSON.stringify({ ...createBody(), description: 'x'.repeat(65536) });
    await request(app.getHttpServer()).post(path().toUpperCase()).set('Authorization', auth())
      .set('Content-Type', 'application/json').send(payload).expect(413);
    const compressed = request(app.getHttpServer()).post(path()).set('Authorization', auth())
      .set('Content-Type', 'application/json').set('Content-Encoding', 'gzip');
    // Write raw chunked bytes; .send(Buffer) with application/json would JSON-serialize the Buffer.
    compressed.write(gzipSync(payload));
    await compressed.expect(413);
  });
  it('returns an empty scoped page when no rows match the lifecycle filter', async () => {
    const response = await request(app.getHttpServer()).get(path()).query({ status: 'INACTIVE' }).set('Authorization', auth()).expect(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });
  it.each(['create', 'update'])('rolls back %s when audit persistence fails', async (method) => {
    const writer = app.get(AuditService);
    jest.spyOn(writer, 'record').mockRejectedValueOnce(new Error('injected audit failure'));
    await operation(method).set('Authorization', auth()).expect(500);
    expect(await db.department.count({ where: { organizationId: orgA, code: 'NEW-CODE' } })).toBe(0);
    expect((await db.department.findUniqueOrThrow({ where: { id: departmentA } })).name).toBe('Department A');
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: { startsWith: 'department.' } } })).toBe(0);
  });
  it('does not write success audit when persistence fails', async () => {
    const failing = db.$extends({ query: { department: { async create() { throw new Error('injected write failure'); } } } });
    const service = new DepartmentsService(failing as unknown as PrismaService, app.get(AuthorizationService), app.get(AuditService));
    await expect(service.create(userId, orgA, createBody())).rejects.toThrow('injected write failure');
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: 'department.created' } })).toBe(0);
  });
  it('rolls back both an already-inserted audit and mutation if the operation fails before commit', async () => {
    const writer = app.get(AuditService);
    const record = writer.record.bind(writer);
    jest.spyOn(writer, 'record').mockImplementationOnce(async (...args) => {
      await record(...args);
      throw new Error('injected post-audit failure');
    });
    await operation('create').set('Authorization', auth()).expect(500);
    expect(await db.department.count({ where: { organizationId: orgA, code: 'NEW-CODE' } })).toBe(0);
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: 'department.created' } })).toBe(0);
  });
  it.each(['list', 'get', 'create', 'update'])('rechecks revoked membership after the guard on %s', async (method) => {
    const authorization = app.get(AuthorizationService);
    const original = authorization.can.bind(authorization);
    jest.spyOn(authorization, 'can').mockImplementationOnce(async (...args) => {
      const allowed = await original(...args);
      await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId }, data: { status: 'SUSPENDED' } });
      return allowed;
    });
    await operation(method).set('Authorization', auth()).expect(403);
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: { startsWith: 'department.' } } })).toBe(0);
  });
  it('serves all four operations, exact permissions and strict flat schemas in OpenAPI', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    const collection = body.paths['/organizations/{organizationId}/departments'];
    const detail = body.paths['/organizations/{organizationId}/departments/{departmentId}'];
    for (const [operation, permission] of [[collection.get, 'department:read'], [collection.post, 'department:create'],
      [detail.get, 'department:read'], [detail.patch, 'department:update']]) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation['x-required-permission']).toBe(permission);
      for (const status of ['400', '401', '403', '404', '409', '500']) expect(operation.responses[status]).toBeDefined();
    }
    expect(body.components.schemas.CreateDepartment.additionalProperties).toBe(false);
    expect(body.components.schemas.UpdateDepartment.minProperties).toBe(1);
    expect(Object.keys(body.components.schemas.UpdateDepartment.properties).sort()).toEqual(['description', 'name', 'status']);
    expect(body.components.schemas.Department.properties.parentDepartmentId).toBeUndefined();
    expect(body.components.schemas.AuditEvent.properties.resourceType.enum).toContain('department');
    expect(body.components.schemas.AuditEvent.properties.metadata.properties.changedFields.maxItems).toBeGreaterThanOrEqual(3);
  });
});


// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
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
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { OrganizationMembershipService } from '../../backend/src/modules/organizations/organization-membership.service';
import { DepartmentsService } from '../../backend/src/modules/departments/departments.service';
import { EmployeesService } from '../../backend/src/modules/people/employees.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'employee-test-only-secret-not-a-real-credential';
mysqlDescribe('Employee V1 with real IAM, RBAC and MySQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  const logs: StructuredLogRecord[] = [];
  let app: INestApplication;
  let actor: string, target: string, peer: string, foreignUser: string, outsider: string;
  let sessionId: string, token: string, orgA: string, orgB: string, deptA: string, deptB: string, empA: string, empB: string;
  let users: string[];
  const path = (organizationId = orgA, id?: string) => `/api/v1/organizations/${organizationId}/employees${id ? '/' + id : ''}`;
  const auth = () => `Bearer ${token}`;
  const input = () => ({ userId: target, employeeCode: 'NEW-EMP', displayName: 'New employee' });
  const departmentPath = (id: string) => `/api/v1/organizations/${orgA}/departments/${id}`;

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('debug', (record) => logs.push(record)));
    await app.init();
  });
  beforeEach(async () => {
    [actor, target, peer, foreignUser, outsider] = Array.from({ length: 5 }, () => randomUUID());
    users = [actor, target, peer, foreignUser, outsider];
    await db.user.createMany({ data: users.map((id) => ({ id, email: `${id}@example.test`, displayName: 'Global name', passwordHash: 'test-only-hash-never-return' })) });
    sessionId = randomUUID();
    await db.authSession.create({ data: { id: sessionId, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: sessionId, typ: 'access' }, secret, { expiresIn: 300 });
    const orgs = app.get(OrganizationsService);
    orgA = (await orgs.create(actor, { name: 'A', slug: `a-${randomUUID()}` })).id;
    orgB = (await orgs.create(foreignUser, { name: 'B', slug: `b-${randomUUID()}` })).id;
    await db.organizationMembership.createMany({ data: [target, peer].map((userId) => ({ userId, organizationId: orgA })) });
    const role = await db.role.findFirstOrThrow({ where: { organizationId: orgA } });
    for (const key of [PERMISSIONS.EMPLOYEE_READ, PERMISSIONS.EMPLOYEE_CREATE, PERMISSIONS.EMPLOYEE_UPDATE, PERMISSIONS.DEPARTMENT_UPDATE]) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    deptA = (await db.department.create({ data: { organizationId: orgA, code: 'A', name: 'Department A' } })).id;
    deptB = (await db.department.create({ data: { organizationId: orgB, code: 'B', name: 'Department B' } })).id;
    empA = (await db.employee.create({ data: { organizationId: orgA, userId: actor, employeeCode: 'ACTOR', displayName: 'Actor profile', departmentId: deptA } })).id;
    empB = (await db.employee.create({ data: { organizationId: orgB, userId: foreignUser, employeeCode: 'FOREIGN', displayName: 'Foreign profile', departmentId: deptB } })).id;
    logs.length = 0;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const orgs = await db.organization.findMany({ where: { memberships: { some: { userId: { in: users } } } } });
    const organizationId = { in: orgs.map((row) => row.id) };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: users } }] } });
    await db.employee.deleteMany({ where: { organizationId } });
    await db.department.deleteMany({ where: { organizationId } });
    await db.membershipRole.deleteMany({ where: { organizationId } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId } } });
    await db.role.deleteMany({ where: { organizationId } });
    await db.notification.deleteMany({ where: { organizationId } });
    await db.organizationMembership.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  function operation(method: string) {
    const agent = request(app.getHttpServer());
    return method === 'create' ? agent.post(path()).send(input()) : method === 'update' ? agent.patch(path(orgA, empA)).send({ displayName: 'Changed' })
      : agent.get(method === 'list' ? path() : path(orgA, empA));
  }
  const employeeAudits = () => db.auditEvent.count({ where: { organizationId: orgA, event: { startsWith: 'employee.' } } });

  it.each(['list', 'get', 'create', 'update'])('requires valid authentication for %s', async (method) => {
    for (const credential of [undefined, 'invalid', sign({ sub: actor, sid: sessionId, typ: 'access' }, secret, { expiresIn: -1 })]) {
      const req = operation(method);
      if (credential) req.set('Authorization', `Bearer ${credential}`);
      const response = await req.expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    }
  });
  it.each(['expired', 'revoked', 'missing'])('rejects %s server-side session', async (state) => {
    if (state === 'missing') await db.authSession.delete({ where: { id: sessionId } });
    else await db.authSession.update({ where: { id: sessionId }, data: state === 'expired' ? { expiresAt: new Date(0) } : { revokedAt: new Date() } });
    for (const method of ['list', 'get', 'create', 'update']) await operation(method).set('Authorization', auth()).expect(401);
  });
  it.each([UserAccountStatus.INACTIVE, UserAccountStatus.SUSPENDED])('rejects actor account %s', async (accountStatus) => {
    await db.user.update({ where: { id: actor }, data: { accountStatus } });
    for (const method of ['list', 'get', 'create', 'update']) await operation(method).set('Authorization', auth()).expect(401);
  });
  it.each([['list', PERMISSIONS.EMPLOYEE_READ], ['get', PERMISSIONS.EMPLOYEE_READ], ['create', PERMISSIONS.EMPLOYEE_CREATE], ['update', PERMISSIONS.EMPLOYEE_UPDATE]])(
    'requires exact permission for %s', async (method, key) => {
      await db.rolePermission.deleteMany({ where: { role: { organizationId: orgA }, permission: { key } } });
      await operation(method).set('Authorization', auth()).expect(403);
    });
  it.each([MembershipStatus.INACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.REMOVED])('rejects actor membership %s despite Employee existing', async (status) => {
    await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId: actor }, data: { status } });
    for (const method of ['list', 'get', 'create', 'update']) await operation(method).set('Authorization', auth()).expect(403);
  });
  it.each([OrganizationStatus.SUSPENDED, OrganizationStatus.ARCHIVED])('rejects tenant %s', async (status) => {
    await db.organization.update({ where: { id: orgA }, data: { status } });
    await operation('list').set('Authorization', auth()).expect(403);
    await operation('create').set('Authorization', auth()).expect(403);
  });
  it('does not grant employee permissions to newly created owners', async () => {
    const org = await app.get(OrganizationsService).create(actor, { name: 'New', slug: `new-${randomUUID()}` });
    await request(app.getHttpServer()).get(path(org.id)).set('Authorization', auth()).expect(403);
    const rows = await db.rolePermission.findMany({ where: { role: { organizationId: org.id } }, include: { permission: true } });
    expect(rows.map((row) => row.permission.key).sort()).toEqual(['organization:read', 'organization:update']);
  });
  it('does not use inactive roles or role names as implicit grants', async () => {
    await db.role.updateMany({ where: { organizationId: orgA }, data: { isActive: false, key: 'SUPER_ADMIN' } });
    await operation('get').set('Authorization', auth()).expect(403);
  });

  it('creates a canonical profile without modifying credentials or provisioning access', async () => {
    const snapshot = async () => ({ users: await db.user.findMany({ where: { id: { in: users } }, orderBy: { id: 'asc' } }),
      memberships: await db.organizationMembership.findMany({ where: { organizationId: { in: [orgA, orgB] } }, orderBy: { id: 'asc' } }),
      roles: await db.role.count(), permissions: await db.permission.count(), grants: await db.rolePermission.count(),
      assignments: await db.membershipRole.count(), sessions: await db.authSession.findMany({ where: { userId: { in: users } }, orderBy: { id: 'asc' } }) });
    const before = await snapshot();
    const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).set('x-request-id', 'employee-create-1234')
      .send({ userId: target, employeeCode: ' emp_01 ', displayName: ' Business name ', departmentId: deptA, jobTitle: ' Engineer ', phone: ' +84901234567 ' }).expect(201);
    expect(response.body).toEqual({ id: expect.any(String), organizationId: orgA, userId: target, employeeCode: 'EMP_01', displayName: 'Business name',
      departmentId: deptA, jobTitle: 'Engineer', phone: '+84901234567', status: 'ACTIVE', createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(await snapshot()).toEqual(before);
    const event = await db.auditEvent.findFirstOrThrow({ where: { resourceId: response.body.id } });
    expect(event).toMatchObject({ event: 'employee.created', resourceType: 'employee', organizationId: orgA, actorUserId: actor,
      requestId: 'employee-create-1234', outcome: 'SUCCESS', source: 'HTTP', metadata: {} });
    const read = await request(app.getHttpServer()).get(path(orgA, response.body.id)).set('Authorization', auth()).expect(200);
    expect(read.body).toEqual(response.body);
    const serialized = JSON.stringify({ response: response.body, logs, event });
    for (const value of ['passwordHash', 'test-only-hash-never-return', 'refreshTokenHash', token, secret]) expect(serialized).not.toContain(value);
    expect(JSON.stringify(event)).not.toContain('+84901234567');
    expect(await db.notification.count({ where: { organizationId: orgA } })).toBe(0);
  });
  it('defaults optional fields to null and status ACTIVE', async () => {
    const { body } = await operation('create').set('Authorization', auth()).expect(201);
    expect(body).toMatchObject({ departmentId: null, jobTitle: null, phone: null, status: 'ACTIVE' });
  });
  it('rejects duplicate user profile even under another code and inactive status', async () => {
    await db.employee.update({ where: { id: empA }, data: { status: 'INACTIVE' } });
    const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), userId: actor }).expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(await employeeAudits()).toBe(0);
  });
  it('rejects duplicate canonical code for a different user but allows it across tenants', async () => {
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), employeeCode: ' actor ' }).expect(409);
    const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), employeeCode: ' foreign ' }).expect(201);
    expect(response.body.employeeCode).toBe('FOREIGN');
  });
  it('allows one global User to have separate profiles in organizations with existing memberships', async () => {
    await db.organizationMembership.create({ data: { organizationId: orgA, userId: foreignUser } });
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), userId: foreignUser }).expect(201);
    expect(await db.employee.count({ where: { userId: foreignUser } })).toBe(2);
  });
  it.each(['user', 'code'])('serializes concurrent duplicate %s creation', async (kind) => {
    const bodies = [input(), { ...input(), ...(kind === 'user' ? { employeeCode: 'OTHER' } : { userId: peer }) }];
    const responses = await Promise.all(bodies.map((body) => request(app.getHttpServer()).post(path()).set('Authorization', auth()).send(body)));
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await employeeAudits()).toBe(1);
  });
  it('makes nonexistent, foreign-only and non-member Users indistinguishable', async () => {
    for (const userId of [randomUUID(), foreignUser, outsider]) {
      const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), userId }).expect(404);
      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', details: {} });
      expect(JSON.stringify(response.body)).not.toContain(userId);
    }
    expect(await employeeAudits()).toBe(0);
  });
  it.each([MembershipStatus.INACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.REMOVED])('rejects target membership %s', async (status) => {
    await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId: target }, data: { status } });
    await operation('create').set('Authorization', auth()).expect(409);
    expect(await employeeAudits()).toBe(0);
  });
  it.each([UserAccountStatus.INACTIVE, UserAccountStatus.SUSPENDED])('rejects target User %s', async (accountStatus) => {
    await db.user.update({ where: { id: target }, data: { accountStatus } });
    await operation('create').set('Authorization', auth()).expect(409);
  });
  it('rejects foreign, missing and inactive department references on create/update', async () => {
    for (const id of [deptB, randomUUID()]) {
      await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), departmentId: id }).expect(404);
      await request(app.getHttpServer()).patch(path(orgA, empA)).set('Authorization', auth()).send({ departmentId: id }).expect(404);
    }
    await db.department.update({ where: { id: deptA }, data: { status: 'INACTIVE' } });
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), departmentId: deptA }).expect(409);
    const another = await db.employee.create({ data: { organizationId: orgA, userId: peer, employeeCode: 'PEER', displayName: 'Peer' } });
    await request(app.getHttpServer()).patch(path(orgA, another.id)).set('Authorization', auth()).send({ departmentId: deptA }).expect(409);
  });
  it('rejects foreign employee read/update IDs without existence disclosure', async () => {
    for (const id of [empB, randomUUID()]) {
      for (const method of ['get', 'patch'] as const) {
        const req = request(app.getHttpServer())[method](path(orgA, id)).set('Authorization', auth()).set('x-request-id', 'employee-tampering-1234');
        if (method === 'patch') req.send({ displayName: 'Bad' });
        const response = await req.expect(404);
        expect(response.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'The requested resource was not found.', details: {}, requestId: 'employee-tampering-1234' } });
      }
    }
    expect((await db.employee.findUniqueOrThrow({ where: { id: empB } })).displayName).toBe('Foreign profile');
  });
  it('cannot override URL tenant using body, query or headers', async () => {
    for (const organizationId of [orgB, randomUUID(), 'bad']) {
      await request(app.getHttpServer()).get(path(organizationId, empA)).set('Authorization', auth()).set('x-organization-id', orgA).expect(403);
      await request(app.getHttpServer()).patch(path(organizationId, empA)).set('Authorization', auth()).query({ organizationId: orgA })
        .send({ displayName: 'Bad', organizationId: orgA }).expect(403);
    }
  });
  it.each(['organizationId', 'organization_id', 'membershipId', 'role', 'roles', 'permissions', 'permissionIds', 'password', 'passwordHash', 'AuthSession', 'status', 'id', 'createdAt'])('rejects create injection %s', async (key) => {
    const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), [key]: 'UNTRUSTED' }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(await employeeAudits()).toBe(0);
  });
  it.each([{ userId: 'bad' }, { userId: null }, { employeeCode: '' }, { employeeCode: 'a--b' }, { employeeCode: 'a/b' },
    { employeeCode: 'a'.repeat(65) }, { employeeCode: null }, { displayName: '' }, { displayName: null }, { displayName: 'a'.repeat(201) },
    { displayName: 'a\u0000b' }, { departmentId: 'bad' }, { jobTitle: '' }, { jobTitle: 'a'.repeat(201) }, { jobTitle: 'a\nb' },
    { phone: '' }, { phone: 123 }, { phone: '+0123456789' }, { phone: '0901234567' }, { phone: '+1234567' }, { phone: '+1234567890123456' }])('rejects create validation %j', async (fields) => {
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), ...fields }).expect(400);
  });
  it('accepts maximum bounded business fields', async () => {
    await request(app.getHttpServer()).post(path()).set('Authorization', auth())
      .send({ ...input(), employeeCode: 'A'.repeat(64), displayName: 'N'.repeat(200), jobTitle: 'J'.repeat(200), phone: '+123456789012345' }).expect(201);
  });
  it('updates all editable fields, clears nullable fields and audits names only', async () => {
    const nextDept = await db.department.create({ data: { organizationId: orgA, code: 'NEXT', name: 'Next' } });
    const response = await request(app.getHttpServer()).patch(path(orgA, empA)).set('Authorization', auth()).set('x-request-id', 'employee-update-1234')
      .send({ displayName: ' Changed ', jobTitle: ' Lead ', phone: '+84901234567', departmentId: nextDept.id, status: 'INACTIVE' }).expect(200);
    expect(response.body).toMatchObject({ displayName: 'Changed', jobTitle: 'Lead', phone: '+84901234567', departmentId: nextDept.id, status: 'INACTIVE', userId: actor, employeeCode: 'ACTOR' });
    const event = await db.auditEvent.findFirstOrThrow({ where: { resourceId: empA, event: 'employee.updated' } });
    expect(event).toMatchObject({ actorUserId: actor, organizationId: orgA, requestId: 'employee-update-1234', outcome: 'SUCCESS',
      metadata: { changedFields: ['displayName', 'jobTitle', 'phone', 'departmentId', 'status'] } });
    expect(JSON.stringify(event)).not.toContain('+84901234567');
    const cleared = await request(app.getHttpServer()).patch(path(orgA, empA)).set('Authorization', auth())
      .send({ jobTitle: null, phone: null, departmentId: null, status: 'ACTIVE' }).expect(200);
    expect(cleared.body).toMatchObject({ displayName: 'Changed', jobTitle: null, phone: null, departmentId: null, status: 'ACTIVE' });
    expect((await db.user.findUniqueOrThrow({ where: { id: actor } })).displayName).toBe('Global name');
    await operation('list').set('Authorization', auth()).expect(200);
  });
  it('no-op preserves timestamps and emits no audit', async () => {
    const before = await db.employee.findUniqueOrThrow({ where: { id: empA } });
    const response = await request(app.getHttpServer()).patch(path(orgA, empA)).set('Authorization', auth()).send({ displayName: ' Actor profile ', phone: null }).expect(200);
    expect(response.body.updatedAt).toBe(before.updatedAt.toISOString());
    expect(await employeeAudits()).toBe(0);
  });
  it.each([{}, { employeeCode: 'CHANGED' }, { userId: 'other' }, { organizationId: 'other' }, { membershipId: 'other' },
    { displayName: null }, { displayName: '' }, { jobTitle: [] }, { phone: 'bad' }, { status: null }, { status: 'TERMINATED' }, { departmentId: '' }, { permissions: [] }])('rejects update %j', async (body) => {
    await request(app.getHttpServer()).patch(path(orgA, empA)).set('Authorization', auth()).send(body).expect(400);
    expect(await employeeAudits()).toBe(0);
  });
  it('retains inactive historical department references without changing Department behavior', async () => {
    await request(app.getHttpServer()).patch(departmentPath(deptA)).set('Authorization', auth()).send({ status: 'INACTIVE' }).expect(200);
    const response = await request(app.getHttpServer()).patch(path(orgA, empA)).set('Authorization', auth()).send({ displayName: 'Historical', departmentId: deptA }).expect(200);
    expect(response.body.departmentId).toBe(deptA);
    await request(app.getHttpServer()).patch(path(orgA, empA)).set('Authorization', auth()).send({ departmentId: null }).expect(200);
    expect((await db.department.findUniqueOrThrow({ where: { id: deptA } })).status).toBe('INACTIVE');
  });
  it.each(['membership', 'user'])('blocks reactivation with ineligible %s but permits historical profile edits', async (kind) => {
    const profile = await db.employee.create({ data: { organizationId: orgA, userId: target, employeeCode: 'TARGET', displayName: 'Target', status: 'INACTIVE' } });
    if (kind === 'membership') await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId: target }, data: { status: 'SUSPENDED' } });
    else await db.user.update({ where: { id: target }, data: { accountStatus: 'INACTIVE' } });
    await request(app.getHttpServer()).patch(path(orgA, profile.id)).set('Authorization', auth()).send({ status: 'ACTIVE' }).expect(409);
    await request(app.getHttpServer()).patch(path(orgA, profile.id)).set('Authorization', auth()).send({ jobTitle: 'Historical label' }).expect(200);
    expect((await db.employee.findUniqueOrThrow({ where: { id: profile.id } })).status).toBe('INACTIVE');
  });
  it('Employee INACTIVE does not revoke membership, permissions or authentication', async () => {
    await request(app.getHttpServer()).patch(path(orgA, empA)).set('Authorization', auth()).send({ status: 'INACTIVE' }).expect(200);
    const membership = await db.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgA, userId: actor } } });
    expect(membership.status).toBe('ACTIVE');
    await operation('create').set('Authorization', auth()).expect(201);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', auth()).expect(200);
  });
  it('paginates tenant rows in deterministic order and filters without foreign lookups', async () => {
    const extra = await db.employee.create({ data: { organizationId: orgA, userId: target, employeeCode: 'TARGET', displayName: 'Target', status: 'INACTIVE' } });
    const first = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ limit: 1 }).expect(200);
    const second = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ limit: 1, after: first.body.nextCursor }).expect(200);
    expect([first.body.items[0].id, second.body.items[0].id]).toEqual([empA, extra.id].sort());
    expect(second.body.nextCursor).toBeNull();
    const filtered = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ status: 'INACTIVE', userId: target }).expect(200);
    expect(filtered.body.items.map((r: { id: string }) => r.id)).toEqual([extra.id]);
    const dept = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ departmentId: deptA }).expect(200);
    expect(dept.body.items.map((r: { id: string }) => r.id)).toEqual([empA]);
    for (const query of [{ departmentId: deptB }, { userId: foreignUser }, { userId: randomUUID() }]) {
      const empty = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query(query).expect(200);
      expect(empty.body).toEqual({ items: [], nextCursor: null });
    }
    const cursor = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ after: empB }).expect(200);
    expect(cursor.body.items.every((row: { organizationId: string }) => row.organizationId === orgA)).toBe(true);
  });
  it('bounds default page size at 25 and maximum at 100', async () => {
    const extra = Array.from({ length: 100 }, () => randomUUID()); users.push(...extra);
    await db.user.createMany({ data: extra.map((id) => ({ id, email: `${id}@example.test` })) });
    await db.organizationMembership.createMany({ data: extra.map((userId) => ({ userId, organizationId: orgA })) });
    await db.employee.createMany({ data: extra.map((userId, i) => ({ userId, organizationId: orgA, employeeCode: `BATCH-${i}`, displayName: 'Batch' })) });
    const first = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).expect(200);
    expect(first.body.items).toHaveLength(25);
    const max = await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query({ limit: 100 }).expect(200);
    expect(max.body.items).toHaveLength(100);
    expect(max.body.nextCursor).toBe(max.body.items[99].id);
  });
  it.each([{ limit: 0 }, { limit: 101 }, { limit: '1.5' }, { limit: ['1', '2'] }, { after: 'bad' },
    { userId: 'bad' }, { departmentId: 'bad' }, { status: 'active' }, { membershipId: 'old' }, { organizationId: 'other' }, { sort: 'name' }])('rejects query %j', async (query) => {
    await request(app.getHttpServer()).get(path()).set('Authorization', auth()).query(query).expect(400);
  });
  it('rejects malformed detail UUID and unexpected detail/create query fields', async () => {
    await request(app.getHttpServer()).get(path(orgA, 'bad')).set('Authorization', auth()).expect(400);
    await request(app.getHttpServer()).get(path(orgA, empA)).set('Authorization', auth()).query({ userId: target }).expect(400);
    await operation('create').set('Authorization', auth()).query({ role: 'admin' }).expect(400);
  });
  it('rejects malformed JSON, arrays and non-JSON payloads', async () => {
    for (const raw of ['{', '[]', 'null']) {
      const response = await request(app.getHttpServer()).post(path()).set('Authorization', auth()).type('json').send(raw).expect(400);
      expect(response.body.error.requestId).toEqual(expect.any(String));
    }
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).type('form').send(input()).expect(400);
  });
  it('limits plain and compressed/chunked bodies to 64 KiB including case-insensitive routes', async () => {
    const payload = JSON.stringify({ ...input(), displayName: 'x'.repeat(65536) });
    const response = await request(app.getHttpServer()).post(path().toUpperCase()).set('Authorization', auth()).type('json').send(payload).expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    const compressed = request(app.getHttpServer()).post(path()).set('Authorization', auth()).type('json').set('Content-Encoding', 'gzip');
    compressed.write(gzipSync(payload));
    await compressed.expect(413);
  });
  it.each(['create', 'update'])('rolls back %s and audit when audit write fails', async (method) => {
    jest.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('injected audit failure'));
    await operation(method).set('Authorization', auth()).expect(500);
    expect(await db.employee.count({ where: { organizationId: orgA, userId: target } })).toBe(0);
    expect((await db.employee.findUniqueOrThrow({ where: { id: empA } })).displayName).toBe('Actor profile');
    expect(await employeeAudits()).toBe(0);
  });
  it('rolls back an already-written audit if execution fails before commit', async () => {
    const writer = app.get(AuditService); const original = writer.record.bind(writer);
    jest.spyOn(writer, 'record').mockImplementationOnce(async (...args) => { await original(...args); throw new Error('post-audit failure'); });
    await operation('create').set('Authorization', auth()).expect(500);
    expect(await db.employee.count({ where: { organizationId: orgA, userId: target } })).toBe(0);
    expect(await employeeAudits()).toBe(0);
  });
  it('does not emit success audit after Employee persistence failure', async () => {
    const failing = db.$extends({ query: { employee: { async create() { throw new Error('injected persistence failure'); } } } });
    const service = new EmployeesService(failing as unknown as PrismaService, app.get(AuthorizationService), app.get(AuditService),
      app.get(OrganizationMembershipService), app.get(DepartmentsService));
    await expect(service.create(actor, orgA, input())).rejects.toThrow('injected persistence failure');
    expect(await employeeAudits()).toBe(0);
  });
  it.each(['list', 'get', 'create', 'update'])('rechecks actor membership after the HTTP guard on %s', async (method) => {
    const authorization = app.get(AuthorizationService); const original = authorization.can.bind(authorization);
    jest.spyOn(authorization, 'can').mockImplementationOnce(async (...args) => {
      const allowed = await original(...args);
      await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId: actor }, data: { status: 'SUSPENDED' } });
      return allowed;
    });
    await operation(method).set('Authorization', auth()).expect(403);
    expect(await employeeAudits()).toBe(0);
  });
  it.each(['membership', 'department'])('rechecks target %s changed after HTTP guard', async (kind) => {
    const authorization = app.get(AuthorizationService); const original = authorization.can.bind(authorization);
    jest.spyOn(authorization, 'can').mockImplementationOnce(async (...args) => {
      const allowed = await original(...args);
      if (kind === 'membership') await db.organizationMembership.updateMany({ where: { organizationId: orgA, userId: target }, data: { status: 'SUSPENDED' } });
      else await db.department.update({ where: { id: deptA }, data: { status: 'INACTIVE' } });
      return allowed;
    });
    await request(app.getHttpServer()).post(path()).set('Authorization', auth()).send({ ...input(), departmentId: deptA }).expect(409);
    expect(await employeeAudits()).toBe(0);
  });
  it('database constraints reject missing membership and foreign department independent of HTTP checks', async () => {
    await expect(db.employee.create({ data: { organizationId: orgA, userId: outsider, employeeCode: 'OUT', displayName: 'Bad' } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.employee.create({ data: { organizationId: orgA, userId: target, employeeCode: 'BAD-DEPT', displayName: 'Bad', departmentId: deptB } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.organizationMembership.delete({ where: { organizationId_userId: { organizationId: orgA, userId: actor } } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.department.delete({ where: { id: deptA } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('documents all four operations, revised payload and credential-free response', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    const collection = body.paths['/organizations/{organizationId}/employees'];
    const detail = body.paths['/organizations/{organizationId}/employees/{employeeId}'];
    for (const [op, key] of [[collection.get, 'employee:read'], [collection.post, 'employee:create'], [detail.get, 'employee:read'], [detail.patch, 'employee:update']]) {
      expect(op.security).toEqual([{ bearerAuth: [] }]); expect(op['x-required-permission']).toBe(key);
      for (const code of ['400', '401', '403', '404', '409', '500']) expect(op.responses[code]).toBeDefined();
    }
    expect(body.components.schemas.CreateEmployee.required.sort()).toEqual(['displayName', 'employeeCode', 'userId']);
    expect(body.components.schemas.CreateEmployee.additionalProperties).toBe(false);
    expect(Object.keys(body.components.schemas.UpdateEmployee.properties).sort()).toEqual(['departmentId', 'displayName', 'jobTitle', 'phone', 'status']);
    for (const field of ['passwordHash', 'authSessions', 'membershipId', 'roles']) expect(body.components.schemas.Employee.properties).not.toHaveProperty(field);
    expect(body.components.schemas.AuditEvent.properties.resourceType.enum).toContain('employee');
  });
});


// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomBytes, randomUUID } from 'node:crypto';
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
import { PERMISSIONS as P } from '../../backend/src/modules/rbac/permission-catalog';
const url = process.env.RBAC_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const secret = 'organization-accounts-disposable-test-only-secret';
suite('organization account/role administration', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused@localhost/unused' } } });
  let app: INestApplication; let org: string; let foreign: string; let actor: string; let membership: string; let role: string; let token: string;
  const ids: string[] = [];
  const http = () => request(app.getHttpServer());
  const endpoint = (p: string, tenant = org) => `/api/v1/organizations/${tenant}/${p}`;
  const headers = () => ({ Authorization: `Bearer ${token}` });
  const accountInput = () => ({ email: `${randomUUID()}@example.test`, displayName: 'Fixture member', password: randomBytes(24).toString('base64url') });
  const createUser = () => http().post(endpoint('users')).set(headers()).send(accountInput());
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw Error('Disposable DB required');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {})); await app.init();
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });
  beforeEach(async () => {
    ids.length = 0; actor = randomUUID(); ids.push(actor);
    await db.user.create({ data: { id: actor, email: `${actor}@example.test`, passwordHash: 'unused-session-fixture' } });
    const session = await db.authSession.create({ data: { userId: actor, refreshTokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session.id, typ: 'access' }, secret, { expiresIn: 300 });
    org = (await db.organization.create({ data: { name: 'Account fixture', slug: `accounts-${randomUUID()}` } })).id;
    foreign = (await db.organization.create({ data: { name: 'Other account tenant', slug: `foreign-${randomUUID()}` } })).id;
    membership = (await db.organizationMembership.create({ data: { organizationId: org, userId: actor } })).id;
    role = (await db.role.create({ data: { organizationId: org, key: 'fixture-operator', name: 'Fixture operator' } })).id;
    await db.membershipRole.create({ data: { organizationId: org, membershipId: membership, roleId: role } });
    for (const key of Object.values(P)) { const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } }); await db.rolePermission.create({ data: { roleId: role, permissionId: permission.id } }); }
  });
  afterEach(async () => {
    const members = await db.organizationMembership.findMany({ where: { organizationId: { in: [org, foreign] } }, select: { userId: true } });
    const userIds = [...new Set([...ids, ...members.map(m => m.userId)])];
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: { in: [org, foreign] } }, { actorUserId: { in: userIds } }] } });
    await db.membershipRole.deleteMany({ where: { organizationId: { in: [org, foreign] } } });
    const roles = await db.role.findMany({ where: { organizationId: { in: [org, foreign] } }, select: { id: true } });
    await db.rolePermission.deleteMany({ where: { roleId: { in: roles.map(r => r.id) } } });
    await db.role.deleteMany({ where: { organizationId: { in: [org, foreign] } } });
    await db.organizationMembership.deleteMany({ where: { organizationId: { in: [org, foreign] } } });
    await db.organization.deleteMany({ where: { id: { in: [org, foreign] } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });
  it('requires JWT, active membership and explicit permission; grants are not inferred from names', async () => {
    await http().get(endpoint('users')).expect(401);
    await db.organizationMembership.update({ where: { id: membership }, data: { status: 'INACTIVE' } });
    await createUser().expect(403);
    await db.organizationMembership.update({ where: { id: membership }, data: { status: 'ACTIVE' } });
    await db.rolePermission.deleteMany({ where: { roleId: role } });
    await createUser().expect(403);
  });
  it('creates Argon2id identity/membership without default roles or sensitive response fields', async () => {
    const input = accountInput(); const response = await http().post(endpoint('users')).set(headers()).send(input).expect(201);
    const row = await db.user.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash|token|session|secret/i);
    expect(await db.membershipRole.count({ where: { membershipId: response.body.membershipId } })).toBe(0);
    const login = await http().post('/api/v1/auth/login').send({ email: input.email, password: input.password }).expect(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(await db.auditEvent.count({ where: { organizationId: org, event: 'user.created', resourceId: row.id } })).toBe(1);
  });
  it('lists stable keyset pages and never includes foreign tenant users', async () => {
    const member = await createUser().expect(201);
    const outsider = await db.user.create({ data: { email: `${randomUUID()}@example.test` } }); ids.push(outsider.id);
    await db.organizationMembership.create({ data: { organizationId: foreign, userId: outsider.id } });
    const first = await http().get(endpoint('users?limit=1')).set(headers()).expect(200);
    const second = await http().get(endpoint(`users?limit=1&after=${first.body.nextCursor}`)).set(headers()).expect(200);
    expect(new Set([first.body.items[0].id, second.body.items[0].id])).toEqual(new Set([actor, member.body.id]));
    await http().get(endpoint(`users/${outsider.id}`)).set(headers()).expect(404);
    await http().get(endpoint('users', foreign)).set(headers()).expect(403);
  });
  it('rejects unknown fields, weak password and arbitrary permission injection', async () => {
    await http().post(endpoint('users')).set(headers()).send({ ...accountInput(), roles: ['admin'] }).expect(400);
    await http().post(endpoint('users')).set(headers()).send({ ...accountInput(), password: 'short' }).expect(400);
    await http().post(endpoint('roles')).set(headers()).send({ key: 'unknown', name: 'Unknown', permissionKeys: ['injected:superuser'] }).expect(400);
  });
  it('removes only this tenant membership and never deletes global identity or other membership', async () => {
    const created = await createUser().expect(201); const id = created.body.id;
    await db.organizationMembership.create({ data: { organizationId: foreign, userId: id } });
    await http().patch(endpoint(`users/${id}`)).set(headers()).send({ displayName: 'Cross-tenant edit' }).expect(409);
    await http().delete(endpoint(`users/${id}`)).set(headers()).expect(200);
    expect((await db.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: org, userId: id } } })).status).toBe('REMOVED');
    expect((await db.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: foreign, userId: id } } })).status).toBe('ACTIVE');
    expect((await db.user.findUniqueOrThrow({ where: { id } })).accountStatus).toBe('ACTIVE');
    await http().delete(endpoint(`users/${actor}`)).set(headers()).expect(403);
  });
  it('updates a tenant-exclusive profile and membership state', async () => {
    const created = await createUser().expect(201);
    const changed = await http().patch(endpoint(`users/${created.body.id}`)).set(headers()).send({ displayName: 'New fixture name', membershipStatus: 'INACTIVE' }).expect(200);
    expect(changed.body.displayName).toBe('New fixture name'); expect(changed.body.membershipStatus).toBe('INACTIVE');
  });
  it('creates, reads, edits and deletes unassigned roles with safe permission summary', async () => {
    const created = await http().post(endpoint('roles')).set(headers()).send({ key: 'fixture-created', name: 'New role', permissionKeys: [P.TASK_READ] }).expect(201);
    const id = created.body.id;
    expect(created.body.permissionKeys).toEqual([P.TASK_READ]);
    await http().get(endpoint(`roles/${id}`)).set(headers()).expect(200);
    const updated = await http().patch(endpoint(`roles/${id}`)).set(headers()).send({ name: 'Edited', permissionKeys: [P.TASK_CREATE, P.TASK_READ] }).expect(200);
    expect(updated.body.permissionKeys).toEqual([P.TASK_CREATE, P.TASK_READ].sort());
    await http().delete(endpoint(`roles/${id}`)).set(headers()).expect(200);
    await http().get(endpoint(`roles/${id}`)).set(headers()).expect(404);
  });
  it('cannot edit own roles or delete/deactivate roles with assignments', async () => {
    await http().patch(endpoint(`roles/${role}`)).set(headers()).send({ name: 'Self edit' }).expect(403);
    await http().delete(endpoint(`roles/${role}`)).set(headers()).expect(409);
  });
  it('requires role:assign and the caller permission subset for role grants', async () => {
    const assign = await db.permission.findUniqueOrThrow({ where: { key: P.ROLE_ASSIGN } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role, permissionId: assign.id } } });
    await http().post(endpoint('roles')).set(headers()).send({ key: 'forbidden-grant', name: 'No grant', permissionKeys: [P.TASK_READ] }).expect(403);
    const empty = await http().post(endpoint('roles')).set(headers()).send({ key: 'empty-role', name: 'Empty', permissionKeys: [] }).expect(201);
    expect(empty.body.permissionKeys).toEqual([]);
  });
});

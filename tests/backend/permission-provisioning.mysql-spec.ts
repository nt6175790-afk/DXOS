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
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'permission-provisioning-test-secret-not-production';

mysqlDescribe('permission provisioning tenant and privilege boundaries', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication; let actor: string; let target: string; let foreign: string;
  let orgA: string; let orgB: string; let targetMembership: string; let operatorRole: string; let assignableRole: string; let token: string;

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => undefined)); await app.init();
  });
  beforeEach(async () => {
    [actor, target, foreign] = [randomUUID(), randomUUID(), randomUUID()];
    await db.user.createMany({ data: [actor, target, foreign].map((id) => ({ id, email: `${id}@example.test`, passwordHash: 'unused' })) });
    const session = randomUUID();
    await db.authSession.create({ data: { id: session, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session, typ: 'access' }, secret, { expiresIn: 300 });
    const org = await db.organization.create({ data: { name: 'Provisioning A', slug: `provisioning-a-${randomUUID()}` } }); orgA = org.id;
    const other = await db.organization.create({ data: { name: 'Provisioning B', slug: `provisioning-b-${randomUUID()}` } }); orgB = other.id;
    const actorMembership = await db.organizationMembership.create({ data: { organizationId: orgA, userId: actor } });
    const targetRow = await db.organizationMembership.create({ data: { organizationId: orgA, userId: target } }); targetMembership = targetRow.id;
    await db.organizationMembership.create({ data: { organizationId: orgB, userId: foreign } });
    const actorRole = await db.role.create({ data: { organizationId: orgA, key: 'operator', name: 'Operator' } }); operatorRole = actorRole.id;
    const role = await db.role.create({ data: { organizationId: orgA, key: 'viewer', name: 'Viewer' } }); assignableRole = role.id;
    for (const key of [PERMISSIONS.ROLE_READ, PERMISSIONS.ROLE_ASSIGN, PERMISSIONS.TASK_READ]) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: actorRole.id, permissionId: permission.id } });
    }
    const task = await db.permission.upsert({ where: { key: PERMISSIONS.TASK_READ }, update: {}, create: { key: PERMISSIONS.TASK_READ, name: PERMISSIONS.TASK_READ } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: task.id } });
    await db.membershipRole.create({ data: { organizationId: orgA, membershipId: actorMembership.id, roleId: actorRole.id } });
  });
  afterEach(async () => {
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: { in: [orgA, orgB] } }, { actorUserId: { in: [actor, target, foreign] } }] } });
    await db.membershipRole.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: { in: [orgA, orgB] } } } });
    await db.role.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await db.organizationMembership.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await db.authSession.deleteMany({ where: { userId: { in: [actor, target, foreign] } } });
    await db.user.deleteMany({ where: { id: { in: [actor, target, foreign] } } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  it('requires authentication and lists only safe same-tenant member data', async () => {
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/members`).expect(401);
    const response = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/members`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body.items).toHaveLength(2);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('refreshTokenHash');
    expect(response.body.items.every((item: { organizationId: string }) => item.organizationId === orgA)).toBe(true);
  });

  it('discovers only the current organization role catalog with stable pagination and no read audit', async () => {
    const inactive = await db.role.create({ data: { organizationId: orgA, key: 'inactive-viewer', name: 'Inactive Viewer', isActive: false } });
    const foreignRole = await db.role.create({ data: { organizationId: orgB, key: 'foreign', name: 'Foreign Role' } });
    const beforeAudit = await db.auditEvent.count({ where: { organizationId: orgA } });
    const response = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([operatorRole, assignableRole, inactive.id].sort());
    expect(response.body.items).toEqual(expect.arrayContaining([
      { id: assignableRole, key: 'viewer', name: 'Viewer', isActive: true },
      { id: inactive.id, key: 'inactive-viewer', name: 'Inactive Viewer', isActive: false },
    ]));
    expect(response.body.items.map((item: { id: string }) => item.id)).not.toContain(foreignRole.id);
    expect(Object.keys(response.body.items[0]).sort()).toEqual(['id', 'isActive', 'key', 'name'].sort());
    expect(await db.auditEvent.count({ where: { organizationId: orgA } })).toBe(beforeAudit);
    const first = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles?limit=1`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles?limit=1&after=${first.body.nextCursor}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].id > first.body.items[0].id).toBe(true);
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles?after=${foreignRole.id}`).set('Authorization', `Bearer ${token}`).expect(400);
  });

  it('enforces role discovery authentication, membership, permission and input boundaries', async () => {
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgB}/roles`).set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles?roleId=${assignableRole}`).set('Authorization', `Bearer ${token}`).expect(400);
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles?after=not-a-uuid`).set('Authorization', `Bearer ${token}`).expect(400);
    const membership = await db.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgA, userId: actor } } });
    await db.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles`).set('Authorization', `Bearer ${token}`).expect(403);
    await db.membershipRole.create({ data: { organizationId: orgA, membershipId: membership.id, roleId: operatorRole } });
    await db.organizationMembership.update({ where: { id: membership.id }, data: { status: 'INACTIVE' } });
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles`).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('allows role discovery with role:read without granting role:assign', async () => {
    const permission = await db.permission.findUniqueOrThrow({ where: { key: PERMISSIONS.ROLE_ASSIGN } });
    await db.rolePermission.deleteMany({ where: { roleId: operatorRole, permissionId: permission.id } });

    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/organizations/${orgA}/members/${targetMembership}/roles`)
      .set('Authorization', `Bearer ${token}`).send({ roleId: assignableRole }).expect(403);
  });

  it('rechecks role:read inside the read transaction after the HTTP guard', async () => {
    const authorization = app.get(AuthorizationService);
    const originalCan = authorization.can.bind(authorization);
    let checks = 0;
    jest.spyOn(authorization, 'can').mockImplementation(async (...args) => {
      checks += 1;
      if (checks === 1) return originalCan(...args);
      return false;
    });
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/roles`).set('Authorization', `Bearer ${token}`).expect(403);
    expect(checks).toBe(2);
    jest.restoreAllMocks();
  });

  it('assigns and revokes atomically with audit records and rejects self or foreign targets', async () => {
    await request(app.getHttpServer()).post(`/api/v1/organizations/${orgA}/members/${targetMembership}/roles`).set('Authorization', `Bearer ${token}`).send({ roleId: assignableRole }).expect(201);
    expect(await db.membershipRole.count({ where: { membershipId: targetMembership, roleId: assignableRole } })).toBe(1);
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: 'rbac.role.assigned', actorUserId: actor } })).toBe(1);
    await request(app.getHttpServer()).delete(`/api/v1/organizations/${orgA}/members/${targetMembership}/roles/${assignableRole}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(await db.membershipRole.count({ where: { membershipId: targetMembership, roleId: assignableRole } })).toBe(0);
    expect(await db.auditEvent.count({ where: { organizationId: orgA, event: 'rbac.role.revoked', actorUserId: actor } })).toBe(1);
    const actorMembership = await db.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgA, userId: actor } } });
    await request(app.getHttpServer()).post(`/api/v1/organizations/${orgA}/members/${actorMembership.id}/roles`).set('Authorization', `Bearer ${token}`).send({ roleId: assignableRole }).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/organizations/${orgB}/members/${targetMembership}/roles`).set('Authorization', `Bearer ${token}`).send({ roleId: assignableRole }).expect(403);
  });

  it('enforces strict bodies and the actor privilege ceiling', async () => {
    await request(app.getHttpServer()).post(`/api/v1/organizations/${orgA}/members/${targetMembership}/roles`).set('Authorization', `Bearer ${token}`).send({ roleId: assignableRole, permission: PERMISSIONS.TASK_READ }).expect(400);
    const elevated = await db.role.create({ data: { organizationId: orgA, key: 'elevated', name: 'Elevated' } });
    const permission = await db.permission.upsert({ where: { key: PERMISSIONS.TASK_UPDATE }, update: {}, create: { key: PERMISSIONS.TASK_UPDATE, name: PERMISSIONS.TASK_UPDATE } });
    await db.rolePermission.create({ data: { roleId: elevated.id, permissionId: permission.id } });
    await request(app.getHttpServer()).post(`/api/v1/organizations/${orgA}/members/${targetMembership}/roles`).set('Authorization', `Bearer ${token}`).send({ roleId: elevated.id }).expect(403);
    expect(await db.membershipRole.count({ where: { membershipId: targetMembership, roleId: elevated.id } })).toBe(0);
  });

  it('publishes provisioning routes and safe schemas in OpenAPI', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    expect(response.body.paths['/organizations/{organizationId}/roles'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(response.body.paths['/organizations/{organizationId}/roles'].get.responses['200'].content['application/json'].schema.$ref).toBe('#/components/schemas/OrganizationRolePage');
    expect(response.body.components.schemas.OrganizationRolePage.properties.items.items.$ref).toBe('#/components/schemas/RoleSummary');
    expect(response.body.paths['/organizations/{organizationId}/members'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(response.body.paths['/organizations/{organizationId}/members/{membershipId}/roles'].post.requestBody.content['application/json'].schema.$ref).toBe('#/components/schemas/AssignRoleRequest');
    expect(response.body.components.schemas.OrganizationMember.properties.roles.items.$ref).toBe('#/components/schemas/RoleSummary');
  });
});


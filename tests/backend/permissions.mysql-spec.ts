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
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'permission-discovery-test-secret-not-production';

mysqlDescribe('permission discovery with real IAM/RBAC and tenant isolation', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string; let other: string; let foreign: string;
  let orgA: string; let orgB: string; let token: string;

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => undefined)); await app.init();
  });
  beforeEach(async () => {
    [actor, other, foreign] = [randomUUID(), randomUUID(), randomUUID()];
    await db.user.createMany({ data: [actor, other, foreign].map((id) => ({ id, email: `${id}@example.test` })) });
    const session = randomUUID();
    await db.authSession.create({ data: { id: session, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session, typ: 'access' }, secret, { expiresIn: 300 });
    const organizations = app.get(OrganizationsService);
    orgA = (await organizations.create(actor, { name: 'Permissions A', slug: `permissions-a-${randomUUID()}` })).id;
    orgB = (await organizations.create(foreign, { name: 'Permissions B', slug: `permissions-b-${randomUUID()}` })).id;
    await db.organizationMembership.create({ data: { organizationId: orgA, userId: other } });
  });
  afterEach(async () => {
    const organizations = await db.organization.findMany({ where: { id: { in: [orgA, orgB] } }, select: { id: true } });
    const ids = { in: organizations.map((organization) => organization.id) };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: ids }, { actorUserId: { in: [actor, other, foreign] } }] } });
    await db.membershipRole.deleteMany({ where: { organizationId: ids } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: ids } } });
    await db.role.deleteMany({ where: { organizationId: ids } });
    await db.organizationMembership.deleteMany({ where: { organizationId: ids } });
    await db.organization.deleteMany({ where: { id: ids } });
    await db.authSession.deleteMany({ where: { userId: { in: [actor, other, foreign] } } });
    await db.user.deleteMany({ where: { id: { in: [actor, other, foreign] } } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  async function addRole(key: string, permissions: string[], active = true) {
    const membership = await db.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgA, userId: actor } } });
    const role = await db.role.create({ data: { organizationId: orgA, key, name: key, isActive: active } });
    await db.membershipRole.create({ data: { organizationId: orgA, membershipId: membership.id, roleId: role.id } });
    for (const permission of permissions) {
      const row = await db.permission.upsert({ where: { key: permission }, update: {}, create: { key: permission, name: permission } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: row.id } });
    }
  }

  it.each([undefined, 'invalid'])('requires authentication: %s', async (credential) => {
    const req = request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/permissions`);
    if (credential) req.set('Authorization', `Bearer ${credential}`);
    await req.expect(401);
  });

  it('returns effective unique sorted permissions from multiple active roles only', async () => {
    await addRole('reader', [PERMISSIONS.TASK_READ, PERMISSIONS.EMPLOYEE_READ]);
    await addRole('operator', [PERMISSIONS.TASK_READ, PERMISSIONS.FILE_READ]);
    await addRole('inactive', [PERMISSIONS.AI_USE], false);
    const response = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/permissions`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body).toEqual({ organizationId: orgA,
      permissions: [PERMISSIONS.EMPLOYEE_READ, PERMISSIONS.FILE_READ, PERMISSIONS.ORGANIZATION_READ,
        PERMISSIONS.ORGANIZATION_UPDATE, PERMISSIONS.TASK_READ].sort() });
    expect(response.body.permissions).not.toContain(PERMISSIONS.AI_USE);
    expect(response.body).not.toHaveProperty('roles');
  });

  it('returns an empty stable list for an active member without roles and denies foreign/inactive contexts', async () => {
    await db.organizationMembership.update({ where: { organizationId_userId: { organizationId: orgA, userId: actor } }, data: { status: 'INACTIVE' } });
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/permissions`).set('Authorization', `Bearer ${token}`).expect(403);
    await db.organizationMembership.update({ where: { organizationId_userId: { organizationId: orgA, userId: actor } }, data: { status: 'ACTIVE' } });
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/permissions`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgB}/permissions`).set('Authorization', `Bearer ${token}`).expect(403);
    for (const query of [{ permission: PERMISSIONS.AI_USE }, { organizationId: orgB }, { roles: 'owner' }]) {
      await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/permissions`).set('Authorization', `Bearer ${token}`).query(query).expect(400);
    }
  });

  it('rejects inactive accounts and malformed or missing organizations without leakage', async () => {
    await db.user.update({ where: { id: actor }, data: { accountStatus: 'SUSPENDED' } });
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/permissions`).set('Authorization', `Bearer ${token}`).expect(401);
    await db.user.update({ where: { id: actor }, data: { accountStatus: 'ACTIVE' } });
    for (const id of ['bad', randomUUID()]) {
      const response = await request(app.getHttpServer()).get(`/api/v1/organizations/${id}/permissions`).set('Authorization', `Bearer ${token}`).expect(403);
      expect(JSON.stringify(response.body)).not.toContain(orgB);
    }
  });

  it('does not create a success audit event for discovery reads', async () => {
    const before = await db.auditEvent.count({ where: { organizationId: orgA } });
    await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/permissions`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(await db.auditEvent.count({ where: { organizationId: orgA } })).toBe(before);
  });

  it('publishes both endpoints with stable safe schemas', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    expect(response.body.paths['/organizations/{organizationId}/files'].get['x-required-permission']).toBe(PERMISSIONS.FILE_READ);
    expect(response.body.paths['/organizations/{organizationId}/permissions'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(response.body.components.schemas.FilePage.properties.items.items.$ref).toBe('#/components/schemas/FileMetadata');
    expect(response.body.components.schemas.PermissionDiscovery.properties.permissions.items.type).toBe('string');
  });
});


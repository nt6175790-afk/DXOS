// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { MembershipStatus, PrismaClient, UserAccountStatus } from '@prisma/client';
import type { PrismaService } from '../../backend/src/database/prisma.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { PERMISSIONS, type PermissionKey } from '../../backend/src/modules/rbac/permission-catalog';
import { RbacAssignmentService } from '../../backend/src/modules/rbac/rbac-assignment.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';

// The runner supplies a newly created database and drops it after the suite.
const databaseUrl = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = databaseUrl ? describe : describe.skip;
mysqlDescribe('RBAC with real MySQL relations and constraints', () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  const authorization = new AuthorizationService(db as PrismaService);
  const assignments = new RbacAssignmentService(db as PrismaService, new AuditService(db as PrismaService));
  const a = randomUUID();
  const b = randomUUID();
  const user = randomUUID();
  const member = randomUUID();
  const role = randomUUID();
  const otherRole = randomUUID();
  const foreignRole = randomUUID();
  let permission: string = randomUUID();

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(databaseUrl!).pathname)) {
      throw new Error('Only runner-created disposable databases are supported.');
    }
    await db.organization.createMany({ data: [{ id: a, slug: 'a', name: 'A' }, { id: b, slug: 'b', name: 'B' }] });
    await db.user.create({ data: { id: user, email: 'member@example.test' } });
    await db.organizationMembership.create({ data: { id: member, organizationId: a, userId: user } });
    await db.role.createMany({ data: [
      { id: role, organizationId: a, key: 'admin', name: 'Organization Admin' },
      { id: otherRole, organizationId: a, key: 'other', name: 'Other' },
      { id: foreignRole, organizationId: b, key: 'admin', name: 'Organization Admin' },
    ] });
    permission = (await db.permission.upsert({ where: { key: PERMISSIONS.ORGANIZATION_READ }, update: {},
      create: { id: permission, key: PERMISSIONS.ORGANIZATION_READ, name: 'Read organization' } })).id;
  });
  beforeEach(async () => {
    await db.membershipRole.deleteMany();
    await db.rolePermission.deleteMany();
    await db.user.update({ where: { id: user }, data: { accountStatus: UserAccountStatus.ACTIVE } });
    await db.organizationMembership.update({ where: { id: member }, data: { status: MembershipStatus.ACTIVE } });
    await db.role.updateMany({ data: { isActive: true } });
  });
  afterAll(async () => { await db.$disconnect(); });
  const can = (org = a) => authorization.can(user, PERMISSIONS.ORGANIZATION_READ, org);
  const grant = async () => {
    await assignments.assignRoleToMembership(a, member, role);
    await assignments.grantPermissionToRole(a, role, PERMISSIONS.ORGANIZATION_READ);
  };

  it('resolves membership -> role -> permission and denies other tenant and unknown identities', async () => {
    await grant();
    expect(await can()).toBe(true);
    expect(await can(b)).toBe(false);
    expect(await can(randomUUID())).toBe(false);
    expect(await authorization.can(randomUUID(), PERMISSIONS.ORGANIZATION_READ, a)).toBe(false);
  });
  it('denies a membership with no assigned role', async () => { expect(await can()).toBe(false); });
  it('denies an assigned role with no permission', async () => {
    await assignments.assignRoleToMembership(a, member, role);
    expect(await can()).toBe(false);
  });
  it('does not borrow a permission from an unassigned role', async () => {
    await assignments.assignRoleToMembership(a, member, role);
    await assignments.grantPermissionToRole(a, otherRole, PERMISSIONS.ORGANIZATION_READ);
    expect(await can()).toBe(false);
    await assignments.assignRoleToMembership(a, member, otherRole);
    expect(await can()).toBe(true);
  });
  it.each([UserAccountStatus.INACTIVE, UserAccountStatus.SUSPENDED])('denies account state %s', async (accountStatus) => {
    await grant();
    await db.user.update({ where: { id: user }, data: { accountStatus } });
    expect(await can()).toBe(false);
  });
  it('denies inactive membership', async () => {
    await grant();
    await db.organizationMembership.update({ where: { id: member }, data: { status: MembershipStatus.INACTIVE } });
    expect(await can()).toBe(false);
  });
  it('denies inactive role and observes grant revocation immediately', async () => {
    await grant();
    await db.role.update({ where: { id: role }, data: { isActive: false } });
    expect(await can()).toBe(false);
    await db.role.update({ where: { id: role }, data: { isActive: true } });
    expect(await can()).toBe(true);
    await db.rolePermission.deleteMany();
    expect(await can()).toBe(false);
  });
  it('rejects cross-tenant assignments in the service and both composite foreign keys', async () => {
    await expect(assignments.assignRoleToMembership(a, member, foreignRole)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(db.membershipRole.create({ data: { organizationId: a, membershipId: member, roleId: foreignRole } }))
      .rejects.toMatchObject({ code: 'P2003' });
    await expect(db.membershipRole.create({ data: { organizationId: b, membershipId: member, roleId: foreignRole } }))
      .rejects.toMatchObject({ code: 'P2003' });
  });
  it('rejects cross-tenant permission grants', async () => {
    await expect(assignments.grantPermissionToRole(a, foreignRole, PERMISSIONS.ORGANIZATION_READ))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(await db.rolePermission.count()).toBe(0);
  });
  it('never elevates organization admin into platform super-admin', async () => {
    await grant();
    const platform = await db.permission.create({ data: { key: 'platform:super-admin', name: 'Platform' } });
    await db.rolePermission.create({ data: { roleId: role, permissionId: platform.id } });
    expect(await authorization.can(user, 'platform:super-admin' as PermissionKey, a)).toBe(false);
    await expect(assignments.grantPermissionToRole(a, role, 'platform:super-admin' as PermissionKey))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(await can(b)).toBe(false);
  });
  it('enforces unique joins, permission FK and restrictive parent deletion', async () => {
    await grant();
    await grant(); // Provisioning retries are idempotent.
    expect(await db.membershipRole.count()).toBe(1);
    await expect(db.membershipRole.create({ data: { organizationId: a, membershipId: member, roleId: role } }))
      .rejects.toMatchObject({ code: 'P2002' });
    await expect(db.rolePermission.create({ data: { roleId: role, permissionId: permission } }))
      .rejects.toMatchObject({ code: 'P2002' });
    await expect(db.rolePermission.create({ data: { roleId: role, permissionId: randomUUID() } }))
      .rejects.toMatchObject({ code: 'P2003' });
    await expect(db.role.delete({ where: { id: role } })).rejects.toMatchObject({ code: 'P2003' });
  });
});


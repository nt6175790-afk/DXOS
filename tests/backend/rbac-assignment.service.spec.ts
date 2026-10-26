// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ForbiddenException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { PERMISSIONS, type PermissionKey } from '../../backend/src/modules/rbac/permission-catalog';
import { RbacAssignmentService } from '../../backend/src/modules/rbac/rbac-assignment.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';

describe('RbacAssignmentService', () => {
  const organizationA = 'eb42cce7-7209-4adc-9e71-16fbc6467850';
  const organizationB = 'f969218b-4d58-45fb-9a7a-26f73df6fe35';
  const membershipId = '2c606a0f-ad62-4639-aa01-beb5a47f55d8';
  const roleId = '05d43dd4-0580-4073-8397-d7ccf3e6f9ca';
  const roleFindFirst = jest.fn();
  const membershipFindFirst = jest.fn();
  const membershipUpsert = jest.fn();
  const permissionFindUnique = jest.fn();
  const rolePermissionUpsert = jest.fn();
  const service = new RbacAssignmentService({
    $transaction: (operation: (tx: unknown) => Promise<unknown>) => operation({
      membershipRole: { upsert: membershipUpsert }, rolePermission: { upsert: rolePermissionUpsert },
    }),
    organizationMembership: { findFirst: membershipFindFirst },
    role: { findFirst: roleFindFirst },
    membershipRole: { upsert: membershipUpsert },
    permission: { findUnique: permissionFindUnique },
    rolePermission: { upsert: rolePermissionUpsert },
  } as unknown as PrismaService, { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService);

  beforeEach(() => {
    jest.clearAllMocks();
    membershipFindFirst.mockResolvedValue({ id: membershipId });
    roleFindFirst.mockResolvedValue({ id: roleId });
    membershipUpsert.mockResolvedValue({});
    permissionFindUnique.mockResolvedValue({ id: 'permission-id' });
    rolePermissionUpsert.mockResolvedValue({});
  });

  it('rejects platform grants even if a database permission definition exists', async () => {
    await expect(service.grantPermissionToRole(organizationA, roleId, 'platform:super-admin' as PermissionKey))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(rolePermissionUpsert).not.toHaveBeenCalled();
    expect(permissionFindUnique).not.toHaveBeenCalled();
  });

  it('rejects an undefined tenant before Prisma can omit its filter', async () => {
    await expect(service.assignRoleToMembership(undefined as unknown as string, membershipId, roleId))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.grantPermissionToRole(undefined as unknown as string, roleId, PERMISSIONS.ROLE_READ))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipUpsert).not.toHaveBeenCalled();
    expect(rolePermissionUpsert).not.toHaveBeenCalled();
  });

  it('assigns an active role only to an active membership in the same organization', async () => {
    await service.assignRoleToMembership(organizationA, membershipId, roleId);

    expect(membershipFindFirst).toHaveBeenCalledWith({
      where: { id: membershipId, organizationId: organizationA, status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
    expect(roleFindFirst).toHaveBeenCalledWith({
      where: { id: roleId, organizationId: organizationA, isActive: true },
      select: { id: true },
    });
    expect(membershipUpsert).toHaveBeenCalledWith({
      where: { membershipId_roleId: { membershipId, roleId } },
      update: {},
      create: { organizationId: organizationA, membershipId, roleId },
    });
  });

  it('rejects cross-tenant role assignment before writing the join record', async () => {
    roleFindFirst.mockResolvedValue(null);

    await expect(service.assignRoleToMembership(organizationB, membershipId, roleId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(membershipUpsert).not.toHaveBeenCalled();
  });

  it('rejects permission assignment when the role is not an active role in the requested organization', async () => {
    roleFindFirst.mockResolvedValue(null);

    await expect(
      service.grantPermissionToRole(organizationB, roleId, PERMISSIONS.ORGANIZATION_READ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rolePermissionUpsert).not.toHaveBeenCalled();
  });

  it('grants a catalog permission only to the requested active organization role', async () => {
    await service.grantPermissionToRole(organizationA, roleId, PERMISSIONS.ROLE_READ);

    expect(rolePermissionUpsert).toHaveBeenCalledWith({
      where: { roleId_permissionId: { roleId, permissionId: 'permission-id' } },
      update: {},
      create: { roleId, permissionId: 'permission-id' },
    });
  });
});

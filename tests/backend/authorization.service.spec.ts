// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { MembershipStatus, OrganizationStatus, UserAccountStatus } from '@prisma/client';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { PERMISSIONS, type PermissionKey } from '../../backend/src/modules/rbac/permission-catalog';

describe('AuthorizationService', () => {
  const organizationId = 'eb42cce7-7209-4adc-9e71-16fbc6467850';
  const userId = '291c47e4-278a-4f1d-8f39-0fb47c2d5db2';
  const findFirst = jest.fn();
  const service = new AuthorizationService({
    organizationMembership: { findFirst },
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([undefined, '', 'platform:super-admin', '*', 'ORGANIZATION:READ'])('rejects non-catalog permission %s at runtime', async (permission) => {
    await expect(service.can(userId, permission as PermissionKey, organizationId)).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'not-a-uuid'])('rejects missing or malformed tenant/user identifiers: %s', async (id) => {
    await expect(service.can(id as string, PERMISSIONS.ORGANIZATION_READ, organizationId)).resolves.toBe(false);
    await expect(service.can(userId, PERMISSIONS.ORGANIZATION_READ, id as string)).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('allows only an active member whose active organization role grants the permission', async () => {
    findFirst.mockResolvedValue({ id: 'membership-id' });

    await expect(service.can(userId, PERMISSIONS.ORGANIZATION_READ, organizationId)).resolves.toBe(true);

    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId,
        organizationId,
        status: MembershipStatus.ACTIVE,
        user: { accountStatus: UserAccountStatus.ACTIVE },
        organization: { id: organizationId, status: OrganizationStatus.ACTIVE },
        roleAssignments: {
          some: {
            role: {
              organizationId,
              isActive: true,
              permissionAssignments: {
                some: { permission: { key: PERMISSIONS.ORGANIZATION_READ } },
              },
            },
          },
        },
      }),
      select: { id: true },
    });
  });

  it.each([
    'missing membership',
    'membership without the permission',
    'inactive role',
    'permission only granted to another role',
    'organization mismatch',
    'inactive account',
  ])('denies when resolution finds no authorized membership: %s', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.can(userId, PERMISSIONS.ORGANIZATION_READ, organizationId)).resolves.toBe(false);
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { MembershipStatus, OrganizationStatus, UserAccountStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { isOrganizationIdentifier, isPermissionKey, type PermissionKey } from './permission-catalog';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async isActiveMember(userId: string, organizationId: string,
    database: Pick<Prisma.TransactionClient, 'organizationMembership'> = this.prisma): Promise<boolean> {
    if (!isOrganizationIdentifier(userId) || !isOrganizationIdentifier(organizationId)) return false;
    return (await database.organizationMembership.findFirst({ where: {
      userId, organizationId, status: MembershipStatus.ACTIVE,
      user: { accountStatus: UserAccountStatus.ACTIVE }, organization: { status: OrganizationStatus.ACTIVE },
    }, select: { id: true } })) !== null;
  }

  async canCreateOrganization(userId: string, database: Pick<Prisma.TransactionClient, 'user'> = this.prisma): Promise<boolean> {
    if (!isOrganizationIdentifier(userId)) return false;
    return (await database.user.findFirst({
      where: { id: userId, accountStatus: UserAccountStatus.ACTIVE }, select: { id: true },
    })) !== null;
  }

  async can(
    userId: string, permission: PermissionKey, organizationId: string,
    database: Pick<Prisma.TransactionClient, 'organizationMembership'> = this.prisma,
  ): Promise<boolean> {
    if (!isOrganizationIdentifier(userId) || !isOrganizationIdentifier(organizationId) || !isPermissionKey(permission)) {
      return false;
    }
    const authorizedMembership = await database.organizationMembership.findFirst({
      where: {
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
                some: {
                  permission: { key: permission },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    return authorizedMembership !== null;
  }

  async effectivePermissions(userId: string, organizationId: string,
    database: Pick<Prisma.TransactionClient, 'organizationMembership'> = this.prisma): Promise<PermissionKey[] | null> {
    if (!isOrganizationIdentifier(userId) || !isOrganizationIdentifier(organizationId)) return null;
    const membership = await database.organizationMembership.findFirst({
      where: { userId, organizationId, status: MembershipStatus.ACTIVE,
        user: { accountStatus: UserAccountStatus.ACTIVE }, organization: { id: organizationId, status: OrganizationStatus.ACTIVE } },
      select: { roleAssignments: { where: { role: { organizationId, isActive: true } },
        select: { role: { select: { permissionAssignments: { select: { permission: { select: { key: true } } } } } } } } },
    });
    if (!membership) return null;
    const permissions = membership.roleAssignments.flatMap((assignment) =>
      assignment.role.permissionAssignments.map((grant) => grant.permission.key)).filter(isPermissionKey);
    return [...new Set(permissions)].sort();
  }
}

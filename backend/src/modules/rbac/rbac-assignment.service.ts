// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { isOrganizationIdentifier, isPermissionKey, type PermissionKey } from './permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';

@Injectable()
export class RbacAssignmentService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async assignRoleToMembership(
    organizationId: string,
    membershipId: string,
    roleId: string,
  ): Promise<void> {
    if (![organizationId, membershipId, roleId].every(isOrganizationIdentifier)) {
      throw new ForbiddenException();
    }
    const [membership, role] = await Promise.all([
      this.prisma.organizationMembership.findFirst({
        where: { id: membershipId, organizationId, status: MembershipStatus.ACTIVE },
        select: { id: true },
      }),
      this.prisma.role.findFirst({
        where: { id: roleId, organizationId, isActive: true },
        select: { id: true },
      }),
    ]);

    if (!membership || !role) {
      throw new ForbiddenException();
    }

    await this.prisma.$transaction(async (tx) => {
    await tx.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId, roleId } },
      update: {},
      create: { organizationId, membershipId, roleId },
    });
    await this.audit.record({ event: AUDIT_EVENTS.ROLE_ASSIGNED, organizationId, resourceId: roleId }, tx);
    });
  }

  async grantPermissionToRole(
    organizationId: string,
    roleId: string,
    permission: PermissionKey,
  ): Promise<void> {
    if (!isOrganizationIdentifier(organizationId) || !isOrganizationIdentifier(roleId) || !isPermissionKey(permission)) {
      throw new ForbiddenException();
    }
    const [role, permissionRecord] = await Promise.all([
      this.prisma.role.findFirst({
        where: { id: roleId, organizationId, isActive: true },
        select: { id: true },
      }),
      this.prisma.permission.findUnique({
        where: { key: permission },
        select: { id: true },
      }),
    ]);

    if (!role || !permissionRecord) {
      throw new ForbiddenException();
    }

    await this.prisma.$transaction(async (tx) => {
    await tx.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: permissionRecord.id } },
      update: {},
      create: { roleId, permissionId: permissionRecord.id },
    });
    await this.audit.record({ event: AUDIT_EVENTS.PERMISSION_GRANTED, organizationId, resourceId: roleId,
      metadata: { permission } }, tx);
    });
  }
}

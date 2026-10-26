// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { AuthorizationService } from './authorization.service';
import { isOrganizationIdentifier, isPermissionKey, PERMISSIONS } from './permission-catalog';
import type { MemberListQueryDto, RoleListQueryDto } from './role-administration.dto';

@Injectable()
export class RoleAdministrationService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService,
    private readonly audit: AuditService) {}

  async listMembers(actorUserId: string, organizationId: string, query: MemberListQueryDto) {
    if (!isOrganizationIdentifier(actorUserId) || !isOrganizationIdentifier(organizationId)) throw new ForbiddenException();
    return this.transaction(async (tx) => {
      if (!(await this.authorization.can(actorUserId, PERMISSIONS.ROLE_READ, organizationId, tx))) throw new ForbiddenException();
      if (query.after && !(await tx.organizationMembership.findFirst({ where: { id: query.after, organizationId }, select: { id: true } }))) {
        throw new BadRequestException();
      }
      const rows = await tx.organizationMembership.findMany({
        where: { organizationId, ...(query.after ? { id: { gt: query.after } } : {}) },
        orderBy: { id: 'asc' }, take: query.limit + 1,
        select: {
          id: true, organizationId: true, userId: true, status: true,
          user: { select: { email: true, displayName: true, accountStatus: true } },
          roleAssignments: { where: { role: { organizationId } }, select: { role: { select: { id: true, key: true, name: true, isActive: true } } } },
          employee: { select: { id: true, employeeCode: true, displayName: true, status: true } },
        },
      });
      const items = rows.slice(0, query.limit).map((member) => ({
        id: member.id, organizationId: member.organizationId, userId: member.userId,
        email: member.user.email, displayName: member.user.displayName, accountStatus: member.user.accountStatus,
        status: member.status, roles: member.roleAssignments.map(({ role }) => role), employee: member.employee,
      }));
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
    });
  }

  async listRoles(actorUserId: string, organizationId: string, query: RoleListQueryDto) {
    if (!isOrganizationIdentifier(actorUserId) || !isOrganizationIdentifier(organizationId)) throw new ForbiddenException();
    return this.transaction(async (tx) => {
      if (!(await this.authorization.can(actorUserId, PERMISSIONS.ROLE_READ, organizationId, tx))) throw new ForbiddenException();
      if (query.after && !(await tx.role.findFirst({ where: { id: query.after, organizationId }, select: { id: true } }))) {
        throw new BadRequestException();
      }
      const rows = await tx.role.findMany({
        where: { organizationId, ...(query.after ? { id: { gt: query.after } } : {}) },
        orderBy: { id: 'asc' }, take: query.limit + 1,
        select: { id: true, key: true, name: true, isActive: true },
      });
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
    });
  }

  async assignRole(actorUserId: string, organizationId: string, membershipId: string, roleId: string) {
    this.identifiers(actorUserId, organizationId, membershipId, roleId);
    return this.transaction(async (tx) => {
      const actor = await this.authorizeActor(tx, actorUserId, organizationId);
      const target = await tx.organizationMembership.findFirst({ where: { id: membershipId, organizationId }, select: { id: true, userId: true, status: true } });
      if (!target) throw new NotFoundException();
      if (target.userId === actorUserId) throw new ForbiddenException();
      if (target.status !== MembershipStatus.ACTIVE) throw new ConflictException();
      const role = await tx.role.findFirst({ where: { id: roleId, organizationId }, select: { id: true, isActive: true, permissionAssignments: { select: { permission: { select: { key: true } } } } } });
      if (!role) throw new NotFoundException();
      if (!role.isActive) throw new ConflictException();
      const rolePermissions = role.permissionAssignments.map(({ permission }) => permission.key);
      if (rolePermissions.some((permission) => !isPermissionKey(permission) || !actor.includes(permission))) throw new ForbiddenException();
      const existing = await tx.membershipRole.findUnique({ where: { membershipId_roleId: { membershipId, roleId } }, select: { id: true } });
      if (existing) return { membershipId, roleId, assigned: true };
      await tx.membershipRole.create({ data: { organizationId, membershipId, roleId } });
      await this.audit.record({ event: AUDIT_EVENTS.ROLE_ASSIGNED, organizationId, actorUserId, resourceId: roleId }, tx);
      return { membershipId, roleId, assigned: true };
    });
  }

  async revokeRole(actorUserId: string, organizationId: string, membershipId: string, roleId: string) {
    this.identifiers(actorUserId, organizationId, membershipId, roleId);
    return this.transaction(async (tx) => {
      await this.authorizeActor(tx, actorUserId, organizationId);
      const target = await tx.organizationMembership.findFirst({ where: { id: membershipId, organizationId }, select: { id: true, userId: true, status: true } });
      if (!target) throw new NotFoundException();
      if (target.userId === actorUserId) throw new ForbiddenException();
      if (target.status !== MembershipStatus.ACTIVE) throw new ConflictException();
      const role = await tx.role.findFirst({ where: { id: roleId, organizationId }, select: { id: true } });
      if (!role) throw new NotFoundException();
      const existing = await tx.membershipRole.findUnique({ where: { membershipId_roleId: { membershipId, roleId } }, select: { id: true } });
      if (!existing) return { membershipId, roleId, assigned: false };
      await tx.membershipRole.delete({ where: { id: existing.id } });
      await this.audit.record({ event: AUDIT_EVENTS.ROLE_REVOKED, organizationId, actorUserId, resourceId: roleId }, tx);
      return { membershipId, roleId, assigned: false };
    });
  }

  private async authorizeActor(tx: Prisma.TransactionClient, actorUserId: string, organizationId: string) {
    const permissions = await this.authorization.effectivePermissions(actorUserId, organizationId, tx);
    if (!permissions?.includes(PERMISSIONS.ROLE_ASSIGN)) throw new ForbiddenException();
    return permissions;
  }

  private identifiers(...values: string[]) { if (!values.every(isOrganizationIdentifier)) throw new ForbiddenException(); }

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2002', 'P2034'].includes(error.code)) throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
}

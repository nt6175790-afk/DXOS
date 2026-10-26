// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipStatus, OrganizationStatus, Prisma, UserAccountStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { isOrganizationIdentifier, PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';
import type { CreateOrganizationDto, ListOrganizationsDto, UpdateOrganizationDto } from './dto/organization.dto';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { NotificationService } from '../notifications/notification.service';
import { NOTIFICATION_TYPES } from '../notifications/notification-catalog';

const publicOrganization = {
  id: true, name: true, slug: true, status: true, createdAt: true, updatedAt: true,
} satisfies Prisma.OrganizationSelect;

export type OrganizationResponse = Prisma.OrganizationGetPayload<{ select: typeof publicOrganization }>;

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService, private readonly audit: AuditService,
    private readonly notifications: NotificationService) {}

  async create(userId: string, input: CreateOrganizationDto): Promise<OrganizationResponse> {
    return this.transaction(async (tx) => {
      if (!(await this.authorization.canCreateOrganization(userId, tx))) throw new ForbiddenException();
      const organization = await tx.organization.create({
        data: { name: input.name, slug: input.slug }, select: publicOrganization,
      });
      const membership = await tx.organizationMembership.create({
        data: { organizationId: organization.id, userId }, select: { id: true },
      });
      const role = await tx.role.create({
        data: { organizationId: organization.id, key: 'owner', name: 'Organization Owner',
          description: 'Initial organization read and update access.' }, select: { id: true },
      });
      // Only these two catalog grants are bootstrapped; never spread request fields.
      for (const key of [PERMISSIONS.ORGANIZATION_READ, PERMISSIONS.ORGANIZATION_UPDATE]) {
        const permission = await tx.permission.upsert({
          where: { key }, update: {}, create: { key, name: key }, select: { id: true },
        });
        await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
        await this.audit.record({ event: AUDIT_EVENTS.PERMISSION_GRANTED, organizationId: organization.id,
          actorUserId: userId, resourceId: role.id, metadata: { permission: key } }, tx);
      }
      await tx.membershipRole.create({
        data: { organizationId: organization.id, membershipId: membership.id, roleId: role.id },
      });
      for (const [event, resourceId] of [
        [AUDIT_EVENTS.ORGANIZATION_CREATED, organization.id], [AUDIT_EVENTS.MEMBERSHIP_CREATED, membership.id],
        [AUDIT_EVENTS.ROLE_CREATED, role.id], [AUDIT_EVENTS.ROLE_ASSIGNED, role.id],
      ] as const) {
        await this.audit.record({ event, resourceId, organizationId: organization.id, actorUserId: userId }, tx);
      }
      return organization;
    });
  }

  async list(userId: string, query: ListOrganizationsDto): Promise<{ items: OrganizationResponse[]; nextCursor: string | null }> {
    if (!isOrganizationIdentifier(userId)) throw new ForbiddenException();
    const rows = await this.prisma.organization.findMany({
      where: {
        status: OrganizationStatus.ACTIVE,
        ...(query.after ? { id: { gt: query.after } } : {}),
        memberships: { some: { userId, status: MembershipStatus.ACTIVE,
          user: { accountStatus: UserAccountStatus.ACTIVE } } },
      },
      select: publicOrganization, orderBy: { id: 'asc' }, take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
  }

  async get(userId: string, organizationId: string): Promise<OrganizationResponse> {
    return this.transaction(async (tx) => {
      await this.assertCan(tx, userId, organizationId, PERMISSIONS.ORGANIZATION_READ);
      return tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: publicOrganization });
    });
  }

  async update(userId: string, organizationId: string, input: UpdateOrganizationDto): Promise<OrganizationResponse> {
    return this.transaction(async (tx) => {
      await this.assertCan(tx, userId, organizationId, PERMISSIONS.ORGANIZATION_UPDATE);
      const organization = await tx.organization.update({
        where: { id: organizationId }, data: { name: input.name }, select: publicOrganization,
      });
      await this.audit.record({ event: AUDIT_EVENTS.ORGANIZATION_UPDATED, organizationId, actorUserId: userId,
        resourceId: organizationId, metadata: { changedFields: ['name'] } }, tx);
      await this.notifications.createForRecipient({ organizationId, recipientUserId: userId,
        type: NOTIFICATION_TYPES.ORGANIZATION_UPDATED, metadata: { changedFields: ['name'] } }, tx);
      return organization;
    });
  }

  private async assertCan(tx: Prisma.TransactionClient, userId: string, organizationId: string, permission: PermissionKey): Promise<void> {
    if (!(await this.authorization.can(userId, permission, organizationId, tx))) throw new ForbiddenException();
  }

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
}

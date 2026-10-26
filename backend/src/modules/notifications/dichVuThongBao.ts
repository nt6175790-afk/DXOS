// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { AuthorizationService } from '../rbac/authorization.service';
import { isOrganizationIdentifier } from '../rbac/permission-catalog';
import { CreateNotification, notificationContent, NOTIFICATION_TYPES } from './notification-catalog';
import { NotificationQueryDto } from './notification.dto';

const categoryWhere = (category: 'work' | 'organization' | 'other'): Prisma.NotificationWhereInput =>
  category === 'work' ? { type: { in: [NOTIFICATION_TYPES.TASK_ASSIGNED, NOTIFICATION_TYPES.LEAVE_STATUS_CHANGED] } }
    : category === 'organization' ? { type: NOTIFICATION_TYPES.ORGANIZATION_UPDATED }
    : { type: { notIn: Object.values(NOTIFICATION_TYPES) } };

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService,
    private readonly audit: AuditService) {}

  async createForRecipient(input: CreateNotification, database?: Prisma.TransactionClient) {
    const content = notificationContent(input);
    const create = async (tx: Prisma.TransactionClient) => {
      await this.assertMember(tx, input.recipientUserId, input.organizationId);
      const row = await tx.notification.create({ data: { organizationId: input.organizationId,
        recipientUserId: input.recipientUserId, type: input.type, ...content, createdAt: new Date() } });
      await this.audit.record({ event: AUDIT_EVENTS.NOTIFICATION_CREATED,
        organizationId: input.organizationId, resourceId: row.id }, tx);
      return { ...row, isRead: row.readAt !== null };
    };
    return database ? create(database) : this.transaction(create);
  }

  async list(userId: string, organizationId: string, query: NotificationQueryDto) {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100 ||
      (query.state !== undefined && !['read', 'unread'].includes(query.state)) ||
      (query.category !== undefined && !['work', 'organization', 'other'].includes(query.category)) ||
      (query.after !== undefined && !isOrganizationIdentifier(query.after))) throw new BadRequestException();
    return this.transaction(async (tx) => {
      await this.assertMember(tx, userId, organizationId);
      const scope = { organizationId, recipientUserId: userId };
      const cursor = query.after ? await tx.notification.findFirst({
        where: { ...scope, id: query.after }, select: { id: true, createdAt: true },
      }) : null;
      if (query.after && !cursor) throw new BadRequestException('Invalid cursor');
      const rows = await tx.notification.findMany({ where: { ...scope,
        ...(query.category ? categoryWhere(query.category) : {}),
        ...(query.state ? { readAt: query.state === 'unread' ? null : { not: null } } : {}),
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
      const items = rows.slice(0, query.limit).map((row) => ({ ...row, isRead: row.readAt !== null }));
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
    });
  }

  async markRead(userId: string, organizationId: string, id: string) {
    if (!isOrganizationIdentifier(id)) throw new ForbiddenException();
    return this.transaction(async (tx) => {
      await this.assertMember(tx, userId, organizationId);
      const where = { id, organizationId, recipientUserId: userId };
      const row = await tx.notification.findFirst({ where });
      if (!row) throw new ForbiddenException();
      if (row.readAt === null) await tx.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
      const result = await tx.notification.findFirstOrThrow({ where });
      return { ...result, isRead: result.readAt !== null };
    });
  }

  summary(userId: string, organizationId: string) {
    return this.transaction(async (tx) => {
      await this.assertMember(tx, userId, organizationId);
      const scope = { organizationId, recipientUserId: userId };
      const categories = { work: { total: 0, unread: 0 }, organization: { total: 0, unread: 0 }, other: { total: 0, unread: 0 } };
      for (const category of ['work', 'organization', 'other'] as const) {
        const where = { ...scope, ...categoryWhere(category) };
        categories[category] = { total: await tx.notification.count({ where }), unread: await tx.notification.count({ where: { ...where, readAt: null } }) };
      }
      const values = Object.values(categories);
      const total = values.reduce((sum, item) => sum + item.total, 0); const unread = values.reduce((sum, item) => sum + item.unread, 0);
      return { total, unread, read: total - unread, categories };
    });
  }

  markAllRead(userId: string, organizationId: string) {
    return this.transaction(async (tx) => {
      await this.assertMember(tx, userId, organizationId);
      const result = await tx.notification.updateMany({ where: { organizationId, recipientUserId: userId, readAt: null }, data: { readAt: new Date() } });
      return { updatedCount: result.count };
    });
  }

  private async assertMember(tx: Prisma.TransactionClient, userId: string, organizationId: string) {
    if (!(await this.authorization.isActiveMember(userId, organizationId, tx))) throw new ForbiddenException();
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

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS, isOrganizationIdentifier } from '../rbac/permission-catalog';
import { AUDIT_EVENT_NAMES } from './audit-catalog';
import type { AuditQueryDto } from './audit-query.dto';

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async list(userId: string, organizationId: string, query: AuditQueryDto) {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100 ||
      (query.after !== undefined && !isOrganizationIdentifier(query.after)) ||
      (query.event !== undefined && !AUDIT_EVENT_NAMES.includes(query.event))) throw new BadRequestException();
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.authorization.can(userId, PERMISSIONS.AUDIT_READ, organizationId, tx))) throw new ForbiddenException();
      const scope = { organizationId, ...(query.event ? { event: query.event } : {}) };
      const cursor = query.after ? await tx.auditEvent.findFirst({
        where: { ...scope, id: query.after }, select: { createdAt: true, id: true },
      }) : null;
      if (query.after && !cursor) throw new BadRequestException();
      const rows = await tx.auditEvent.findMany({
        where: { ...scope, ...(cursor ? { OR: [
          { createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ] } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
      });
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { fileVisibility } from '../files/file-visibility';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { searchCategories, type SearchCategory, type SearchQueryDto } from './search.dto';

const grants: Record<SearchCategory, PermissionKey | null> = { employees: PERMISSIONS.EMPLOYEE_READ, tasks: PERMISSIONS.TASK_READ,
  documents: PERMISSIONS.FILE_READ, departments: PERMISSIONS.DEPARTMENT_READ, notifications: null };
interface SearchItem { id: string; title: string; subtitle: string | null }
interface SearchPage { items: SearchItem[]; nextCursor: string | null }

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService, private readonly audit: AuditService) {}

  async search(actorId: string, organizationId: string, query: SearchQueryDto) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const effective = await this.authorization.effectivePermissions(actorId, organizationId, tx);
          if (!effective) throw new ForbiddenException();
          if (query.type !== 'all' && grants[query.type] && !effective.includes(grants[query.type]!)) throw new ForbiddenException();
          if (query.type === 'all' && query.after) throw new BadRequestException();
          const groups: Record<SearchCategory, SearchPage | null> = { employees: null, tasks: null, documents: null, departments: null, notifications: null };
          for (const type of searchCategories) {
            if ((query.type === 'all' || query.type === type) && (!grants[type] || effective.includes(grants[type]!))) {
              const rows = await this.rows(tx, actorId, organizationId, type, query);
              const items = rows.slice(0, query.limit);
              groups[type] = { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
            }
          }
          return { groups };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 });
      } catch (error) {
        if (error instanceof ForbiddenException) await this.audit.record({ event: AUDIT_EVENTS.AUTHORIZATION_DENIED, actorUserId: actorId, metadata: { reason: 'PERMISSION_DENIED' } });
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }

  private async rows(tx: Prisma.TransactionClient, actorId: string, organizationId: string, type: SearchCategory, query: SearchQueryDto): Promise<SearchItem[]> {
    // Prisma parameterizes values; escape LIKE metacharacters so user input is a literal substring.
    const contains = query.q.replace(/[\\%_]/g, '\\$&');
    const scope = { organizationId, ...(query.after ? { id: { gt: query.after } } : {}) };
    const page = { orderBy: { id: 'asc' as const }, take: query.limit + 1 };
    switch (type) {
      case 'employees': return (await tx.employee.findMany({ where: { ...scope, OR: [{ displayName: { contains } }, { employeeCode: { contains } }] },
        select: { id: true, displayName: true, employeeCode: true }, ...page })).map((row) => ({ id: row.id, title: row.displayName, subtitle: row.employeeCode }));
      case 'tasks': return (await tx.task.findMany({ where: { ...scope, title: { contains } }, select: { id: true, title: true }, ...page })).map((row) => ({ ...row, subtitle: null }));
      case 'documents': return (await tx.fileObject.findMany({ where: { ...scope, ...await fileVisibility(this.authorization, tx, actorId, organizationId), status: 'AVAILABLE', originalFilename: { contains } },
        select: { id: true, originalFilename: true, contentType: true }, ...page })).map((row) => ({ id: row.id, title: row.originalFilename, subtitle: row.contentType }));
      case 'departments': return (await tx.department.findMany({ where: { ...scope, OR: [{ name: { contains } }, { code: { contains } }] },
        select: { id: true, name: true, code: true }, ...page })).map((row) => ({ id: row.id, title: row.name, subtitle: row.code }));
      case 'notifications': return (await tx.notification.findMany({ where: { ...scope, recipientUserId: actorId, title: { contains } },
        select: { id: true, title: true }, ...page })).map((row) => ({ ...row, subtitle: null }));
    }
  }
}

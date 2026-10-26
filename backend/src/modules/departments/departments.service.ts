// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type DepartmentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import type { CreateDepartmentDto, ListDepartmentsDto, UpdateDepartmentDto } from './department.dto';

const projection = { id: true, organizationId: true, code: true, name: true, description: true,
  status: true, createdAt: true, updatedAt: true } satisfies Prisma.DepartmentSelect;
export type DepartmentResponse = Prisma.DepartmentGetPayload<{ select: typeof projection }>;

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService,
    private readonly audit: AuditService) {}

  // Internal reference validation after caller authorization, within the caller's serializable transaction.
  async assertActiveReference(organizationId: string, id: string,
    tx: Pick<Prisma.TransactionClient, 'department'>): Promise<void> {
    const row = await tx.department.findUnique({ where: { organizationId_id: { organizationId, id } }, select: { status: true } });
    if (!row) throw new NotFoundException();
    if (row.status !== 'ACTIVE') throw new ConflictException();
  }

  create(userId: string, organizationId: string, input: CreateDepartmentDto): Promise<DepartmentResponse> {
    return this.transaction(userId, organizationId, PERMISSIONS.DEPARTMENT_CREATE, async (tx) => {
      const row = await tx.department.create({ data: { organizationId, code: input.code, name: input.name,
        description: input.description ?? null }, select: projection });
      await this.audit.record({ event: AUDIT_EVENTS.DEPARTMENT_CREATED, organizationId, actorUserId: userId,
        resourceId: row.id }, tx);
      return row;
    });
  }

  list(userId: string, organizationId: string, query: ListDepartmentsDto) {
    return this.transaction(userId, organizationId, PERMISSIONS.DEPARTMENT_READ, async (tx) => {
      const rows = await tx.department.findMany({ where: { organizationId,
        ...(query.after ? { id: { gt: query.after } } : {}), ...(query.status ? { status: query.status } : {}) },
      select: projection, orderBy: { id: 'asc' }, take: query.limit + 1 });
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
    });
  }

  /**
   * Read model for the AI assistant: departments with active headcount and open-task counts.
   * Counts are null when the caller lacks employee:read / task:read, mirroring the dashboard. At most 50 departments.
   */
  summarizeForAssistant(userId: string, organizationId: string, status: DepartmentStatus | 'ALL') {
    return this.transaction(userId, organizationId, PERMISSIONS.DEPARTMENT_READ, async (tx) => {
      const where = { organizationId, ...(status === 'ALL' ? {} : { status }) };
      const employeeRead = await this.authorization.can(userId, PERMISSIONS.EMPLOYEE_READ, organizationId, tx);
      const taskRead = await this.authorization.can(userId, PERMISSIONS.TASK_READ, organizationId, tx);
      const total = await tx.department.count({ where });
      const rows = await tx.department.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 50,
        select: { id: true, code: true, name: true, status: true } });
      const ids = rows.map((row) => row.id);
      const employees = employeeRead ? await tx.employee.groupBy({ by: ['departmentId'],
        where: { organizationId, status: 'ACTIVE', departmentId: { in: ids } }, _count: { _all: true } }) : [];
      const tasks = taskRead ? await tx.task.groupBy({ by: ['departmentId'],
        where: { organizationId, status: { in: ['TODO', 'IN_PROGRESS'] }, departmentId: { in: ids } }, _count: { _all: true } }) : [];
      const countFor = (groups: { departmentId: string | null; _count: { _all: number } }[], id: string) =>
        groups.find((group) => group.departmentId === id)?._count._all ?? 0;
      return {
        total, hasMore: total > rows.length,
        items: rows.map((row) => ({ ...row,
          activeEmployees: employeeRead ? countFor(employees, row.id) : null,
          openTasks: taskRead ? countFor(tasks, row.id) : null })),
      };
    });
  }

  getById(userId: string, organizationId: string, departmentId: string): Promise<DepartmentResponse> {
    return this.transaction(userId, organizationId, PERMISSIONS.DEPARTMENT_READ, (tx) => this.find(tx, organizationId, departmentId));
  }

  update(userId: string, organizationId: string, departmentId: string, input: UpdateDepartmentDto): Promise<DepartmentResponse> {
    return this.transaction(userId, organizationId, PERMISSIONS.DEPARTMENT_UPDATE, async (tx) => {
      const keys = ['name', 'description', 'status'] as const;
      if (!keys.some((key) => input[key] !== undefined)) throw new BadRequestException({ message: ['At least one editable field is required.'] });
      const existing = await this.find(tx, organizationId, departmentId);
      const changedFields = keys.filter((key) => input[key] !== undefined && input[key] !== existing[key]);
      if (!changedFields.length) return existing;
      const row = await tx.department.update({ where: { organizationId_id: { organizationId, id: departmentId } },
        data: { name: input.name, description: input.description, status: input.status }, select: projection });
      await this.audit.record({ event: AUDIT_EVENTS.DEPARTMENT_UPDATED, organizationId, actorUserId: userId,
        resourceId: row.id, metadata: { changedFields } }, tx);
      return row;
    });
  }

  private async find(tx: Prisma.TransactionClient, organizationId: string, id: string): Promise<DepartmentResponse> {
    const row = await tx.department.findUnique({ where: { organizationId_id: { organizationId, id } }, select: projection });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async transaction<T>(userId: string, organizationId: string, permission: PermissionKey,
    operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          if (!(await this.authorization.can(userId, permission, organizationId, tx))) throw new ForbiddenException();
          return operation(tx);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
}

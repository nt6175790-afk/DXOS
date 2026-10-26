// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, type TaskStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';

const openStatuses: TaskStatus[] = ['TODO', 'IN_PROGRESS'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService,
    private readonly audit: AuditService) {}

  async get(actorId: string, organizationId: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const permissions = await this.authorization.effectivePermissions(actorId, organizationId, tx);
          if (permissions === null) throw new ForbiddenException();
          const taskRead = permissions.includes(PERMISSIONS.TASK_READ);
          const employeeRead = permissions.includes(PERMISSIONS.EMPLOYEE_READ);
          const generatedAt = new Date();
          const tasks = taskRead ? await this.taskSummary(tx, organizationId, generatedAt) : null;
          const departments = permissions.includes(PERMISSIONS.DEPARTMENT_READ)
            ? await this.departmentSummary(tx, organizationId, employeeRead, taskRead) : null;
          const employees = employeeRead ? await this.employeeSummary(tx, organizationId) : null;
          const workload = taskRead && employeeRead ? await this.workload(tx, organizationId) : null;
          const scope = { organizationId, recipientUserId: actorId };
          const notifications = { total: await tx.notification.count({ where: scope }),
            unread: await tx.notification.count({ where: { ...scope, readAt: null } }) };
          const activity = permissions.includes(PERMISSIONS.AUDIT_READ) ? await this.activity(tx, organizationId) : null;
          return { organizationId, generatedAt, tasks, departments, employees, workload, notifications, activity };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 });
      } catch (error) {
        if (error instanceof ForbiddenException) {
          await this.audit.record({ event: AUDIT_EVENTS.AUTHORIZATION_DENIED, actorUserId: actorId,
            metadata: { reason: 'PERMISSION_DENIED' } });
        }
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }

  private async taskSummary(tx: Prisma.TransactionClient, organizationId: string, generatedAt: Date) {
    const groups = await tx.task.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } });
    const byStatus = { TODO: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 };
    for (const group of groups) byStatus[group.status] = group._count._all;
    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
    const open = byStatus.TODO + byStatus.IN_PROGRESS;
    const scope = { organizationId, status: { in: openStatuses } };
    const overdueScope = { ...scope, dueAt: { lt: generatedAt } };
    const overdue = await tx.task.count({ where: overdueScope });
    const unassigned = await tx.task.count({ where: { ...scope, assigneeEmployeeId: null } });
    const overdueItems = await tx.task.findMany({ where: overdueScope, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 5,
      select: { id: true, title: true, status: true, priority: true, progressPercent: true, dueAt: true } });
    const eligible = total - byStatus.CANCELLED;
    return { total, byStatus, open, overdue, unassigned,
      completionPercent: eligible ? Math.round(byStatus.DONE / eligible * 1000) / 10 : null,
      health: !eligible ? 'EMPTY' as const : overdue || unassigned ? 'ATTENTION' as const : 'ON_TRACK' as const,
      overdueItems, overdueHasMore: overdue > overdueItems.length };
  }

  private async departmentSummary(tx: Prisma.TransactionClient, organizationId: string, employeeRead: boolean, taskRead: boolean) {
    const total = await tx.department.count({ where: { organizationId } });
    const active = await tx.department.count({ where: { organizationId, status: 'ACTIVE' } });
    const rows = await tx.department.findMany({ where: { organizationId }, orderBy: { id: 'asc' }, take: 10,
      select: { id: true, name: true, status: true } });
    const items = [];
    for (const row of rows) items.push({ ...row,
      employeeCount: employeeRead ? await tx.employee.count({ where: { organizationId, departmentId: row.id } }) : null,
      openTasks: taskRead ? await tx.task.count({ where: { organizationId, departmentId: row.id, status: { in: openStatuses } } }) : null,
    });
    return { total, active, inactive: total - active, items, hasMore: total > rows.length };
  }

  private async employeeSummary(tx: Prisma.TransactionClient, organizationId: string) {
    const total = await tx.employee.count({ where: { organizationId } });
    const active = await tx.employee.count({ where: { organizationId, status: 'ACTIVE' } });
    return { total, active, inactive: total - active };
  }

  private async workload(tx: Prisma.TransactionClient, organizationId: string) {
    const groups = await tx.task.groupBy({ by: ['assigneeEmployeeId'],
      where: { organizationId, status: { in: openStatuses }, assigneeEmployeeId: { not: null } },
      _count: { assigneeEmployeeId: true }, orderBy: [{ _count: { assigneeEmployeeId: 'desc' } }, { assigneeEmployeeId: 'asc' }], take: 11 });
    const visible = groups.slice(0, 10);
    const employees = await tx.employee.findMany({ where: { organizationId, id: { in: visible.map((row) => row.assigneeEmployeeId!) } },
      select: { id: true, displayName: true, status: true } });
    const items = visible.map((row) => {
      const employee = employees.find((item) => item.id === row.assigneeEmployeeId)!;
      return { employeeId: employee.id, displayName: employee.displayName, status: employee.status, openTasks: row._count.assigneeEmployeeId };
    });
    return { items, hasMore: groups.length > 10 };
  }

  private async activity(tx: Prisma.TransactionClient, organizationId: string) {
    const rows = await tx.auditEvent.findMany({ where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 11,
      select: { id: true, event: true, resourceType: true, resourceId: true, outcome: true, createdAt: true } });
    return { items: rows.slice(0, 10), hasMore: rows.length > 10 };
  }
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { EmployeesService } from '../people/employees.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { collaborationPermissions, type TaskCollaborationKind } from './task-policy';
import type { CreateTaskChecklistItemDto, SetTaskReviewerDto, TaskActivityQueryDto, UpdateTaskChecklistItemDto } from './task-planning.dto';

const checklistProjection = { id: true, taskId: true, title: true, isCompleted: true, createdAt: true, updatedAt: true } satisfies Prisma.TaskChecklistItemSelect;
const reviewerProjection = { employeeId: true, employee: { select: { displayName: true } } } satisfies Prisma.TaskReviewerSelect;
const taskEvents = [
  AUDIT_EVENTS.TASK_CREATED, AUDIT_EVENTS.TASK_UPDATED, AUDIT_EVENTS.TASK_ASSIGNED, AUDIT_EVENTS.TASK_STATUS_CHANGED,
  AUDIT_EVENTS.TASK_CHECKLIST_ADDED, AUDIT_EVENTS.TASK_CHECKLIST_UPDATED, AUDIT_EVENTS.TASK_CHECKLIST_REMOVED, AUDIT_EVENTS.TASK_REVIEWER_CHANGED,
] as const;

@Injectable()
export class TaskPlanningService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService,
    private readonly audit: AuditService, private readonly employees: EmployeesService) {}

  get(actorId: string, organizationId: string, taskId: string) {
    return this.transaction(actorId, organizationId, 'GET', 'planning', async (tx) => {
      await this.task(tx, organizationId, taskId);
      const canReadEmployee = await this.authorization.can(actorId, PERMISSIONS.EMPLOYEE_READ, organizationId, tx);
      const [reviewer, checklist] = await Promise.all([
        tx.taskReviewer.findUnique({ where: { organizationId_taskId: { organizationId, taskId } }, select: reviewerProjection }),
        tx.taskChecklistItem.findMany({ where: { organizationId, taskId }, select: checklistProjection,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 }),
      ]);
      return { reviewer: this.reviewerResponse(reviewer, canReadEmployee), checklist };
    });
  }

  setReviewer(actorId: string, organizationId: string, taskId: string, input: SetTaskReviewerDto) {
    return this.transaction(actorId, organizationId, 'PATCH', 'reviewer', async (tx) => {
      await this.task(tx, organizationId, taskId, true);
      const where = { organizationId_taskId: { organizationId, taskId } };
      const existing = await tx.taskReviewer.findUnique({ where, select: reviewerProjection });
      if (input.reviewerEmployeeId === null) {
        if (!existing) return null;
        await tx.taskReviewer.delete({ where });
        await this.audit.record({ event: AUDIT_EVENTS.TASK_REVIEWER_CHANGED, organizationId, actorUserId: actorId, resourceId: taskId }, tx);
        return null;
      }
      if (existing?.employeeId === input.reviewerEmployeeId) {
        const canReadEmployee = await this.authorization.can(actorId, PERMISSIONS.EMPLOYEE_READ, organizationId, tx);
        return this.reviewerResponse(existing, canReadEmployee);
      }
      await this.employees.eligibleAssignee(organizationId, input.reviewerEmployeeId, tx);
      const reviewer = await tx.taskReviewer.upsert({ where, create: { organizationId, taskId, employeeId: input.reviewerEmployeeId },
        update: { employeeId: input.reviewerEmployeeId }, select: reviewerProjection });
      await this.audit.record({ event: AUDIT_EVENTS.TASK_REVIEWER_CHANGED, organizationId, actorUserId: actorId, resourceId: taskId }, tx);
      const canReadEmployee = await this.authorization.can(actorId, PERMISSIONS.EMPLOYEE_READ, organizationId, tx);
      return this.reviewerResponse(reviewer, canReadEmployee);
    });
  }

  createChecklistItem(actorId: string, organizationId: string, taskId: string, input: CreateTaskChecklistItemDto) {
    return this.transaction(actorId, organizationId, 'POST', 'checklist', async (tx) => {
      await this.task(tx, organizationId, taskId, true);
      if (await tx.taskChecklistItem.count({ where: { organizationId, taskId } }) >= 100) throw new ConflictException();
      const item = await tx.taskChecklistItem.create({ data: { organizationId, taskId, title: input.title }, select: checklistProjection });
      await this.audit.record({ event: AUDIT_EVENTS.TASK_CHECKLIST_ADDED, organizationId, actorUserId: actorId, resourceId: taskId }, tx);
      return item;
    });
  }

  updateChecklistItem(actorId: string, organizationId: string, taskId: string, itemId: string, input: UpdateTaskChecklistItemDto) {
    return this.transaction(actorId, organizationId, 'PATCH', 'checklist', async (tx) => {
      await this.task(tx, organizationId, taskId, true);
      if (input.title === undefined && input.isCompleted === undefined) throw new BadRequestException();
      const existing = await tx.taskChecklistItem.findFirst({ where: { id: itemId, organizationId, taskId }, select: checklistProjection });
      if (!existing) throw new NotFoundException();
      if ((input.title === undefined || input.title === existing.title) && (input.isCompleted === undefined || input.isCompleted === existing.isCompleted)) return existing;
      const item = await tx.taskChecklistItem.update({ where: { id: existing.id }, data: { title: input.title, isCompleted: input.isCompleted }, select: checklistProjection });
      await this.audit.record({ event: AUDIT_EVENTS.TASK_CHECKLIST_UPDATED, organizationId, actorUserId: actorId, resourceId: taskId }, tx);
      return item;
    });
  }

  deleteChecklistItem(actorId: string, organizationId: string, taskId: string, itemId: string): Promise<void> {
    return this.transaction(actorId, organizationId, 'DELETE', 'checklist', async (tx) => {
      await this.task(tx, organizationId, taskId, true);
      const item = await tx.taskChecklistItem.findFirst({ where: { id: itemId, organizationId, taskId }, select: { id: true } });
      if (!item) throw new NotFoundException();
      await tx.taskChecklistItem.delete({ where: { id: item.id } });
      await this.audit.record({ event: AUDIT_EVENTS.TASK_CHECKLIST_REMOVED, organizationId, actorUserId: actorId, resourceId: taskId }, tx);
    });
  }

  activity(actorId: string, organizationId: string, taskId: string, query: TaskActivityQueryDto) {
    return this.transaction(actorId, organizationId, 'GET', 'activity', async (tx) => {
      await this.task(tx, organizationId, taskId);
      const scope = { organizationId, resourceType: 'task', resourceId: taskId, event: { in: [...taskEvents] } };
      const cursor = query.after ? await tx.auditEvent.findFirst({ where: { ...scope, id: query.after }, select: { id: true, createdAt: true } }) : null;
      if (query.after && !cursor) throw new BadRequestException();
      const rows = await tx.auditEvent.findMany({ where: { ...scope, ...(cursor ? { OR: [
        { createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1, select: { id: true, event: true, createdAt: true } });
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
    });
  }

  private reviewerResponse(reviewer: Prisma.TaskReviewerGetPayload<{ select: typeof reviewerProjection }> | null, canReadEmployee: boolean) {
    return reviewer ? { employeeId: reviewer.employeeId, displayName: canReadEmployee ? reviewer.employee.displayName : null } : null;
  }

  private async task(tx: Prisma.TransactionClient, organizationId: string, taskId: string, write = false) {
    const task = await tx.task.findUnique({ where: { organizationId_id: { organizationId, id: taskId } }, select: { status: true } });
    if (!task) throw new NotFoundException();
    if (write && (task.status === 'DONE' || task.status === 'CANCELLED')) throw new ConflictException();
  }

  private async transaction<T>(actorId: string, organizationId: string, method: string, kind: TaskCollaborationKind,
    operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          for (const permission of collaborationPermissions(method, kind)) {
            if (!(await this.authorization.can(actorId, permission, organizationId, tx))) throw new ForbiddenException();
          }
          return operation(tx);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2034', 'P2002'].includes(error.code)) throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
}

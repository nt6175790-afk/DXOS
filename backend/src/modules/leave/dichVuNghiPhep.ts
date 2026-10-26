// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveStatus, LeaveType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { NotificationService } from '../notifications/notification.service';
import { NOTIFICATION_TYPES } from '../notifications/notification-catalog';
import type { ApproveLeaveRequestDto, CancelLeaveRequestDto, CreateLeaveRequestDto, ListLeaveRequestsDto, RejectLeaveRequestDto } from './leave.dto';

export const leaveProjection = {
  id: true,
  organizationId: true,
  employeeId: true,
  createdByUserId: true,
  leaveType: true,
  startsAt: true,
  endsAt: true,
  daysCount: true,
  reason: true,
  status: true,
  reviewerUserId: true,
  reviewerNote: true,
  reviewedAt: true,
  calendarEventId: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      displayName: true,
      jobTitle: true,
      departmentId: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  },
} satisfies Prisma.LeaveRequestSelect;

export type LeaveRequestResponse = Prisma.LeaveRequestGetPayload<{ select: typeof leaveProjection }>;

export function calculateLeaveDays(startsAt: Date, endsAt: Date): number {
  const offsetMs = 7 * 60 * 60 * 1000;
  const startLocal = new Date(startsAt.getTime() + offsetMs);
  const endLocal = new Date(endsAt.getTime() + offsetMs);

  const startDay = Date.UTC(startLocal.getUTCFullYear(), startLocal.getUTCMonth(), startLocal.getUTCDate());
  const endDay = Date.UTC(endLocal.getUTCFullYear(), endLocal.getUTCMonth(), endLocal.getUTCDate());

  if (startDay === endDay) {
    const hours = (endsAt.getTime() - startsAt.getTime()) / (3600 * 1000);
    return hours <= 5 ? 0.5 : 1.0;
  }

  const diffDays = Math.round((endDay - startDay) / (86400 * 1000)) + 1;
  return Math.max(1, diffDays);
}

export function leaveTypeLabel(type: LeaveType): string {
  switch (type) {
    case LeaveType.ANNUAL:
      return 'Nghỉ phép năm';
    case LeaveType.SICK:
      return 'Nghỉ ốm';
    case LeaveType.PERSONAL:
      return 'Việc riêng';
    case LeaveType.UNPAID:
      return 'Nghỉ không lương';
    case LeaveType.OTHER:
    default:
      return 'Nghỉ phép khác';
  }
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async create(actorId: string, organizationId: string, input: CreateLeaveRequestDto): Promise<LeaveRequestResponse> {
    return this.transaction(actorId, organizationId, [PERMISSIONS.LEAVE_CREATE], async (tx) => {
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);

      if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
        throw new BadRequestException('Invalid date timestamp');
      }

      if (endsAt.getTime() <= startsAt.getTime()) {
        throw new BadRequestException('endsAt must be after startsAt');
      }

      const durationMs = endsAt.getTime() - startsAt.getTime();
      if (durationMs > 90 * 86400000) {
        throw new BadRequestException('Leave duration cannot exceed 90 days');
      }

      const employee = await tx.employee.findUnique({
        where: { organizationId_id: { organizationId, id: input.employeeId } },
        select: { id: true, userId: true, status: true, displayName: true },
      });

      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      if (employee.status !== 'ACTIVE') {
        throw new ConflictException('Employee is not active');
      }

      if (employee.userId !== actorId) {
        throw new ForbiddenException('Cannot submit leave request for another employee');
      }

      // Check overlapping with existing APPROVED leave
      const overlap = await tx.leaveRequest.findFirst({
        where: {
          organizationId,
          employeeId: employee.id,
          status: LeaveStatus.APPROVED,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { id: true },
      });

      if (overlap) {
        throw new ConflictException('Leave period overlaps with an already approved leave');
      }

      const daysCount = calculateLeaveDays(startsAt, endsAt);

      const row = await tx.leaveRequest.create({
        data: {
          organizationId,
          employeeId: employee.id,
          createdByUserId: actorId,
          leaveType: input.leaveType,
          startsAt,
          endsAt,
          daysCount,
          reason: input.reason,
          status: LeaveStatus.PENDING,
        },
        select: leaveProjection,
      });

      const typeLabel = leaveTypeLabel(input.leaveType);
      const title = `Đơn xin nghỉ phép (${typeLabel}: ${daysCount} ngày)`;
      await tx.approvalRequest.create({
        data: {
          organizationId,
          requesterId: employee.id,
          type: 'LEAVE',
          status: 'PENDING',
          title,
          reason: input.reason,
          payload: {
            leaveRequestId: row.id,
            leaveType: input.leaveType,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            daysCount,
          },
          referenceId: row.id,
        },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.LEAVE_REQUEST_CREATED,
          organizationId,
          actorUserId: actorId,
          resourceId: row.id,
        },
        tx,
      );

      return row;
    });
  }

  async approve(actorId: string, organizationId: string, leaveId: string, input: ApproveLeaveRequestDto): Promise<LeaveRequestResponse> {
    return this.transaction(actorId, organizationId, [PERMISSIONS.LEAVE_APPROVE], async (tx) => {
      const leave = await tx.leaveRequest.findUnique({
        where: { organizationId_id: { organizationId, id: leaveId } },
        include: { employee: true },
      });

      if (!leave) {
        throw new NotFoundException('Leave request not found');
      }

      if (leave.createdByUserId === actorId || leave.employee.userId === actorId) {
        throw new ForbiddenException('Self approval is not permitted');
      }

      if (leave.status !== LeaveStatus.PENDING) {
        throw new ConflictException('Only pending leave requests can be approved');
      }

      // Re-check overlap before approving
      const overlap = await tx.leaveRequest.findFirst({
        where: {
          organizationId,
          employeeId: leave.employeeId,
          id: { not: leave.id },
          status: LeaveStatus.APPROVED,
          startsAt: { lt: leave.endsAt },
          endsAt: { gt: leave.startsAt },
        },
        select: { id: true },
      });

      if (overlap) {
        throw new ConflictException('Leave request overlaps with an already approved leave');
      }

      // Create CalendarEvent if not already present
      let calendarEventId = leave.calendarEventId;
      if (!calendarEventId) {
        const typeLabel = leaveTypeLabel(leave.leaveType);
        const event = await tx.calendarEvent.create({
          data: {
            organizationId,
            createdByUserId: actorId,
            title: `[Nghỉ phép] ${leave.employee.displayName} (${typeLabel})`,
            description: `Lý do: ${leave.reason}${input.note ? ` | Duyệt: ${input.note}` : ''}`,
            kind: 'EVENT',
            startsAt: leave.startsAt,
            endsAt: leave.endsAt,
            status: 'SCHEDULED',
          },
        });
        calendarEventId = event.id;
      }

      const updated = await tx.leaveRequest.update({
        where: { organizationId_id: { organizationId, id: leaveId } },
        data: {
          status: LeaveStatus.APPROVED,
          reviewerUserId: actorId,
          reviewerNote: input.note ?? null,
          reviewedAt: new Date(),
          calendarEventId,
        },
        select: leaveProjection,
      });

      const reviewerEmp = await tx.employee.findUnique({
        where: { organizationId_userId: { organizationId, userId: actorId } },
        select: { id: true },
      });

      await tx.approvalRequest.updateMany({
        where: {
          organizationId,
          type: 'LEAVE',
          referenceId: leaveId,
          status: 'PENDING',
        },
        data: {
          status: 'APPROVED',
          reviewerId: reviewerEmp?.id ?? null,
          reviewerNote: input.note ?? null,
          reviewedAt: new Date(),
        },
      });

      // Notify employee
      await this.notifications.createForRecipient(
        {
          organizationId,
          recipientUserId: leave.employee.userId,
          type: NOTIFICATION_TYPES.LEAVE_STATUS_CHANGED,
          metadata: {
            leaveRequestId: leave.id,
            status: 'APPROVED',
          },
        },
        tx,
      );

      await this.audit.record(
        {
          event: AUDIT_EVENTS.LEAVE_REQUEST_APPROVED,
          organizationId,
          actorUserId: actorId,
          resourceId: leave.id,
        },
        tx,
      );

      return updated;
    });
  }

  async reject(actorId: string, organizationId: string, leaveId: string, input: RejectLeaveRequestDto): Promise<LeaveRequestResponse> {
    return this.transaction(actorId, organizationId, [PERMISSIONS.LEAVE_APPROVE], async (tx) => {
      const leave = await tx.leaveRequest.findUnique({
        where: { organizationId_id: { organizationId, id: leaveId } },
        include: { employee: true },
      });

      if (!leave) {
        throw new NotFoundException('Leave request not found');
      }

      if (leave.createdByUserId === actorId || leave.employee.userId === actorId) {
        throw new ForbiddenException('Self review is not permitted');
      }

      if (leave.status !== LeaveStatus.PENDING) {
        throw new ConflictException('Only pending leave requests can be rejected');
      }

      const updated = await tx.leaveRequest.update({
        where: { organizationId_id: { organizationId, id: leaveId } },
        data: {
          status: LeaveStatus.REJECTED,
          reviewerUserId: actorId,
          reviewerNote: input.reason,
          reviewedAt: new Date(),
        },
        select: leaveProjection,
      });

      const reviewerEmp = await tx.employee.findUnique({
        where: { organizationId_userId: { organizationId, userId: actorId } },
        select: { id: true },
      });

      await tx.approvalRequest.updateMany({
        where: {
          organizationId,
          type: 'LEAVE',
          referenceId: leaveId,
          status: 'PENDING',
        },
        data: {
          status: 'REJECTED',
          reviewerId: reviewerEmp?.id ?? null,
          reviewerNote: input.reason,
          reviewedAt: new Date(),
        },
      });

      // Notify employee with reason
      await this.notifications.createForRecipient(
        {
          organizationId,
          recipientUserId: leave.employee.userId,
          type: NOTIFICATION_TYPES.LEAVE_STATUS_CHANGED,
          metadata: {
            leaveRequestId: leave.id,
            status: 'REJECTED',
            reason: input.reason,
          },
        },
        tx,
      );

      await this.audit.record(
        {
          event: AUDIT_EVENTS.LEAVE_REQUEST_REJECTED,
          organizationId,
          actorUserId: actorId,
          resourceId: leave.id,
        },
        tx,
      );

      return updated;
    });
  }

  async cancel(actorId: string, organizationId: string, leaveId: string, input: CancelLeaveRequestDto): Promise<LeaveRequestResponse> {
    return this.transaction(actorId, organizationId, [], async (tx) => {
      const leave = await tx.leaveRequest.findUnique({
        where: { organizationId_id: { organizationId, id: leaveId } },
        include: { employee: true },
      });

      if (!leave) {
        throw new NotFoundException('Leave request not found');
      }

      const isCreator = leave.createdByUserId === actorId || leave.employee.userId === actorId;
      if (!isCreator) {
        const canApprove =
          (await this.authorization.can(actorId, PERMISSIONS.LEAVE_APPROVE, organizationId, tx)) ||
          (await this.authorization.can(actorId, PERMISSIONS.LEAVE_CANCEL, organizationId, tx));
        if (!canApprove) {
          throw new ForbiddenException('Cannot cancel leave request of another employee');
        }
      }

      if (leave.status === LeaveStatus.CANCELLED || leave.status === LeaveStatus.REJECTED) {
        throw new ConflictException('Leave request is already finalized');
      }

      if (leave.calendarEventId) {
        await tx.calendarEvent.update({
          where: { organizationId_id: { organizationId, id: leave.calendarEventId } },
          data: { status: 'CANCELLED' },
        });
      }

      const updated = await tx.leaveRequest.update({
        where: { organizationId_id: { organizationId, id: leaveId } },
        data: {
          status: LeaveStatus.CANCELLED,
          reviewerNote: input.reason ? `[Đã hủy]: ${input.reason}` : leave.reviewerNote,
        },
        select: leaveProjection,
      });

      await tx.approvalRequest.updateMany({
        where: {
          organizationId,
          type: 'LEAVE',
          referenceId: leaveId,
          status: 'PENDING',
        },
        data: {
          status: 'CANCELLED',
          reviewerNote: input.reason ? `[Đã hủy]: ${input.reason}` : leave.reviewerNote,
        },
      });

      if (!isCreator) {
        await this.notifications.createForRecipient(
          {
            organizationId,
            recipientUserId: leave.employee.userId,
            type: NOTIFICATION_TYPES.LEAVE_STATUS_CHANGED,
            metadata: {
              leaveRequestId: leave.id,
              status: 'CANCELLED',
              ...(input.reason ? { reason: input.reason } : {}),
            },
          },
          tx,
        );
      }

      await this.audit.record(
        {
          event: AUDIT_EVENTS.LEAVE_REQUEST_CANCELLED,
          organizationId,
          actorUserId: actorId,
          resourceId: leave.id,
        },
        tx,
      );

      return updated;
    });
  }

  async list(actorId: string, organizationId: string, query: ListLeaveRequestsDto) {
    return this.transaction(actorId, organizationId, [PERMISSIONS.LEAVE_READ], async (tx) => {
      const canApprove = await this.authorization.can(actorId, PERMISSIONS.LEAVE_APPROVE, organizationId, tx);
      const isMine = query.mine === true || !canApprove;

      let employeeFilter: Prisma.LeaveRequestWhereInput = {};
      if (isMine) {
        employeeFilter = { employee: { userId: actorId } };
      } else if (query.employeeId) {
        employeeFilter = { employeeId: query.employeeId };
      }

      const cursor = query.after
        ? await tx.leaveRequest.findFirst({
            where: { organizationId, id: query.after },
            select: { id: true, createdAt: true },
          })
        : null;

      if (query.after && !cursor) {
        throw new BadRequestException('Invalid pagination cursor');
      }

      const rows = await tx.leaveRequest.findMany({
        where: {
          organizationId,
          ...employeeFilter,
          ...(query.status ? { status: query.status } : {}),
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: leaveProjection,
      });

      const items = rows.slice(0, query.limit);
      return {
        items,
        nextCursor: rows.length > query.limit ? items[items.length - 1].id : null,
      };
    });
  }

  /**
   * Read model for the AI assistant (leave:read): leave requests overlapping [startUtc, endUtc).
   * Same scope rule as `list`: without leave:approve only the caller's own requests. Reasons and reviewer notes are not read.
   */
  async listForAssistant(actorId: string, organizationId: string, query: { startUtc: Date; endUtc: Date; statuses: LeaveStatus[];
    type?: LeaveType; departmentId?: string; limit: number }) {
    return this.transaction(actorId, organizationId, [PERMISSIONS.LEAVE_READ], async (tx) => {
      const canApprove = await this.authorization.can(actorId, PERMISSIONS.LEAVE_APPROVE, organizationId, tx);
      const where: Prisma.LeaveRequestWhereInput = {
        organizationId, status: { in: query.statuses }, startsAt: { lt: query.endUtc }, endsAt: { gt: query.startUtc },
        ...(query.type ? { leaveType: query.type } : {}),
        ...(!canApprove ? { employee: { userId: actorId } } : query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
      };
      const [total, items] = await Promise.all([
        tx.leaveRequest.count({ where }),
        tx.leaveRequest.findMany({ where, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take: query.limit,
          select: { id: true, leaveType: true, startsAt: true, endsAt: true, daysCount: true, status: true,
            employee: { select: { displayName: true, department: { select: { name: true } } } } } }),
      ]);
      return { scope: canApprove ? 'organization' as const : 'mine' as const, total, items };
    });
  }

  async getById(actorId: string, organizationId: string, leaveId: string): Promise<LeaveRequestResponse> {
    return this.transaction(actorId, organizationId, [PERMISSIONS.LEAVE_READ], async (tx) => {
      const leave = await tx.leaveRequest.findUnique({
        where: { organizationId_id: { organizationId, id: leaveId } },
        select: leaveProjection,
      });

      if (!leave) {
        throw new NotFoundException('Leave request not found');
      }

      const canApprove = await this.authorization.can(actorId, PERMISSIONS.LEAVE_APPROVE, organizationId, tx);
      if (leave.createdByUserId !== actorId && !canApprove) {
        const callerEmployee = await tx.employee.findUnique({
          where: { organizationId_userId: { organizationId, userId: actorId } },
          select: { id: true },
        });
        if (callerEmployee?.id !== leave.employeeId) {
          throw new ForbiddenException();
        }
      }

      return leave;
    });
  }

  private async transaction<T>(
    actorId: string,
    organizationId: string,
    permissions: PermissionKey[],
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            for (const permission of permissions) {
              if (!(await this.authorization.can(actorId, permission, organizationId, tx))) {
                throw new ForbiddenException();
              }
            }
            return operation(tx);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
}

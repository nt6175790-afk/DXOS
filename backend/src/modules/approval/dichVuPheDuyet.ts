// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalRequestType, ApprovalStatus, AttendanceStatus, LeaveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { NotificationService } from '../notifications/notification.service';
import { NOTIFICATION_TYPES } from '../notifications/notification-catalog';
import {
  calculateEarlyLeaveMinutes,
  calculateLateMinutes,
  calculateWorkedMinutes,
} from '../attendance/attendance.service';
import { leaveTypeLabel } from '../leave/leave.service';
import { approvalProjection } from './approval.constants';
import type {
  ApproveRequestDto,
  CancelRequestDto,
  CreateAttendanceAdjustmentDto,
  ListApprovalsQueryDto,
  RejectRequestDto,
} from './approval.dto';
import type { ApprovalRequestResponse, AttendanceAdjustmentPayload } from './approval.types';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async createAttendanceAdjustment(
    actorUserId: string,
    organizationId: string,
    input: CreateAttendanceAdjustmentDto,
  ): Promise<ApprovalRequestResponse> {
    return this.transaction(actorUserId, organizationId, [PERMISSIONS.APPROVAL_CREATE], async (tx) => {
      const requesterEmployee = await tx.employee.findUnique({
        where: { organizationId_userId: { organizationId, userId: actorUserId } },
        select: { id: true, userId: true, status: true, displayName: true },
      });

      if (!requesterEmployee) {
        throw new NotFoundException('Employee record not found for user');
      }

      if (requesterEmployee.status !== 'ACTIVE') {
        throw new ConflictException('Employee is not active');
      }

      const targetEmployeeId = input.employeeId ?? requesterEmployee.id;
      if (targetEmployeeId !== requesterEmployee.id) {
        const canManage = await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_MANAGE, organizationId, tx);
        if (!canManage) {
          throw new ForbiddenException('Cannot submit attendance adjustment for another employee');
        }
      }

      const targetEmployee = targetEmployeeId === requesterEmployee.id
        ? requesterEmployee
        : await tx.employee.findUnique({
            where: { organizationId_id: { organizationId, id: targetEmployeeId } },
            select: { id: true, userId: true, status: true, displayName: true },
          });

      if (!targetEmployee || targetEmployee.status !== 'ACTIVE') {
        throw new NotFoundException('Target employee not found or inactive');
      }

      const [yearStr, monthStr, dayStr] = input.workDate.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1;
      const day = parseInt(dayStr, 10);
      const workDate = new Date(Date.UTC(year, month, day, 0, 0, 0));

      const targetCheckIn = new Date(input.targetCheckInAt);
      if (isNaN(targetCheckIn.getTime())) {
        throw new BadRequestException('Invalid targetCheckInAt timestamp');
      }

      let targetCheckOut: Date | null = null;
      if (input.targetCheckOutAt) {
        targetCheckOut = new Date(input.targetCheckOutAt);
        if (isNaN(targetCheckOut.getTime())) {
          throw new BadRequestException('Invalid targetCheckOutAt timestamp');
        }
        if (targetCheckOut.getTime() <= targetCheckIn.getTime()) {
          throw new BadRequestException('targetCheckOutAt must be after targetCheckInAt');
        }
      }

      // Check shift if provided
      if (input.shiftId) {
        const shift = await tx.shift.findUnique({
          where: { organizationId_id: { organizationId, id: input.shiftId } },
          select: { id: true, isActive: true },
        });
        if (!shift) {
          throw new NotFoundException('Shift not found');
        }
        if (!shift.isActive) {
          throw new ConflictException('Shift is not active');
        }
      }

      // Check duplicate pending adjustment for same employee and date
      const pendingAdjustment = await tx.approvalRequest.findFirst({
        where: {
          organizationId,
          requesterId: targetEmployee.id,
          type: ApprovalRequestType.ATTENDANCE_ADJUSTMENT,
          status: ApprovalStatus.PENDING,
          title: { contains: input.workDate },
        },
        select: { id: true },
      });

      if (pendingAdjustment) {
        throw new ConflictException('An attendance adjustment request is already pending for this date');
      }

      // Check if attendance record exists to save original times
      const existingAttendance = await tx.attendanceRecord.findUnique({
        where: {
          organizationId_employeeId_workDate: {
            organizationId,
            employeeId: targetEmployee.id,
            workDate,
          },
        },
        select: { id: true, checkInAt: true, checkOutAt: true, shiftId: true },
      });

      const payload: AttendanceAdjustmentPayload = {
        workDate: input.workDate,
        targetCheckInAt: targetCheckIn.toISOString(),
        targetCheckOutAt: targetCheckOut ? targetCheckOut.toISOString() : null,
        shiftId: input.shiftId ?? existingAttendance?.shiftId ?? null,
        originalCheckInAt: existingAttendance?.checkInAt?.toISOString() ?? null,
        originalCheckOutAt: existingAttendance?.checkOutAt?.toISOString() ?? null,
      };

      const title = `Điều chỉnh chấm công ngày ${input.workDate}`;

      const approval = await tx.approvalRequest.create({
        data: {
          organizationId,
          requesterId: targetEmployee.id,
          type: ApprovalRequestType.ATTENDANCE_ADJUSTMENT,
          status: ApprovalStatus.PENDING,
          title,
          reason: input.reason,
          payload: payload as unknown as Prisma.InputJsonValue,
          referenceId: existingAttendance?.id ?? null,
        },
        select: approvalProjection,
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.APPROVAL_REQUEST_CREATED,
          organizationId,
          actorUserId,
          resourceId: approval.id,
        },
        tx,
      );

      return approval;
    });
  }

  async approve(
    actorUserId: string,
    organizationId: string,
    approvalId: string,
    input: ApproveRequestDto,
  ): Promise<ApprovalRequestResponse> {
    return this.transaction(actorUserId, organizationId, [], async (tx) => {
      const approval = await tx.approvalRequest.findUnique({
        where: { organizationId_id: { organizationId, id: approvalId } },
        include: {
          requester: {
            select: { id: true, userId: true, displayName: true },
          },
        },
      });

      if (!approval) {
        throw new NotFoundException('Approval request not found');
      }

      const actorEmployee = await tx.employee.findUnique({
        where: { organizationId_userId: { organizationId, userId: actorUserId } },
        select: { id: true, userId: true },
      });

      // Strict self-approval block
      if (
        approval.requester.userId === actorUserId ||
        (actorEmployee && approval.requesterId === actorEmployee.id)
      ) {
        throw new ForbiddenException('Self approval is not permitted');
      }

      // Check authorization
      const canApproveGeneric = await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_APPROVE, organizationId, tx);
      const canManage = await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_MANAGE, organizationId, tx);

      if (approval.type === ApprovalRequestType.LEAVE) {
        const canApproveLeave = await this.authorization.can(actorUserId, PERMISSIONS.LEAVE_APPROVE, organizationId, tx);
        if (!canApproveGeneric && !canManage && !canApproveLeave) {
          throw new ForbiddenException();
        }
      } else if (approval.type === ApprovalRequestType.ATTENDANCE_ADJUSTMENT) {
        const canManageAttendance = await this.authorization.can(actorUserId, PERMISSIONS.ATTENDANCE_MANAGE, organizationId, tx);
        if (!canApproveGeneric && !canManage && !canManageAttendance) {
          throw new ForbiddenException();
        }
      } else if (approval.type === ApprovalRequestType.PAYROLL) {
        const canApprovePayroll = await this.authorization.can(actorUserId, PERMISSIONS.PAYROLL_APPROVE, organizationId, tx);
        const canManagePayroll = await this.authorization.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId, tx);
        if (!canApproveGeneric && !canManage && !canApprovePayroll && !canManagePayroll) {
          throw new ForbiddenException();
        }
      } else if (!canApproveGeneric && !canManage) {
        throw new ForbiddenException();
      }

      // State machine validation
      if (approval.status !== ApprovalStatus.PENDING) {
        throw new ConflictException('Only pending approval requests can be approved');
      }

      const now = new Date();

      // Process specific request type
      if (approval.type === ApprovalRequestType.LEAVE) {
        if (!approval.referenceId) {
          throw new BadRequestException('Leave request reference missing');
        }

        const leave = await tx.leaveRequest.findUnique({
          where: { organizationId_id: { organizationId, id: approval.referenceId } },
          include: { employee: true },
        });

        if (!leave) {
          throw new NotFoundException('Referenced leave request not found');
        }

        if (leave.status !== LeaveStatus.PENDING) {
          throw new ConflictException('Referenced leave request is already finalized');
        }

        // Check overlap
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

        let calendarEventId = leave.calendarEventId;
        if (!calendarEventId) {
          const typeLabel = leaveTypeLabel(leave.leaveType);
          const event = await tx.calendarEvent.create({
            data: {
              organizationId,
              createdByUserId: actorUserId,
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

        await tx.leaveRequest.update({
          where: { organizationId_id: { organizationId, id: leave.id } },
          data: {
            status: LeaveStatus.APPROVED,
            reviewerUserId: actorUserId,
            reviewerNote: input.note ?? null,
            reviewedAt: now,
            calendarEventId,
          },
        });

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
            actorUserId,
            resourceId: leave.id,
          },
          tx,
        );
      } else if (approval.type === ApprovalRequestType.ATTENDANCE_ADJUSTMENT) {
        const payload = approval.payload as unknown as AttendanceAdjustmentPayload;
        const [yearStr, monthStr, dayStr] = payload.workDate.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;
        const day = parseInt(dayStr, 10);
        const workDate = new Date(Date.UTC(year, month, day, 0, 0, 0));

        const checkInAt = new Date(payload.targetCheckInAt);
        const checkOutAt = payload.targetCheckOutAt ? new Date(payload.targetCheckOutAt) : null;

        // Resolve shift
        let shiftConfig: {
          id: string;
          startTime: string;
          endTime: string;
          breakStart?: string | null;
          breakEnd?: string | null;
          gracePeriodMinutes: number;
          isOvernight: boolean;
        } | null = null;

        if (payload.shiftId) {
          shiftConfig = await tx.shift.findUnique({
            where: { organizationId_id: { organizationId, id: payload.shiftId } },
            select: {
              id: true,
              startTime: true,
              endTime: true,
              breakStart: true,
              breakEnd: true,
              gracePeriodMinutes: true,
              isOvernight: true,
            },
          });
        }

        if (!shiftConfig) {
          const schedule = await tx.workSchedule.findUnique({
            where: {
              organizationId_employeeId_workDate: {
                organizationId,
                employeeId: approval.requesterId,
                workDate,
              },
            },
            include: { shift: true },
          });
          if (schedule?.shift) {
            shiftConfig = schedule.shift;
          }
        }

        const lateMinutes = calculateLateMinutes(checkInAt, shiftConfig ?? undefined, workDate);
        const earlyLeaveMinutes = checkOutAt ? calculateEarlyLeaveMinutes(checkOutAt, shiftConfig ?? undefined, workDate) : 0;
        const workedMinutes = checkOutAt ? calculateWorkedMinutes(checkInAt, checkOutAt, shiftConfig ?? undefined, workDate) : null;
        const status = lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;

        const existingRecord = await tx.attendanceRecord.findUnique({
          where: {
            organizationId_employeeId_workDate: {
              organizationId,
              employeeId: approval.requesterId,
              workDate,
            },
          },
        });

        let attendanceId = existingRecord?.id;
        const note = input.note ? `[Điều chỉnh duyệt bởi ${actorUserId}]: ${input.note}` : existingRecord?.note;

        if (existingRecord) {
          await tx.attendanceRecord.update({
            where: { id: existingRecord.id },
            data: {
              checkInAt,
              checkOutAt,
              shiftId: shiftConfig?.id ?? existingRecord.shiftId,
              lateMinutes,
              earlyLeaveMinutes,
              workedMinutes,
              status,
              note,
            },
          });
        } else {
          const createdRecord = await tx.attendanceRecord.create({
            data: {
              organizationId,
              employeeId: approval.requesterId,
              workDate,
              checkInAt,
              checkOutAt,
              shiftId: shiftConfig?.id ?? null,
              lateMinutes,
              earlyLeaveMinutes,
              workedMinutes,
              status,
              note: input.note ? `[Điều chỉnh]: ${input.note}` : null,
            },
          });
          attendanceId = createdRecord.id;
        }

        await this.audit.record(
          {
            event: AUDIT_EVENTS.ATTENDANCE_ADJUSTED,
            organizationId,
            actorUserId,
            resourceId: attendanceId,
          },
          tx,
        );
      } else if (approval.type === ApprovalRequestType.PAYROLL) {
        if (!approval.referenceId) {
          throw new BadRequestException('Payroll period reference missing');
        }
        const period = await tx.payrollPeriod.findUnique({
          where: { organizationId_id: { organizationId, id: approval.referenceId } },
        });
        if (!period) {
          throw new NotFoundException('Referenced payroll period not found');
        }
        if (period.status !== 'PENDING_APPROVAL') {
          throw new ConflictException('Referenced payroll period is not pending approval');
        }
        await tx.payrollPeriod.update({
          where: { organizationId_id: { organizationId, id: period.id } },
          data: {
            status: 'APPROVED',
            approvedAt: now,
            approvedById: actorEmployee?.id ?? null,
          },
        });
        await this.audit.record(
          {
            event: AUDIT_EVENTS.PAYROLL_APPROVED,
            organizationId,
            actorUserId,
            resourceId: period.id,
          },
          tx,
        );
      }

      const updated = await tx.approvalRequest.update({
        where: { organizationId_id: { organizationId, id: approvalId } },
        data: {
          status: ApprovalStatus.APPROVED,
          reviewerId: actorEmployee?.id ?? null,
          reviewerNote: input.note ?? null,
          reviewedAt: now,
        },
        select: approvalProjection,
      });

      // Send general approval notification
      await this.notifications.createForRecipient(
        {
          organizationId,
          recipientUserId: approval.requester.userId,
          type: NOTIFICATION_TYPES.APPROVAL_STATUS_CHANGED,
          metadata: {
            approvalRequestId: approval.id,
            status: 'APPROVED',
            title: approval.title,
          },
        },
        tx,
      );

      await this.audit.record(
        {
          event: AUDIT_EVENTS.APPROVAL_REQUEST_APPROVED,
          organizationId,
          actorUserId,
          resourceId: approval.id,
        },
        tx,
      );

      return updated;
    });
  }

  async reject(
    actorUserId: string,
    organizationId: string,
    approvalId: string,
    input: RejectRequestDto,
  ): Promise<ApprovalRequestResponse> {
    return this.transaction(actorUserId, organizationId, [], async (tx) => {
      const approval = await tx.approvalRequest.findUnique({
        where: { organizationId_id: { organizationId, id: approvalId } },
        include: {
          requester: {
            select: { id: true, userId: true, displayName: true },
          },
        },
      });

      if (!approval) {
        throw new NotFoundException('Approval request not found');
      }

      const actorEmployee = await tx.employee.findUnique({
        where: { organizationId_userId: { organizationId, userId: actorUserId } },
        select: { id: true, userId: true },
      });

      // Strict self-review block
      if (
        approval.requester.userId === actorUserId ||
        (actorEmployee && approval.requesterId === actorEmployee.id)
      ) {
        throw new ForbiddenException('Self review is not permitted');
      }

      // Check authorization
      const canRejectGeneric = await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_REJECT, organizationId, tx);
      const canManage = await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_MANAGE, organizationId, tx);

      if (approval.type === ApprovalRequestType.LEAVE) {
        const canApproveLeave = await this.authorization.can(actorUserId, PERMISSIONS.LEAVE_APPROVE, organizationId, tx);
        if (!canRejectGeneric && !canManage && !canApproveLeave) {
          throw new ForbiddenException();
        }
      } else if (approval.type === ApprovalRequestType.ATTENDANCE_ADJUSTMENT) {
        const canManageAttendance = await this.authorization.can(actorUserId, PERMISSIONS.ATTENDANCE_MANAGE, organizationId, tx);
        if (!canRejectGeneric && !canManage && !canManageAttendance) {
          throw new ForbiddenException();
        }
      } else if (approval.type === ApprovalRequestType.PAYROLL) {
        const canApprovePayroll = await this.authorization.can(actorUserId, PERMISSIONS.PAYROLL_APPROVE, organizationId, tx);
        const canManagePayroll = await this.authorization.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId, tx);
        if (!canRejectGeneric && !canManage && !canApprovePayroll && !canManagePayroll) {
          throw new ForbiddenException();
        }
      } else if (!canRejectGeneric && !canManage) {
        throw new ForbiddenException();
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new ConflictException('Only pending approval requests can be rejected');
      }

      const now = new Date();

      if (approval.type === ApprovalRequestType.LEAVE && approval.referenceId) {
        await tx.leaveRequest.updateMany({
          where: { organizationId, id: approval.referenceId, status: LeaveStatus.PENDING },
          data: {
            status: LeaveStatus.REJECTED,
            reviewerUserId: actorUserId,
            reviewerNote: input.reason,
            reviewedAt: now,
          },
        });

        await this.notifications.createForRecipient(
          {
            organizationId,
            recipientUserId: approval.requester.userId,
            type: NOTIFICATION_TYPES.LEAVE_STATUS_CHANGED,
            metadata: {
              leaveRequestId: approval.referenceId,
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
            actorUserId,
            resourceId: approval.referenceId,
          },
          tx,
        );
      } else if (approval.type === ApprovalRequestType.PAYROLL && approval.referenceId) {
        await tx.payrollPeriod.updateMany({
          where: { organizationId, id: approval.referenceId, status: 'PENDING_APPROVAL' },
          data: {
            status: 'CALCULATED',
          },
        });
        await this.audit.record(
          {
            event: AUDIT_EVENTS.PAYROLL_REJECTED,
            organizationId,
            actorUserId,
            resourceId: approval.referenceId,
          },
          tx,
        );
      }

      const updated = await tx.approvalRequest.update({
        where: { organizationId_id: { organizationId, id: approvalId } },
        data: {
          status: ApprovalStatus.REJECTED,
          reviewerId: actorEmployee?.id ?? null,
          reviewerNote: input.reason,
          reviewedAt: now,
        },
        select: approvalProjection,
      });

      await this.notifications.createForRecipient(
        {
          organizationId,
          recipientUserId: approval.requester.userId,
          type: NOTIFICATION_TYPES.APPROVAL_STATUS_CHANGED,
          metadata: {
            approvalRequestId: approval.id,
            status: 'REJECTED',
            title: approval.title,
            reason: input.reason,
          },
        },
        tx,
      );

      await this.audit.record(
        {
          event: AUDIT_EVENTS.APPROVAL_REQUEST_REJECTED,
          organizationId,
          actorUserId,
          resourceId: approval.id,
        },
        tx,
      );

      return updated;
    });
  }

  async cancel(
    actorUserId: string,
    organizationId: string,
    approvalId: string,
    input: CancelRequestDto,
  ): Promise<ApprovalRequestResponse> {
    return this.transaction(actorUserId, organizationId, [], async (tx) => {
      const approval = await tx.approvalRequest.findUnique({
        where: { organizationId_id: { organizationId, id: approvalId } },
        include: {
          requester: {
            select: { id: true, userId: true },
          },
        },
      });

      if (!approval) {
        throw new NotFoundException('Approval request not found');
      }

      const isRequester = approval.requester.userId === actorUserId;
      if (!isRequester) {
        const canManage = await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_MANAGE, organizationId, tx);
        if (!canManage) {
          throw new ForbiddenException('Cannot cancel approval request of another employee');
        }
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new ConflictException('Approval request is already finalized');
      }

      if (approval.type === ApprovalRequestType.LEAVE && approval.referenceId) {
        const leave = await tx.leaveRequest.findUnique({
          where: { organizationId_id: { organizationId, id: approval.referenceId } },
        });
        if (leave && leave.status === LeaveStatus.PENDING) {
          if (leave.calendarEventId) {
            await tx.calendarEvent.update({
              where: { organizationId_id: { organizationId, id: leave.calendarEventId } },
              data: { status: 'CANCELLED' },
            });
          }
          await tx.leaveRequest.update({
            where: { organizationId_id: { organizationId, id: leave.id } },
            data: {
              status: LeaveStatus.CANCELLED,
              reviewerNote: input.reason ? `[Đã hủy]: ${input.reason}` : leave.reviewerNote,
            },
          });
          await this.audit.record(
            {
              event: AUDIT_EVENTS.LEAVE_REQUEST_CANCELLED,
              organizationId,
              actorUserId,
              resourceId: leave.id,
            },
            tx,
          );
        }
      } else if (approval.type === ApprovalRequestType.PAYROLL && approval.referenceId) {
        await tx.payrollPeriod.updateMany({
          where: { organizationId, id: approval.referenceId, status: 'PENDING_APPROVAL' },
          data: {
            status: 'CALCULATED',
          },
        });
      }

      const updated = await tx.approvalRequest.update({
        where: { organizationId_id: { organizationId, id: approvalId } },
        data: {
          status: ApprovalStatus.CANCELLED,
          reviewerNote: input.reason ? `[Đã hủy]: ${input.reason}` : approval.reviewerNote,
        },
        select: approvalProjection,
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.APPROVAL_REQUEST_CANCELLED,
          organizationId,
          actorUserId,
          resourceId: approval.id,
        },
        tx,
      );

      return updated;
    });
  }

  async list(actorUserId: string, organizationId: string, query: ListApprovalsQueryDto) {
    return this.transaction(actorUserId, organizationId, [PERMISSIONS.APPROVAL_READ], async (tx) => {
      // Auto backfill any leave requests that don't have an ApprovalRequest yet
      await this.backfillLeaveRequests(tx, organizationId);

      const canApprove =
        (await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_APPROVE, organizationId, tx)) ||
        (await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_MANAGE, organizationId, tx)) ||
        (await this.authorization.can(actorUserId, PERMISSIONS.LEAVE_APPROVE, organizationId, tx)) ||
        (await this.authorization.can(actorUserId, PERMISSIONS.ATTENDANCE_MANAGE, organizationId, tx));

      const isMine = query.mine === true || !canApprove;

      let requesterFilter: Prisma.ApprovalRequestWhereInput = {};
      if (isMine) {
        requesterFilter = { requester: { userId: actorUserId } };
      } else if (query.requesterId) {
        requesterFilter = { requesterId: query.requesterId };
      }

      let statusFilter: Prisma.ApprovalRequestWhereInput = {};
      if (query.pending === true) {
        statusFilter = { status: ApprovalStatus.PENDING };
      } else if (query.status) {
        statusFilter = { status: query.status };
      }

      const cursor = query.after
        ? await tx.approvalRequest.findFirst({
            where: { organizationId, id: query.after },
            select: { id: true, createdAt: true },
          })
        : null;

      if (query.after && !cursor) {
        throw new BadRequestException('Invalid pagination cursor');
      }

      const rows = await tx.approvalRequest.findMany({
        where: {
          organizationId,
          ...requesterFilter,
          ...statusFilter,
          ...(query.type ? { type: query.type } : {}),
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
        select: approvalProjection,
      });

      const items = rows.slice(0, query.limit);
      return {
        items,
        nextCursor: rows.length > query.limit ? items[items.length - 1].id : null,
      };
    });
  }

  /**
   * Read model for the AI assistant (approval:read). Same scope rule as `list` (callers without an approval grant
   * see only their own requests) but strictly read-only: no leave backfill. PAYROLL requests need payroll:read.
   */
  async pendingForAssistant(actorUserId: string, organizationId: string, query: { type?: ApprovalRequestType; mine?: boolean; limit: number }) {
    return this.transaction(actorUserId, organizationId, [PERMISSIONS.APPROVAL_READ], async (tx) => {
      const canApprove =
        (await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_APPROVE, organizationId, tx)) ||
        (await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_MANAGE, organizationId, tx)) ||
        (await this.authorization.can(actorUserId, PERMISSIONS.LEAVE_APPROVE, organizationId, tx)) ||
        (await this.authorization.can(actorUserId, PERMISSIONS.ATTENDANCE_MANAGE, organizationId, tx));
      const payrollRead = await this.authorization.can(actorUserId, PERMISSIONS.PAYROLL_READ, organizationId, tx);
      const scopeMine = query.mine === true || !canApprove;
      const where: Prisma.ApprovalRequestWhereInput = {
        organizationId, status: ApprovalStatus.PENDING,
        ...(scopeMine ? { requester: { userId: actorUserId } } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(!payrollRead ? { NOT: { type: ApprovalRequestType.PAYROLL } } : {}),
      };
      const [total, groups, items] = await Promise.all([
        tx.approvalRequest.count({ where }),
        tx.approvalRequest.groupBy({ by: ['type'], where, _count: { _all: true } }),
        tx.approvalRequest.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: query.limit,
          select: { id: true, type: true, title: true, createdAt: true,
            requester: { select: { displayName: true, department: { select: { name: true } } } } } }),
      ]);
      return { scope: scopeMine ? 'mine' as const : 'organization' as const, total,
        byType: Object.fromEntries(groups.map((g) => [g.type, g._count._all])), items };
    });
  }

  async getById(actorUserId: string, organizationId: string, approvalId: string): Promise<ApprovalRequestResponse> {
    return this.transaction(actorUserId, organizationId, [PERMISSIONS.APPROVAL_READ], async (tx) => {
      const approval = await tx.approvalRequest.findUnique({
        where: { organizationId_id: { organizationId, id: approvalId } },
        select: approvalProjection,
      });

      if (!approval) {
        throw new NotFoundException('Approval request not found');
      }

      const canApprove =
        (await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_APPROVE, organizationId, tx)) ||
        (await this.authorization.can(actorUserId, PERMISSIONS.APPROVAL_MANAGE, organizationId, tx)) ||
        (await this.authorization.can(actorUserId, PERMISSIONS.LEAVE_APPROVE, organizationId, tx)) ||
        (await this.authorization.can(actorUserId, PERMISSIONS.ATTENDANCE_MANAGE, organizationId, tx));

      if (approval.requester.userId !== actorUserId && !canApprove) {
        throw new ForbiddenException();
      }

      return approval;
    });
  }

  async getSummary(actorUserId: string, organizationId: string) {
    return this.transaction(actorUserId, organizationId, [PERMISSIONS.APPROVAL_READ], async (tx) => {
      await this.backfillLeaveRequests(tx, organizationId);

      const [pendingCount, approvedCount, rejectedCount, myPendingCount] = await Promise.all([
        tx.approvalRequest.count({
          where: { organizationId, status: ApprovalStatus.PENDING },
        }),
        tx.approvalRequest.count({
          where: { organizationId, status: ApprovalStatus.APPROVED },
        }),
        tx.approvalRequest.count({
          where: { organizationId, status: ApprovalStatus.REJECTED },
        }),
        tx.approvalRequest.count({
          where: {
            organizationId,
            status: ApprovalStatus.PENDING,
            requester: { userId: actorUserId },
          },
        }),
      ]);

      return {
        pendingCount,
        approvedCount,
        rejectedCount,
        myPendingCount,
      };
    });
  }

  private async backfillLeaveRequests(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
    const leavesWithoutApproval = await tx.leaveRequest.findMany({
      where: {
        organizationId,
      },
      include: {
        employee: { select: { id: true, displayName: true } },
      },
      take: 50,
    });

    for (const leave of leavesWithoutApproval) {
      const existing = await tx.approvalRequest.findFirst({
        where: {
          organizationId,
          type: ApprovalRequestType.LEAVE,
          referenceId: leave.id,
        },
        select: { id: true },
      });

      if (!existing) {
        const typeLabel = leaveTypeLabel(leave.leaveType);
        const title = `Đơn xin nghỉ phép (${typeLabel}: ${leave.daysCount} ngày)`;
        await tx.approvalRequest.create({
          data: {
            organizationId,
            requesterId: leave.employeeId,
            type: ApprovalRequestType.LEAVE,
            status: leave.status as unknown as ApprovalStatus,
            title,
            reason: leave.reason,
            payload: {
              leaveRequestId: leave.id,
              leaveType: leave.leaveType,
              startsAt: leave.startsAt.toISOString(),
              endsAt: leave.endsAt.toISOString(),
              daysCount: leave.daysCount,
            },
            reviewerNote: leave.reviewerNote,
            reviewedAt: leave.reviewedAt,
            referenceId: leave.id,
            createdAt: leave.createdAt,
          },
        });
      }
    }
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

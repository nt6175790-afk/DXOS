// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { NotificationService } from '../notifications/notification.service';
import { NOTIFICATION_TYPES } from '../notifications/notification-catalog';
import type {
  CreateScheduleDto,
  ListSchedulesDto,
  UpdateScheduleDto,
} from './schedule.dto';

export const scheduleProjection = {
  id: true,
  organizationId: true,
  employeeId: true,
  shiftId: true,
  workDate: true,
  isOff: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  shift: {
    select: {
      id: true,
      name: true,
      code: true,
      startTime: true,
      endTime: true,
      breakStart: true,
      breakEnd: true,
      gracePeriodMinutes: true,
      isOvernight: true,
      isActive: true,
    },
  },
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
} satisfies Prisma.WorkScheduleSelect;

export type WorkScheduleResponse = Prisma.WorkScheduleGetPayload<{ select: typeof scheduleProjection }>;

function parseDateOnly(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0));
}

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async assignSchedule(
    organizationId: string,
    actorUserId: string,
    dto: CreateScheduleDto,
  ): Promise<WorkScheduleResponse[]> {
    const employee = await this.prisma.employee.findUnique({
      where: {
        organizationId_id: {
          organizationId,
          id: dto.employeeId,
        },
      },
    });

    if (!employee || employee.status !== EmployeeStatus.ACTIVE) {
      throw new NotFoundException('Nhân viên không tồn tại hoặc đã bị vô hiệu hóa.');
    }

    if (!dto.isOff) {
      if (!dto.shiftId) {
        throw new BadRequestException('Vui lòng chọn ca làm việc nếu không phải ngày nghỉ (isOff = false).');
      }
      const shift = await this.prisma.shift.findUnique({
        where: {
          organizationId_id: {
            organizationId,
            id: dto.shiftId,
          },
        },
      });
      if (!shift || !shift.isActive) {
        throw new BadRequestException('Ca làm việc không tồn tại hoặc đã bị vô hiệu hóa.');
      }
    }

    const targetDates: Date[] = [];

    if (dto.workDate) {
      targetDates.push(parseDateOnly(dto.workDate));
    } else if (dto.startDate && dto.endDate) {
      const start = parseDateOnly(dto.startDate);
      const end = parseDateOnly(dto.endDate);
      if (start.getTime() > end.getTime()) {
        throw new BadRequestException('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
      }

      const current = new Date(start);
      while (current.getTime() <= end.getTime()) {
        const dayOfWeek = current.getUTCDay();
        if (!dto.daysOfWeek || dto.daysOfWeek.includes(dayOfWeek)) {
          targetDates.push(new Date(current));
        }
        current.setUTCDate(current.getUTCDate() + 1);
      }
    } else {
      throw new BadRequestException('Cần cung cấp workDate hoặc khoảng startDate & endDate.');
    }

    if (targetDates.length === 0) {
      throw new BadRequestException('Không có ngày làm việc nào phù hợp trong khoảng lựa chọn.');
    }

    return this.prisma.$transaction(async (tx) => {
      const results: WorkScheduleResponse[] = [];

      for (const workDate of targetDates) {
        const schedule = await tx.workSchedule.upsert({
          where: {
            organizationId_employeeId_workDate: {
              organizationId,
              employeeId: employee.id,
              workDate,
            },
          },
          update: {
            shiftId: dto.isOff ? null : dto.shiftId,
            isOff: dto.isOff ?? false,
            notes: dto.notes?.trim() || null,
          },
          create: {
            organizationId,
            employeeId: employee.id,
            shiftId: dto.isOff ? null : dto.shiftId,
            workDate,
            isOff: dto.isOff ?? false,
            notes: dto.notes?.trim() || null,
          },
          select: scheduleProjection,
        });

        results.push(schedule);

        await this.audit.record(
          {
            organizationId,
            actorUserId,
            event: AUDIT_EVENTS.SCHEDULE_CREATED,
            resourceId: schedule.id,
          },
          tx,
        );
      }

      // Notify employee about schedule update
      await this.notifications
        .createForRecipient(
          {
            organizationId,
            recipientUserId: employee.userId,
            type: NOTIFICATION_TYPES.SCHEDULE_UPDATED,
            metadata: {
              scheduleId: results[0]?.id,
              message: `Lịch làm việc của bạn đã được cập nhật (${targetDates.length} ngày).`,
            },
          },
          tx,
        )
        .catch(() => {});

      return results;
    });
  }

  async updateSchedule(
    organizationId: string,
    scheduleId: string,
    actorUserId: string,
    dto: UpdateScheduleDto,
  ): Promise<WorkScheduleResponse> {
    const existing = await this.prisma.workSchedule.findUnique({
      where: {
        organizationId_id: {
          organizationId,
          id: scheduleId,
        },
      },
      include: {
        employee: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Lịch làm việc không tồn tại.');
    }

    const isOff = dto.isOff !== undefined ? dto.isOff : existing.isOff;
    let shiftId = dto.shiftId !== undefined ? dto.shiftId : existing.shiftId;

    if (isOff) {
      shiftId = null;
    } else {
      if (!shiftId) {
        throw new BadRequestException('Vui lòng chọn ca làm việc nếu không phải ngày nghỉ.');
      }
      const shift = await this.prisma.shift.findUnique({
        where: {
          organizationId_id: {
            organizationId,
            id: shiftId,
          },
        },
      });
      if (!shift || !shift.isActive) {
        throw new BadRequestException('Ca làm việc không tồn tại hoặc đã bị vô hiệu hóa.');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.workSchedule.update({
        where: {
          organizationId_id: {
            organizationId,
            id: scheduleId,
          },
        },
        data: {
          shiftId,
          isOff,
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        },
        select: scheduleProjection,
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.SCHEDULE_UPDATED,
          resourceId: record.id,
        },
        tx,
      );

      await this.notifications
        .createForRecipient(
          {
            organizationId,
            recipientUserId: existing.employee.userId,
            type: NOTIFICATION_TYPES.SCHEDULE_UPDATED,
            metadata: {
              scheduleId: record.id,
              message: 'Lịch làm việc của bạn đã được cập nhật.',
            },
          },
          tx,
        )
        .catch(() => {});

      return record;
    });

    return updated;
  }

  async deleteSchedule(
    organizationId: string,
    scheduleId: string,
    actorUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.workSchedule.findUnique({
      where: {
        organizationId_id: {
          organizationId,
          id: scheduleId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Lịch làm việc không tồn tại.');
    }

    await this.prisma.workSchedule.delete({
      where: {
        organizationId_id: {
          organizationId,
          id: scheduleId,
        },
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      event: AUDIT_EVENTS.SCHEDULE_CANCELLED,
      resourceId: scheduleId,
    });

    return { success: true, message: 'Đã hủy lịch làm việc thành công.' };
  }

  async getEmployeeSchedule(
    organizationId: string,
    employeeId: string,
    actorUserId: string,
    from?: string,
    to?: string,
  ): Promise<WorkScheduleResponse[]> {
    const callerEmployee = await this.prisma.employee.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actorUserId,
        },
      },
    });

    const hasManage = await this.authz.can(actorUserId, PERMISSIONS.SCHEDULE_MANAGE, organizationId);

    if (!hasManage && (!callerEmployee || callerEmployee.id !== employeeId)) {
      throw new ForbiddenException('Bạn chỉ có thể xem lịch làm việc của chính mình.');
    }

    const where: Prisma.WorkScheduleWhereInput = {
      organizationId,
      employeeId,
    };

    if (from || to) {
      where.workDate = {};
      if (from) {
        where.workDate.gte = parseDateOnly(from);
      }
      if (to) {
        where.workDate.lte = parseDateOnly(to);
      }
    }

    return this.prisma.workSchedule.findMany({
      where,
      orderBy: { workDate: 'asc' },
      select: scheduleProjection,
    });
  }

  async listSchedules(
    organizationId: string,
    actorUserId: string,
    dto: ListSchedulesDto,
  ): Promise<WorkScheduleResponse[]> {
    const callerEmployee = await this.prisma.employee.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actorUserId,
        },
      },
    });

    const hasManage = await this.authz.can(actorUserId, PERMISSIONS.SCHEDULE_MANAGE, organizationId);

    let targetEmployeeId = dto.employeeId;
    if (!hasManage) {
      if (!callerEmployee) {
        return [];
      }
      targetEmployeeId = callerEmployee.id;
    }

    const where: Prisma.WorkScheduleWhereInput = {
      organizationId,
    };

    if (targetEmployeeId) {
      where.employeeId = targetEmployeeId;
    }

    if (dto.shiftId) {
      where.shiftId = dto.shiftId;
    }

    if (dto.departmentId) {
      where.employee = {
        departmentId: dto.departmentId,
      };
    }

    if (dto.from || dto.to) {
      where.workDate = {};
      if (dto.from) {
        where.workDate.gte = parseDateOnly(dto.from);
      }
      if (dto.to) {
        where.workDate.lte = parseDateOnly(dto.to);
      }
    }

    return this.prisma.workSchedule.findMany({
      where,
      orderBy: [{ workDate: 'asc' }, { employee: { displayName: 'asc' } }],
      select: scheduleProjection,
    });
  }
}

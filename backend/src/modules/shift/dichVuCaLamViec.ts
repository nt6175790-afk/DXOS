// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import type { CreateShiftDto, ListShiftsDto, UpdateShiftDto } from './shift.dto';

export const shiftProjection = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  startTime: true,
  endTime: true,
  breakStart: true,
  breakEnd: true,
  gracePeriodMinutes: true,
  isOvernight: true,
  isActive: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShiftSelect;

export type ShiftResponse = Prisma.ShiftGetPayload<{ select: typeof shiftProjection }>;

@Injectable()
export class ShiftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createShift(
    organizationId: string,
    actorUserId: string,
    dto: CreateShiftDto,
  ): Promise<ShiftResponse> {
    const existing = await this.prisma.shift.findUnique({
      where: {
        organizationId_code: {
          organizationId,
          code: dto.code.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Mã ca làm việc "${dto.code}" đã tồn tại trong tổ chức.`);
    }

    const shift = await this.prisma.shift.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        startTime: dto.startTime.trim(),
        endTime: dto.endTime.trim(),
        breakStart: dto.breakStart?.trim() || null,
        breakEnd: dto.breakEnd?.trim() || null,
        gracePeriodMinutes: dto.gracePeriodMinutes ?? 0,
        isOvernight: dto.isOvernight ?? false,
        isActive: dto.isActive ?? true,
        description: dto.description?.trim() || null,
      },
      select: shiftProjection,
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      event: AUDIT_EVENTS.SHIFT_CREATED,
      resourceId: shift.id,
    });

    return shift;
  }

  async updateShift(
    organizationId: string,
    shiftId: string,
    actorUserId: string,
    dto: UpdateShiftDto,
  ): Promise<ShiftResponse> {
    const shift = await this.prisma.shift.findUnique({
      where: {
        organizationId_id: {
          organizationId,
          id: shiftId,
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Ca làm việc không tồn tại.');
    }

    if (dto.code && dto.code.trim().toUpperCase() !== shift.code) {
      const duplicate = await this.prisma.shift.findUnique({
        where: {
          organizationId_code: {
            organizationId,
            code: dto.code.trim().toUpperCase(),
          },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Mã ca làm việc "${dto.code}" đã tồn tại trong tổ chức.`);
      }
    }

    const isDeactivating = dto.isActive === false && shift.isActive === true;

    const updated = await this.prisma.shift.update({
      where: {
        organizationId_id: {
          organizationId,
          id: shiftId,
        },
      },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime.trim() } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime.trim() } : {}),
        ...(dto.breakStart !== undefined ? { breakStart: dto.breakStart?.trim() || null } : {}),
        ...(dto.breakEnd !== undefined ? { breakEnd: dto.breakEnd?.trim() || null } : {}),
        ...(dto.gracePeriodMinutes !== undefined ? { gracePeriodMinutes: dto.gracePeriodMinutes } : {}),
        ...(dto.isOvernight !== undefined ? { isOvernight: dto.isOvernight } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      },
      select: shiftProjection,
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      event: isDeactivating ? AUDIT_EVENTS.SHIFT_DEACTIVATED : AUDIT_EVENTS.SHIFT_UPDATED,
      resourceId: updated.id,
    });

    return updated;
  }

  async deleteShift(
    organizationId: string,
    shiftId: string,
    actorUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const shift = await this.prisma.shift.findUnique({
      where: {
        organizationId_id: {
          organizationId,
          id: shiftId,
        },
      },
      include: {
        _count: {
          select: {
            workSchedules: true,
            attendanceRecords: true,
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Ca làm việc không tồn tại.');
    }

    if (shift._count.workSchedules > 0 || shift._count.attendanceRecords > 0) {
      throw new ConflictException(
        'Ca làm việc đã được sử dụng trong lịch phân ca hoặc dữ liệu chấm công. Vui lòng vô hiệu hóa ca (isActive = false) thay vì xóa.',
      );
    }

    await this.prisma.shift.delete({
      where: {
        organizationId_id: {
          organizationId,
          id: shiftId,
        },
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      event: AUDIT_EVENTS.SHIFT_DEACTIVATED,
      resourceId: shiftId,
    });

    return { success: true, message: 'Đã xóa ca làm việc thành công.' };
  }

  async getShift(organizationId: string, shiftId: string): Promise<ShiftResponse> {
    const shift = await this.prisma.shift.findUnique({
      where: {
        organizationId_id: {
          organizationId,
          id: shiftId,
        },
      },
      select: shiftProjection,
    });

    if (!shift) {
      throw new NotFoundException('Ca làm việc không tồn tại.');
    }

    return shift;
  }

  async listShifts(organizationId: string, dto: ListShiftsDto): Promise<ShiftResponse[]> {
    const where: Prisma.ShiftWhereInput = {
      organizationId,
    };

    if (dto.isActive !== undefined) {
      where.isActive = dto.isActive;
    }

    if (dto.search && dto.search.trim()) {
      const term = dto.search.trim();
      where.OR = [
        { name: { contains: term } },
        { code: { contains: term } },
        { description: { contains: term } },
      ];
    }

    return this.prisma.shift.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: shiftProjection,
    });
  }
}

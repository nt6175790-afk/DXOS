// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { SelfServiceService } from '../../self-service/self-service.service';
import { PeriodArgs, periodSchema, rangeView, resolveRange } from '../agent/period';
import { formatVnDate, formatVnDateTime, formatVnTime } from '../agent/vn-time';
import { objectSchema } from './tool.types';
import type { AiTool, ToolContext, ToolOutcome } from './tool.types';

const PERIOD = { fallback: 'this_week', maxDays: 31 } as const;

export class GetMyScheduleArgs extends PeriodArgs {}

interface ShiftLike { name?: string | null; startTime?: string | null; endTime?: string | null }
const shiftOf = (shift: ShiftLike | null | undefined) => shift ? { name: shift.name ?? null, start: shift.startTime ?? null, end: shift.endTime ?? null } : null;

@Injectable()
export class GetMyScheduleTool implements AiTool<GetMyScheduleArgs> {
  readonly name = 'get_my_schedule';
  readonly description = 'The CURRENT USER\'s own work schedule and attendance (no id needed): today\'s shift and check-in status, next shift, ' +
    'scheduled days, attendance records (late minutes, early leave), own leave requests and a summary (scheduled days, late count, worked hours) ' +
    'for the period (any keyword such as yesterday or last_week, or explicit dates; max 31 days). Use it for any "did I / am I / my …" question.';
  readonly parameters = objectSchema(periodSchema(PERIOD.fallback, PERIOD.maxDays));
  readonly argsType = GetMyScheduleArgs;
  readonly requiredPermissions = [PERMISSIONS.AI_USE];

  constructor(private readonly selfService: SelfServiceService) {}

  async execute(args: GetMyScheduleArgs, context: ToolContext): Promise<ToolOutcome> {
    const range = resolveRange(args, context.now, PERIOD.fallback, PERIOD.maxDays);
    const result = await this.selfService.getMyScheduleOverview(context.organizationId, context.userId, { from: range.fromDate, to: range.toDate });
    if (!result.isEmployee) return { status: 'EMPTY', data: { reason: 'NOT_AN_EMPLOYEE' } };
    const today = result.today;
    const next = result.nextShift;
    return {
      status: 'OK',
      data: {
        visibility: 'ONLY_YOURSELF',
        note: 'Dữ liệu chỉ của chính người hỏi; không có thông tin về người khác.',
        period: rangeView(range),
        // Personal contact data (phone, email) is intentionally not returned.
        me: { name: result.employee?.displayName ?? null, department: result.employee?.department?.name ?? null },
        today: today ? {
          date: today.date, dayOfWeek: today.dayOfWeek, status: today.attendanceStatus, isOff: today.isOff, shift: shiftOf(today.shift),
          checkIn: formatVnTime(today.attendance?.checkInAt), checkOut: formatVnTime(today.attendance?.checkOutAt),
          lateMinutes: today.attendance?.lateMinutes ?? 0, onApprovedLeave: Boolean(today.approvedLeave),
        } : null,
        nextShift: next ? { date: next.date, dayOfWeek: next.dayOfWeek, shift: shiftOf(next.shift) } : null,
        schedule: result.schedules.slice(0, 31).map((s) => ({ date: formatVnDate(s.workDate), isOff: s.isOff, shift: shiftOf(s.shift) })),
        attendance: result.attendanceRecords.slice(0, 31).map((a) => ({
          date: formatVnDate(a.workDate), status: a.status, checkIn: formatVnTime(a.checkInAt), checkOut: formatVnTime(a.checkOutAt),
          lateMinutes: a.lateMinutes, earlyLeaveMinutes: a.earlyLeaveMinutes,
        })),
        myLeaveRequests: result.leaveRequests.slice(0, 20).map((l) => ({
          type: l.leaveType, from: formatVnDateTime(l.startsAt), to: formatVnDateTime(l.endsAt), days: l.daysCount, status: l.status,
        })),
        summary: result.summary,
      },
      citations: [{ type: 'schedule', id: null, label: 'Lịch đi làm của tôi', href: '/my-schedule' }],
    };
  }
}

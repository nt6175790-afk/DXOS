import { Injectable } from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { AttendanceService, type AssistantAttendanceIssue } from '../../attendance/attendance.service';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { dateOnly, PeriodArgs, periodSchema, rangeView, resolveRange, vnToday } from '../agent/period';
import { formatVnDate, formatVnTime } from '../agent/vn-time';
import { departmentName, LimitArg, limitOf, limitSchema, objectSchema } from './tool.types';
import type { AiTool, ToolContext, ToolOutcome } from './tool.types';

const TYPES: AssistantAttendanceIssue[] = ['LATE', 'EARLY_LEAVE', 'INCOMPLETE', 'NOT_CHECKED_IN'];
const PERIOD = { fallback: 'today', maxDays: 31 } as const;

export class ListAttendanceExceptionsArgs extends PeriodArgs {
  @IsOptional() @IsIn(TYPES) type?: AssistantAttendanceIssue;
  @IsOptional() @IsUUID() departmentId?: string;
  @LimitArg() limit?: number;
}

@Injectable()
export class ListAttendanceExceptionsTool implements AiTool<ListAttendanceExceptionsArgs> {
  readonly name = 'list_attendance_exceptions';
  readonly description = 'Attendance problems of the organization in a period (default today, max 31 days): ' +
    'LATE (checked in late), EARLY_LEAVE, INCOMPLETE (no check-out), NOT_CHECKED_IN (scheduled work day with no check-in and no approved leave; ' +
    'for today it may simply mean the shift has not started). Omit `type` to get all. `total` and `byType` are exact counts.';
  readonly parameters = objectSchema({
    ...periodSchema(PERIOD.fallback, PERIOD.maxDays),
    type: { type: 'string', enum: TYPES },
    departmentId: { type: 'string', format: 'uuid' },
    limit: limitSchema(10, 20),
  });
  readonly argsType = ListAttendanceExceptionsArgs;
  readonly requiredPermissions = [PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.ATTENDANCE_MANAGE];

  constructor(private readonly attendance: AttendanceService) {}

  async execute(args: ListAttendanceExceptionsArgs, context: ToolContext): Promise<ToolOutcome> {
    const range = resolveRange(args, context.now, PERIOD.fallback, PERIOD.maxDays);
    const today = vnToday(context.now);
    const result = await this.attendance.exceptionsForAssistant(context.organizationId, context.userId, {
      fromDay: dateOnly(range.fromDate), toDay: dateOnly(range.toDate), today, types: args.type ? [args.type] : TYPES,
      departmentId: args.departmentId, limit: limitOf(args.limit, 10, 20),
    });
    const base = { range: rangeView(range), today: formatVnDate(today), total: result.total, byType: result.byType };
    if (!result.total) return { status: 'EMPTY', data: { ...base, items: [] } };
    const items = result.items.map((r) => ({
      employee: r.employeeName, department: departmentName(context, r.departmentName), date: formatVnDate(r.workDate), issues: r.issues,
      ...(r.lateMinutes ? { lateMinutes: r.lateMinutes } : {}), ...(r.earlyLeaveMinutes ? { earlyLeaveMinutes: r.earlyLeaveMinutes } : {}),
      checkIn: formatVnTime(r.checkInAt), checkOut: formatVnTime(r.checkOutAt),
    }));
    return { status: 'OK', data: { ...base, truncated: result.total > items.length, items },
      citations: [{ type: 'attendance', id: null, label: 'Chấm công', href: '/attendance' }] };
  }
}

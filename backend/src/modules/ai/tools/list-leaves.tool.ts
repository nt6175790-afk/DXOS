// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { LeaveStatus, LeaveType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { LeaveService } from '../../leave/leave.service';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { PeriodArgs, periodSchema, rangeView, resolveRange } from '../agent/period';
import { formatVnDateTime } from '../agent/vn-time';
import { departmentName, LimitArg, limitOf, limitSchema, objectSchema } from './tool.types';
import type { AiCitation, AiTool, ToolContext, ToolOutcome } from './tool.types';

const STATUSES = ['ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
const PERIOD = { fallback: 'this_week', maxDays: 92 } as const;

export class ListLeavesArgs extends PeriodArgs {
  /** Not named `status` so it cannot be confused with the result's status field. */
  @IsOptional() @IsIn(STATUSES) leaveStatus?: (typeof STATUSES)[number];
  @IsOptional() @IsEnum(LeaveType) type?: LeaveType;
  @IsOptional() @IsUUID() departmentId?: string;
  @LimitArg() limit?: number;
}

@Injectable()
export class ListLeavesTool implements AiTool<ListLeavesArgs> {
  readonly name = 'list_leaves';
  readonly description = 'Leave requests overlapping a period (default this_week, max 92 days): who is off, leave type, dates (Vietnam time), days, status. ' +
    'leaveStatus: PENDING = waiting for approval, APPROVED, REJECTED, CANCELLED, or ACTIVE = PENDING + APPROVED (default). ' +
    'Users without leave approval rights only see their own requests (scope=mine, see note). ' +
    'Reasons are never returned. `total` is the exact count.';
  readonly parameters = objectSchema({
    ...periodSchema(PERIOD.fallback, PERIOD.maxDays),
    leaveStatus: { type: 'string', enum: [...STATUSES] },
    type: { type: 'string', enum: Object.values(LeaveType) },
    departmentId: { type: 'string', format: 'uuid' },
    limit: limitSchema(10, 20),
  });
  readonly argsType = ListLeavesArgs;
  readonly requiredPermissions = [PERMISSIONS.LEAVE_READ];

  constructor(private readonly leaves: LeaveService) {}

  async execute(args: ListLeavesArgs, context: ToolContext): Promise<ToolOutcome> {
    const range = resolveRange(args, context.now, PERIOD.fallback, PERIOD.maxDays);
    const status = args.leaveStatus ?? 'ACTIVE';
    const statuses = status === 'ACTIVE' ? [LeaveStatus.PENDING, LeaveStatus.APPROVED] : [status as LeaveStatus];
    const result = await this.leaves.listForAssistant(context.userId, context.organizationId, {
      startUtc: range.startUtc, endUtc: range.endUtc, statuses, type: args.type, departmentId: args.departmentId,
      limit: limitOf(args.limit, 10, 20),
    });
    const base = { range: rangeView(range), statusFilter: status, scope: result.scope, total: result.total,
      ...(result.scope === 'mine' ? { visibility: 'ONLY_OWN_REQUESTS', note: 'Người hỏi không có quyền duyệt nghỉ phép nên kết quả chỉ gồm đơn của chính họ; dữ liệu này không cho biết người khác có nghỉ hay không.' } : {}) };
    if (!result.total) return { status: 'EMPTY', data: { ...base, items: [] } };
    const items = result.items.map((l) => ({
      id: l.id, employee: l.employee.displayName, department: departmentName(context, l.employee.department?.name),
      type: l.leaveType, from: formatVnDateTime(l.startsAt), to: formatVnDateTime(l.endsAt), days: l.daysCount, status: l.status,
    }));
    const citations: AiCitation[] = items.map((l) => ({ type: 'leave', id: l.id, label: `Nghỉ phép: ${l.employee}`.slice(0, 120), href: '/leave' }));
    return { status: 'OK', data: { ...base, truncated: result.total > items.length, items }, citations };
  }
}

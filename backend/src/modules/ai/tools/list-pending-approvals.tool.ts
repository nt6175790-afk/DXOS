import { Injectable } from '@nestjs/common';
import { ApprovalRequestType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApprovalService } from '../../approval/approval.service';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { elapsed, formatVnDateTime } from '../agent/vn-time';
import { clip, departmentName, LimitArg, limitOf, limitSchema, objectSchema } from './tool.types';
import type { AiCitation, AiTool, ToolContext, ToolOutcome } from './tool.types';

export class ListPendingApprovalsArgs {
  @IsOptional() @IsEnum(ApprovalRequestType) type?: ApprovalRequestType;
  @IsOptional() @IsBoolean() mine?: boolean;
  @LimitArg() limit?: number;
}

@Injectable()
export class ListPendingApprovalsTool implements AiTool<ListPendingApprovalsArgs> {
  readonly name = 'list_pending_approvals';
  readonly description = 'Approval requests still PENDING (leave, attendance adjustment, payroll), oldest first, with how many days they have waited. ' +
    'Approvers see the whole organization; other users only see their own requests (scope tells which). ' +
    'mine=true: only requests the current user submitted. `total` and `byType` are exact counts.';
  readonly parameters = objectSchema({
    type: { type: 'string', enum: Object.values(ApprovalRequestType) },
    mine: { type: 'boolean' },
    limit: limitSchema(10, 20),
  });
  readonly argsType = ListPendingApprovalsArgs;
  readonly requiredPermissions = [PERMISSIONS.APPROVAL_READ];

  constructor(private readonly approvals: ApprovalService) {}

  async execute(args: ListPendingApprovalsArgs, context: ToolContext): Promise<ToolOutcome> {
    const result = await this.approvals.pendingForAssistant(context.userId, context.organizationId,
      { type: args.type, mine: args.mine, limit: limitOf(args.limit, 10, 20) });
    const base = { scope: result.scope, total: result.total, byType: result.byType,
      ...(result.scope === 'mine' ? { visibility: 'ONLY_OWN_REQUESTS', note: 'Người hỏi không có quyền duyệt nên kết quả chỉ gồm đơn do chính họ gửi; dữ liệu này không cho biết đơn của người khác.' } : {}) };
    if (!result.total) return { status: 'EMPTY', data: { ...base, items: [] } };
    const items = result.items.map((row) => ({
      id: row.id,
      type: row.type,
      title: clip(row.title, 160),
      requester: row.requester.displayName,
      department: departmentName(context, row.requester.department?.name),
      submitted: formatVnDateTime(row.createdAt),
      ...elapsed('waiting', context.now.getTime() - row.createdAt.getTime(), 0),
    }));
    const citations: AiCitation[] = items.map((item) => ({ type: 'approval', id: item.id, label: item.title.slice(0, 120), href: '/approvals' }));
    return { status: 'OK', data: { ...base, truncated: result.total > items.length, items }, citations };
  }
}

import { Injectable } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ComplianceService } from '../../documents/compliance.service';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { vnToday } from '../agent/period';
import { DAY_MS, formatVnDate } from '../agent/vn-time';
import { clip, departmentName, LimitArg, limitOf, limitSchema, objectSchema } from './tool.types';
import type { AiCitation, AiTool, ToolContext, ToolOutcome } from './tool.types';

const KINDS = ['expiring', 'expired', 'missing'] as const;

export class ListDocumentAlertsArgs {
  @IsIn(KINDS) kind!: (typeof KINDS)[number];
  /** Only for kind=expiring (clamped to 1–180, default 30). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3660) withinDays?: number;
  @IsOptional() @IsUUID() departmentId?: string;
  @LimitArg() limit?: number;
}

@Injectable()
export class ListDocumentAlertsTool implements AiTool<ListDocumentAlertsArgs> {
  readonly name = 'list_document_alerts';
  readonly description = 'Employee document compliance. kind=expiring: documents expiring within `withinDays` (default 30); ' +
    'kind=expired: documents already past their expiry date; kind=missing: active employees lacking a required document. ' +
    'Sensitive documents the user may not see are only counted in hiddenSensitiveCount. Use `total` for counts.';
  readonly parameters = objectSchema({
    kind: { type: 'string', enum: [...KINDS] },
    withinDays: { type: 'integer', minimum: 1, maximum: 180, description: 'Only for kind=expiring. Default 30.' },
    departmentId: { type: 'string', format: 'uuid' },
    limit: limitSchema(10, 20),
  }, ['kind']);
  readonly argsType = ListDocumentAlertsArgs;
  readonly requiredPermissions = [PERMISSIONS.DOCUMENT_READ];

  constructor(private readonly compliance: ComplianceService) {}

  async execute(args: ListDocumentAlertsArgs, context: ToolContext): Promise<ToolOutcome> {
    const today = vnToday(context.now);
    const limit = limitOf(args.limit, 10, 20);
    if (args.kind === 'missing') {
      const result = await this.compliance.missingDocumentsForAssistant(context.userId, context.organizationId,
        { today, departmentId: args.departmentId, limit });
      const base = { kind: args.kind, today: formatVnDate(today), total: result.total };
      if (!result.total) return { status: 'EMPTY', data: { ...base, items: [] } };
      const items = result.items.map((m) => ({ employee: m.employeeName, department: departmentName(context, m.departmentName),
        requirement: m.requirementName, category: m.category }));
      return { status: 'OK', data: { ...base, employeesAffected: result.employeesAffected, truncated: result.total > items.length, items },
        citations: [{ type: 'document', id: null, label: 'Hồ sơ & tuân thủ', href: '/documents' }] };
    }
    const withinDays = Math.min(Math.max(args.withinDays ?? 30, 1), 180);
    const result = await this.compliance.expiryAlertsForAssistant(context.userId, context.organizationId,
      { kind: args.kind, today, withinDays, departmentId: args.departmentId, limit });
    const items = result.documents.map((d) => {
      const days = d.expiryDate ? Math.round((d.expiryDate.getTime() - today.getTime()) / DAY_MS) : null;
      return {
        id: d.id, title: clip(d.title, 160), category: d.category, employee: d.employee.displayName,
        department: departmentName(context, d.employee.department?.name),
        expiryDate: d.expiryDate ? formatVnDate(d.expiryDate) : null,
        ...(days !== null && days >= 0 ? { daysRemaining: days } : {}),
        ...(days !== null && days < 0 ? { daysExpired: -days } : {}),
      };
    });
    const data = { kind: args.kind, today: formatVnDate(today), ...(args.kind === 'expiring' ? { withinDays } : {}), total: result.total,
      hiddenSensitiveCount: result.hiddenSensitiveCount, truncated: result.total > items.length, items };
    if (!result.total && !result.hiddenSensitiveCount) return { status: 'EMPTY', data };
    const citations: AiCitation[] = items.map((d) => ({ type: 'document', id: d.id, label: d.title.slice(0, 120), href: '/documents' }));
    return { status: 'OK', data, citations };
  }
}

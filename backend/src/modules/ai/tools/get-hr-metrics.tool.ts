import { Injectable } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PERMISSIONS, type PermissionKey } from '../../rbac/permission-catalog';
import type { ReportQueryDto } from '../../reports/reports.dto';
import { ReportsService } from '../../reports/reports.service';
import { PeriodArgs, periodSchema, previousRange, rangeView, resolveRange } from '../agent/period';
import type { DateRange } from '../agent/period';
import { objectSchema, ToolDeniedError } from './tool.types';
import type { AiTool, ToolContext, ToolOutcome } from './tool.types';

const KINDS = ['workforce', 'attendance', 'leave', 'payroll', 'departments', 'performance'] as const;
type Kind = (typeof KINDS)[number];
const PERIOD = { fallback: 'this_month', maxDays: 366 } as const;

/**
 * Same grants as the Reports screen (reports/dichVuBaoCao.ts, performance-analytics.provider.ts), so a denial
 * names the permission that is actually missing.
 */
const GRANTS: Record<Kind, readonly PermissionKey[]> = {
  workforce: [PERMISSIONS.EMPLOYEE_READ],
  attendance: [PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.ATTENDANCE_MANAGE],
  leave: [PERMISSIONS.LEAVE_READ, PERMISSIONS.LEAVE_APPROVE],
  payroll: [PERMISSIONS.PAYROLL_READ],
  departments: [PERMISSIONS.DEPARTMENT_READ, PERMISSIONS.EMPLOYEE_READ],
  performance: [PERMISSIONS.PERFORMANCE_READ, PERMISSIONS.PERFORMANCE_MANAGE],
};

export class GetHrMetricsArgs extends PeriodArgs {
  @IsIn(KINDS) kind!: Kind;
  @IsOptional() @IsBoolean() compareWithPrevious?: boolean;
}

type Report = Record<string, unknown> | null;

/** Keep aggregate numbers only; drop per-day trend series and cursors to save context. */
function compact(kind: Kind, report: Report): Record<string, unknown> | null {
  if (!report) return null;
  if (kind === 'departments') {
    const items = (report.items as Record<string, unknown>[] | undefined) ?? [];
    const withoutId = (item: Record<string, unknown>) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'id'));
    return { departments: items.slice(0, 10).map(withoutId), moreDepartments: Boolean(report.nextCursor) };
  }
  if (kind === 'payroll') return Object.fromEntries(Object.entries(report).filter(([key]) => key !== 'trend'));
  if (kind === 'performance') return report;
  return { metrics: report.metrics ?? null };
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Change of each numeric metric present in both periods, so the model never computes it (or a ratio against 0) itself. */
function changes(current: Record<string, unknown> | null, previous: Record<string, unknown> | null) {
  const now = current?.metrics as Record<string, unknown> | null | undefined;
  const before = previous?.metrics as Record<string, unknown> | null | undefined;
  if (!now || !before) return null;
  const result: Record<string, { absolute: number; percent: number | null }> = {};
  for (const [key, value] of Object.entries(now)) {
    const old = before[key];
    if (typeof value !== 'number' || typeof old !== 'number') continue;
    result[key] = { absolute: round(value - old, 2), percent: old === 0 ? null : round(((value - old) / old) * 100, 1) };
  }
  return result;
}

@Injectable()
export class GetHrMetricsTool implements AiTool<GetHrMetricsArgs> {
  readonly name = 'get_hr_metrics';
  readonly description = 'Exact aggregate HR numbers computed in SQL for a period (no individual records). ' +
    'kind=workforce: employee counts. attendance: present/late/absent/incomplete/early-leave counts, worked minutes, planned days. ' +
    'leave: request counts by status and approved days. payroll: totals per currency (finalized periods). ' +
    'departments: the same counters per department (max 10). performance: review completion and ratings. ' +
    'compareWithPrevious=true also returns the previous period (previous calendar month/quarter/year for those keywords) and `change`: ' +
    'the absolute difference and percent change of each metric (percent is null when the previous value is 0; then report only the absolute difference). ' +
    'Use calculate for other rates.';
  readonly parameters = objectSchema({
    kind: { type: 'string', enum: [...KINDS] },
    ...periodSchema(PERIOD.fallback, PERIOD.maxDays),
    compareWithPrevious: { type: 'boolean' },
  }, ['kind']);
  readonly argsType = GetHrMetricsArgs;
  readonly requiredPermissions = [PERMISSIONS.REPORT_READ];

  constructor(private readonly reports: ReportsService) {}

  async execute(args: GetHrMetricsArgs, context: ToolContext): Promise<ToolOutcome> {
    const missing = GRANTS[args.kind].find((p) => !context.permissions.has(p));
    if (missing) throw new ToolDeniedError(missing);
    const current = resolveRange(args, context.now, PERIOD.fallback, PERIOD.maxDays);
    const load = (range: DateRange) => this.reports.get(context.userId, context.organizationId, {
      dateFrom: range.fromDate, dateTo: range.toDate, interval: 'month', limit: 10, payrollStatus: 'FINALIZED',
    } as ReportQueryDto, args.kind) as Promise<Report>;
    const keyword = args.fromDate || args.toDate ? undefined : args.period ?? PERIOD.fallback;
    const previous = args.compareWithPrevious && args.kind !== 'departments' ? previousRange(current, PERIOD.maxDays, keyword) : null;
    // Each load is its own read transaction, so the two periods can run in parallel.
    const [currentReport, previousReport] = await Promise.all([load(current), previous ? load(previous) : null]);
    const data: Record<string, unknown> = {
      kind: args.kind, range: rangeView(current), current: compact(args.kind, currentReport),
    };
    if (previous) {
      data.previousRange = rangeView(previous);
      data.previous = compact(args.kind, previousReport);
      const change = changes(data.current as Record<string, unknown> | null, data.previous as Record<string, unknown> | null);
      if (change) data.change = change;
    }
    return { status: 'OK', data, citations: [{ type: 'metric', id: null, label: 'Báo cáo & phân tích', href: '/reports' }] };
  }
}

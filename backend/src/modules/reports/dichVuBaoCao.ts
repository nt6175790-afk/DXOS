// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS as P, type PermissionKey } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { AnalyticsRepository, type ScopedReportQuery } from './analytics.repository';
import { PerformanceAnalyticsProvider } from './performance-analytics.provider';
import { makeCsv, reportRange } from './report-calculations';
import type { ReportQueryDto } from './reports.dto';
import { REPORT_KINDS, type Counters, type DepartmentReport, type NumericReport, type PayrollReport, type ReportKind } from './reports.types';

const grants: Record<ReportKind, readonly PermissionKey[]> = {
  workforce: [P.EMPLOYEE_READ], attendance: [P.ATTENDANCE_READ, P.ATTENDANCE_MANAGE],
  leave: [P.LEAVE_READ, P.LEAVE_APPROVE], payroll: [P.PAYROLL_READ], departments: [P.DEPARTMENT_READ, P.EMPLOYEE_READ],
};
const allowed = (permissions: readonly PermissionKey[], kind: ReportKind) => grants[kind].every((p) => permissions.includes(p));
@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService, private readonly authorization: AuthorizationService,
    private readonly analytics: AnalyticsRepository, private readonly performance: PerformanceAnalyticsProvider, private readonly audit: AuditService) {}

  async get(actor: string, org: string, q: ReportQueryDto, kind = 'overview', exporting = false) {
    if (!['overview', 'performance', ...REPORT_KINDS].includes(kind) || (exporting && !REPORT_KINDS.includes(kind as ReportKind))) throw new NotFoundException();
    reportRange(q);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(async (tx) => {
          const permissions = await this.authorization.effectivePermissions(actor, org, tx);
          if (!permissions?.includes(P.REPORT_READ) || (exporting && !permissions.includes(P.REPORT_EXPORT))) throw new ForbiddenException();
          if (REPORT_KINDS.includes(kind as ReportKind) && !allowed(permissions, kind as ReportKind)) throw new ForbiddenException();
          await this.scope(tx, org, q, permissions);
          const section = async (name: ReportKind) => {
            if (!allowed(permissions, name)) return null;
            if (name === 'departments') return this.departments(tx, org, q, permissions, exporting);
            if (name === 'payroll') return this.analytics.payroll(tx, org, q);
            const result = await this.analytics.numeric(tx, org, q, name);
            if (name === 'attendance') Object.assign(result.metrics, permissions.includes(P.SCHEDULE_READ) ? await this.analytics.schedules(tx, org, q) : { plannedDays: null, offDays: null, attendedPlannedDays: null, attendanceRate: null });
            return result;
          };
          if (kind === 'performance') return this.performance.get(tx, org, q, permissions);
          if (kind === 'overview') return {
            organizationId: org, generatedAt: new Date().toISOString(), timezone: 'Asia/Ho_Chi_Minh', filters: q,
            workforce: await section('workforce'), attendance: await section('attendance'), leave: await section('leave'),
            payroll: await section('payroll'), departments: await section('departments'), performance: await this.performance.get(tx, org, q, permissions),
          };
          const data = await section(kind as ReportKind);
          if (!exporting) return data;
          const csv = this.exportCsv(kind as ReportKind, data as NumericReport | PayrollReport | DepartmentReport);
          await this.audit.record({ event: AUDIT_EVENTS.REPORT_EXPORTED, organizationId: org, actorUserId: actor, resourceId: org }, tx);
          return csv;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
  private async scope(tx: Prisma.TransactionClient, org: string, q: ReportQueryDto, permissions: readonly PermissionKey[]) {
    if ((q.departmentId || q.after) && !permissions.includes(P.DEPARTMENT_READ)) throw new ForbiddenException();
    if (q.employeeId && !permissions.includes(P.EMPLOYEE_READ)) throw new ForbiddenException();
    for (const id of [q.departmentId, q.after]) if (id && !await tx.department.findFirst({ where: { id, organizationId: org }, select: { id: true } })) throw new NotFoundException();
    if (q.employeeId && !await tx.employee.findFirst({ where: { id: q.employeeId, organizationId: org }, select: { id: true } })) throw new NotFoundException();
  }
  private async departments(tx: Prisma.TransactionClient, org: string, q: ReportQueryDto, permissions: readonly PermissionKey[], exporting: boolean): Promise<DepartmentReport> {
    const limit = exporting ? 1000 : q.limit;
    const rows = await tx.department.findMany({ where: { organizationId: org, ...(q.departmentId ? { id: q.departmentId } : {}), ...(!exporting && q.after ? { AND: { id: { gt: q.after } } } : {}) }, orderBy: { id: 'asc' }, take: limit + 1, select: { id: true, name: true, status: true } });
    if (exporting && rows.length > limit) throw new BadRequestException('Department export exceeds 1000 rows. Narrow the filter.');
    const visible = rows.slice(0, limit), scoped: ScopedReportQuery = { ...q, departmentIds: visible.map((r) => r.id) };
    if (!visible.length) return { items: [], nextCursor: null };
    const workforce = await this.analytics.workforce(tx, org, scoped, 'department');
    const attendance = allowed(permissions, 'attendance') ? await this.analytics.attendance(tx, org, scoped, 'department') : null;
    const leave = allowed(permissions, 'leave') ? await this.analytics.leave(tx, org, scoped, 'department') : null;
    const payroll = allowed(permissions, 'payroll') ? await this.analytics.payrollRows(tx, org, scoped, 'department') : null;
    return { items: visible.map((r) => ({ ...r,
      workforce: workforce.find((g) => g.bucket === r.id) ? this.analytics.counters(workforce.find((g) => g.bucket === r.id)) : { total: 0, active: 0, inactive: 0, newEmployeeRecords: 0, unassigned: 0 },
      attendance: attendance ? this.analytics.attendanceCounters(attendance.find((g) => g.bucket === r.id)) : null,
      leave: leave ? this.analytics.counters(leave.find((g) => g.bucket === r.id) ?? { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0, days: 0, approvedDays: 0 }) : null,
      payroll: payroll ? this.analytics.moneyGroups(payroll.filter((g) => g.bucket === r.id)) : null,
    })), nextCursor: rows.length > limit ? visible[visible.length - 1].id : null };
  }
  private exportCsv(kind: ReportKind, data: NumericReport | PayrollReport | DepartmentReport) {
    const rows: unknown[][] = [];
    const counters = (section: string, values: Counters | Record<string, string | number | null>, date = '', id = '', name = '', currency = '') => {
      for (const [metric, value] of Object.entries(values)) rows.push([section, date, id, name, currency, metric, value]);
    };
    if (kind === 'departments') for (const item of (data as DepartmentReport).items) {
      counters('workforce', item.workforce, '', item.id, item.name);
      if (item.attendance) counters('attendance', item.attendance, '', item.id, item.name);
      if (item.leave) counters('leave', item.leave, '', item.id, item.name);
      for (const { currency, ...metrics } of item.payroll ?? []) counters('payroll', metrics, '', item.id, item.name, currency);
    } else if (kind === 'payroll') {
      const payroll = data as PayrollReport;
      counters(kind, { periods: payroll.periods, records: payroll.records, employees: payroll.employees });
      for (const { currency, ...metrics } of payroll.currencies) counters(kind, metrics, '', '', '', currency);
      for (const point of payroll.trend) for (const { currency, ...metrics } of point.currencies) counters(kind, metrics, point.bucket, '', '', currency);
    } else {
      const numeric = data as NumericReport; counters(kind, numeric.metrics);
      for (const point of numeric.trend) counters(kind, point.metrics, point.bucket);
    }
    return makeCsv(rows);
  }
}

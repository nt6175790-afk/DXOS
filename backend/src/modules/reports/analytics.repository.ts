// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReportQueryDto } from './reports.dto';
import { bucket, money, rate, reportRange, trend } from './report-calculations';
import type { Counters, MoneyGroup, NumericReport, PayrollReport } from './reports.types';

type DbNumber = bigint | number | Prisma.Decimal | null;
type Row = Record<string, DbNumber | string>;
type Grouping = 'total' | 'date' | 'department';
const n = (v: Row[string] | undefined) => Number(v ?? 0);
export type ScopedReportQuery = ReportQueryDto & { departmentIds?: string[] };
export function employeeScope(org: string, q: ScopedReportQuery) {
  return Prisma.sql`e.organization_id = ${org}
    ${q.employeeId ? Prisma.sql`AND e.id = ${q.employeeId}` : Prisma.empty}
    ${q.departmentId ? Prisma.sql`AND e.department_id = ${q.departmentId}` : Prisma.empty}
    ${q.employeeStatus ? Prisma.sql`AND e.status = ${q.employeeStatus}` : Prisma.empty}
    ${q.departmentIds ? (q.departmentIds.length ? Prisma.sql`AND e.department_id IN (${Prisma.join(q.departmentIds)})` : Prisma.sql`AND 1=0`) : Prisma.empty}`;
}
function grouping(mode: Grouping, date: Prisma.Sql) {
  const expression = mode === 'date' ? date : mode === 'department' ? Prisma.sql`e.department_id` : Prisma.sql`'total'`;
  return { select: Prisma.sql`${expression} AS bucket`, suffix: mode === 'total' ? Prisma.empty : Prisma.sql`GROUP BY ${expression} ORDER BY bucket ASC` };
}
@Injectable()
export class AnalyticsRepository {
  async workforce(tx: Prisma.TransactionClient, org: string, q: ReportQueryDto, mode: Grouping = 'total'): Promise<Row[]> {
    const { utcStart, utcEnd } = reportRange(q);
    const g = grouping(mode, Prisma.sql`DATE_FORMAT(DATE_ADD(e.created_at, INTERVAL 7 HOUR), '%Y-%m-%d')`);
    return tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${g.select}, COUNT(*) AS total,
      COALESCE(SUM(e.status = 'ACTIVE'), 0) AS active, COALESCE(SUM(e.status = 'INACTIVE'), 0) AS inactive,
      COALESCE(SUM(e.department_id IS NULL), 0) AS unassigned,
      COALESCE(SUM(e.created_at >= ${utcStart} AND e.created_at < ${utcEnd}), 0) AS newEmployeeRecords
      FROM employees e WHERE ${employeeScope(org, q)}
      ${mode === 'date' ? Prisma.sql`AND e.created_at >= ${utcStart} AND e.created_at < ${utcEnd}` : Prisma.empty} ${g.suffix}`);
  }
  async attendance(tx: Prisma.TransactionClient, org: string, q: ReportQueryDto, mode: Grouping = 'total'): Promise<Row[]> {
    const { start, end } = reportRange(q); const g = grouping(mode, Prisma.sql`DATE_FORMAT(a.work_date, '%Y-%m-%d')`);
    return tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${g.select}, COUNT(*) AS total,
      COALESCE(SUM(a.status IN ('PRESENT','LATE','INCOMPLETE')),0) AS present,
      COALESCE(SUM(a.status = 'ABSENT'),0) AS absent, COALESCE(SUM(a.status = 'ON_LEAVE'),0) AS onLeave,
      COALESCE(SUM(a.status = 'INCOMPLETE'),0) AS incomplete,
      COALESCE(SUM(a.status = 'LATE' OR a.late_minutes > 0),0) AS late,
      COALESCE(SUM(a.status IN ('PRESENT','LATE','INCOMPLETE') AND (a.status = 'LATE' OR a.late_minutes > 0)),0) AS latePresent,
      COALESCE(SUM(a.early_leave_minutes > 0),0) AS earlyLeave,
      COALESCE(SUM(CASE WHEN a.check_out_at IS NOT NULL THEN a.worked_minutes ELSE 0 END),0) AS workedMinutes,
      COALESCE(SUM(a.check_out_at IS NOT NULL AND a.worked_minutes IS NOT NULL),0) AS completedRecords
      FROM attendance_records a JOIN employees e ON e.id = a.employee_id AND e.organization_id = a.organization_id
      WHERE a.organization_id = ${org} AND ${employeeScope(org, q)} AND a.work_date >= ${start} AND a.work_date <= ${end}
      ${q.attendanceStatus ? Prisma.sql`AND a.status = ${q.attendanceStatus}` : Prisma.empty} ${g.suffix}`);
  }
  async schedules(tx: Prisma.TransactionClient, org: string, q: ReportQueryDto): Promise<Counters> {
    const { start, end } = reportRange(q);
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT COALESCE(SUM(s.is_off = false AND s.shift_id IS NOT NULL),0) AS plannedDays,
      COALESCE(SUM(s.is_off = true),0) AS offDays,
      COALESCE(SUM(s.is_off = false AND s.shift_id IS NOT NULL AND a.status IN ('PRESENT','LATE','INCOMPLETE')),0) AS attendedPlannedDays
      FROM work_schedules s JOIN employees e ON e.id = s.employee_id AND e.organization_id = s.organization_id
      LEFT JOIN attendance_records a ON a.organization_id = s.organization_id AND a.employee_id = s.employee_id AND a.work_date = s.work_date
      ${q.attendanceStatus ? Prisma.sql`AND a.status = ${q.attendanceStatus}` : Prisma.empty}
      WHERE s.organization_id = ${org} AND ${employeeScope(org, q)} AND s.work_date >= ${start} AND s.work_date <= ${end}`);
    const metrics = this.counters(rows[0]); return { ...metrics, attendanceRate: rate(metrics.attendedPlannedDays ?? 0, metrics.plannedDays ?? 0) };
  }
  async leave(tx: Prisma.TransactionClient, org: string, q: ReportQueryDto, mode: Grouping = 'total'): Promise<Row[]> {
    const { utcStart, utcEnd } = reportRange(q); const g = grouping(mode, Prisma.sql`DATE_FORMAT(DATE_ADD(l.starts_at, INTERVAL 7 HOUR), '%Y-%m-%d')`);
    return tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${g.select}, COUNT(*) AS total,
      COALESCE(SUM(l.status = 'PENDING'),0) AS pending, COALESCE(SUM(l.status = 'APPROVED'),0) AS approved,
      COALESCE(SUM(l.status = 'REJECTED'),0) AS rejected, COALESCE(SUM(l.status = 'CANCELLED'),0) AS cancelled,
      COALESCE(SUM(l.days_count),0) AS days, COALESCE(SUM(CASE WHEN l.status = 'APPROVED' THEN l.days_count ELSE 0 END),0) AS approvedDays
      FROM leave_requests l JOIN employees e ON e.id = l.employee_id AND e.organization_id = l.organization_id
      WHERE l.organization_id = ${org} AND ${employeeScope(org, q)} AND l.starts_at >= ${utcStart} AND l.starts_at < ${utcEnd}
      ${q.leaveStatus ? Prisma.sql`AND l.status = ${q.leaveStatus}` : Prisma.empty} ${g.suffix}`);
  }
  counters(row?: Row): Counters {
    return Object.fromEntries(Object.entries(row ?? {}).filter(([k]) => k !== 'bucket').map(([k, v]) => [k, n(v)]));
  }
  attendanceCounters(row?: Row): Counters {
    const c = this.counters(row ?? { total: 0, present: 0, absent: 0, onLeave: 0, incomplete: 0, late: 0, latePresent: 0, earlyLeave: 0, workedMinutes: 0, completedRecords: 0 });
    return { ...c, lateRate: rate(c.latePresent ?? 0, c.present ?? 0), averageWorkedMinutes: c.completedRecords ? Math.round((c.workedMinutes ?? 0) / c.completedRecords * 100) / 100 : null };
  }
  async numeric(tx: Prisma.TransactionClient, org: string, q: ReportQueryDto, kind: 'workforce' | 'attendance' | 'leave'): Promise<NumericReport> {
    const totals = await this[kind](tx, org, q), daily = await this[kind](tx, org, q, 'date');
    const metrics = kind === 'attendance' ? this.attendanceCounters(totals[0]) : this.counters(totals[0]);
    const keys = kind === 'workforce' ? ['newEmployeeRecords'] : kind === 'attendance' ? ['total', 'late', 'earlyLeave', 'workedMinutes'] : ['total', 'approved', 'days'];
    return { metrics, trend: trend(daily.map((r) => ({ bucket: String(r.bucket), metrics: this.counters(r) })), q, keys) };
  }
  async payrollRows(tx: Prisma.TransactionClient, org: string, q: ScopedReportQuery, mode: Grouping = 'total'): Promise<Row[]> {
    const { start, end } = reportRange(q);
    const expression = mode === 'department' ? Prisma.sql`e.department_id` : mode === 'date' ? Prisma.sql`DATE_FORMAT(p.period_end, '%Y-%m-%d')` : Prisma.sql`'total'`;
    const bound = 20 * (mode === 'date' ? 366 : mode === 'department' ? q.departmentIds?.length ?? 100 : 1);
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${expression} AS bucket, r.currency, COUNT(*) AS records, COUNT(DISTINCT e.id) AS employees,
      SUM(r.gross_amount) AS gross, SUM(r.net_amount) AS net
      FROM payroll_records r JOIN employees e ON e.id = r.employee_id AND e.organization_id = r.organization_id
      JOIN payroll_periods p ON p.id = r.payroll_period_id AND p.organization_id = r.organization_id
      WHERE r.organization_id = ${org} AND p.organization_id = ${org} AND ${employeeScope(org, q)}
      AND p.status = ${q.payrollStatus} AND p.period_end >= ${start} AND p.period_end <= ${end}
      GROUP BY ${expression}, r.currency ORDER BY bucket ASC, r.currency ASC LIMIT ${bound + 1}`);
    if (rows.length > bound || new Set(rows.map((r) => r.currency)).size > 20) throw new BadRequestException('Too many report currencies.');
    return rows;
  }
  moneyGroups(rows: Row[]): MoneyGroup[] {
    if (new Set(rows.map((r) => r.currency)).size > 20) throw new BadRequestException('Too many report currencies.');
    return rows.map((r) => ({ currency: String(r.currency), records: n(r.records), employees: n(r.employees), gross: money(r.gross as Prisma.Decimal), net: money(r.net as Prisma.Decimal), averageNet: n(r.records) ? new Prisma.Decimal(String(r.net ?? 0)).div(n(r.records)).toFixed(2) : null }));
  }
  async payroll(tx: Prisma.TransactionClient, org: string, q: ReportQueryDto): Promise<PayrollReport> {
    const { start, end } = reportRange(q);
    const [counts] = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT COUNT(DISTINCT p.id) AS periods, COUNT(r.id) AS records, COUNT(DISTINCT r.employee_id) AS employees
      FROM payroll_periods p LEFT JOIN payroll_records r ON r.payroll_period_id = p.id AND r.organization_id = p.organization_id
      AND EXISTS (SELECT 1 FROM employees e WHERE e.id = r.employee_id AND ${employeeScope(org, q)})
      WHERE p.organization_id = ${org} AND p.status = ${q.payrollStatus} AND p.period_end >= ${start} AND p.period_end <= ${end}
      ${q.employeeId || q.departmentId || q.employeeStatus ? Prisma.sql`AND r.id IS NOT NULL` : Prisma.empty}`);
    const currencies = this.moneyGroups(await this.payrollRows(tx, org, q));
    // Trend omits distinct employee counts: summing daily distinct counts would double-count people.
    const daily = await this.payrollRows(tx, org, q, 'date');
    const groups = new Map<string, Map<string, { gross: Prisma.Decimal; net: Prisma.Decimal; records: number }>>();
    for (const r of daily) {
      const day = bucket(String(r.bucket), q.interval), currency = String(r.currency); const entries = groups.get(day) ?? new Map();
      const previous = entries.get(currency) ?? { gross: new Prisma.Decimal(0), net: new Prisma.Decimal(0), records: 0 };
      previous.gross = previous.gross.add(String(r.gross)); previous.net = previous.net.add(String(r.net)); previous.records += n(r.records);
      entries.set(currency, previous); groups.set(day, entries);
    }
    return { periods: n(counts.periods), records: n(counts.records), employees: n(counts.employees), currencies,
      trend: [...groups].map(([date, entries]) => ({ bucket: date, currencies: [...entries].map(([currency, v]) => ({ currency, records: v.records, gross: v.gross.toFixed(2), net: v.net.toFixed(2), averageNet: v.net.div(v.records).toFixed(2) })) })) };
  }
}

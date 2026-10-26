// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable, Logger } from '@nestjs/common';
import { DocumentStatus, LeaveStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';

export interface TimeRange {
  start: Date;
  end: Date;
  label: string;
}

export interface MetricDelta {
  current: number | null;
  previous: number | null;
  delta: number | null; // current - previous (percentage points if rates, or absolute delta)
  relativeChangePercent: number | null; // ((current - prev) / prev) * 100
}

export interface WorkforceAnalytics {
  total: number;
  active: number;
  inactive: number;
  newHiresInRange: number;
  departments: { id: string; name: string; employeeCount: number; percentage: number }[];
  topDepartment: { name: string; count: number } | null;
}

export interface AttendanceAnalytics {
  totalRecords: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  onLeaveCount: number;
  earlyLeaveCount: number;
  attendanceRate: number | null; // % (present / (present + absent))
  lateRate: number | null; // % (late / present)
  totalWorkedHours: number;
  averageWorkedHoursPerRecord: number | null;
  comparison?: {
    previousRangeLabel: string;
    attendanceRateDelta: number | null; // in percentage points (e.g. +2.5 pp)
    lateRateDelta: number | null; // in percentage points
    lateCountDelta: number | null;
    lateCountRelativeChangePercent: number | null; // relative % change
  };
  departmentBreakdown: {
    departmentName: string;
    totalRecords: number;
    presentCount: number;
    lateCount: number;
    attendanceRate: number | null;
    lateRate: number | null;
  }[];
}

export interface LeaveAnalytics {
  totalRequests: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  cancelledCount: number;
  totalApprovedDays: number;
  averageApprovedDaysPerEmployee: number | null;
  byType: { type: string; count: number; approvedDays: number }[];
  comparison?: {
    previousRangeLabel: string;
    totalRequestsDelta: number | null;
    approvedDaysDelta: number | null;
  };
  departmentBreakdown: {
    departmentName: string;
    requestCount: number;
    approvedDays: number;
  }[];
}

export interface PayrollCurrencyGroup {
  currency: string;
  totalGross: number;
  totalNet: number;
  recordCount: number;
  employeeCount: number;
  averageNet: number | null;
  comparison?: {
    previousPeriodName: string;
    netDelta: number;
    relativeChangePercent: number | null;
  };
}

export interface PayrollAnalytics {
  periodName: string | null;
  periodStatus: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  currencies: PayrollCurrencyGroup[];
  departmentBreakdown: {
    departmentName: string;
    currency: string;
    totalNet: number;
    employeeCount: number;
    averageNet: number | null;
  }[];
}

export interface PerformanceAnalytics {
  totalReviews: number;
  completedReviews: number;
  cancelledReviews: number;
  completionRate: number | null; // %
  averageRating: number | null; // 1 to 5 scale
  ratingDistribution: { rating: number; count: number; percentage: number }[];
  averageGoalProgress: number | null; // 0 to 100
  averageKpiScore: number | null; // 0 to 100
  departmentBreakdown: {
    departmentName: string;
    reviewCount: number;
    averageRating: number | null;
    averageKpiScore: number | null;
  }[];
}

export interface ComplianceAnalytics {
  totalDocuments: number;
  activeDocuments: number;
  expiredCount: number;
  expiringSoonCount: number;
  missingRequiredCount: number;
  compliantEmployeesCount: number;
  totalEmployees: number;
  complianceRate: number | null; // %
  departmentBreakdown: {
    departmentName: string;
    employeeCount: number;
    compliantEmployeeCount: number;
    complianceRate: number | null;
    missingCount: number;
  }[];
}

export interface HROverviewAnalytics {
  workforce?: WorkforceAnalytics;
  attendance?: AttendanceAnalytics;
  leave?: LeaveAnalytics;
  payroll?: PayrollAnalytics;
  performance?: PerformanceAnalytics;
  compliance?: ComplianceAnalytics;
  insights: string[];
  anomalies: string[];
  timeRangeLabel: string;
}

export interface AiInsightsSummary {
  workforce: { total: number; active: number; topDepartment: string | null } | null;
  attendance: { attendanceRate: number | null; lateRate: number | null; lateCount: number } | null;
  performance: { averageRating: number | null; completionRate: number | null } | null;
  compliance: { complianceRate: number | null; expiringSoonCount: number; missingCount: number } | null;
  payroll: { latestPeriod: string | null; currencies: { currency: string; totalNet: number }[] } | null;
}

@Injectable()
export class AiAnalyticsService {
  private readonly logger = new Logger(AiAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService
  ) {}
  // TIME RANGE DETECTION & PARSING (Deterministic UTC+7 aware)

  parseTimeRange(message: string): { current: TimeRange; previous?: TimeRange } {
    const text = message.toLowerCase();
    const now = new Date();

    // Helper: Vietnam offset UTC+7
    const vnYear = now.getUTCFullYear();
    const vnMonth = now.getUTCMonth(); // 0-indexed

    // Case 1: "tháng trước" / "last month" (when NOT a comparison request)
    const isComparison = text.includes('so sánh') || text.includes('so sanh') || text.includes('compare');
    if (!isComparison && (text.includes('tháng trước') || text.includes('thang truoc') || text.includes('last month'))) {
      const prevMonth = vnMonth === 0 ? 11 : vnMonth - 1;
      const prevYear = vnMonth === 0 ? vnYear - 1 : vnYear;
      const start = new Date(Date.UTC(prevYear, prevMonth, 1));
      const end = new Date(Date.UTC(prevYear, prevMonth + 1, 0, 23, 59, 59, 999));
      return {
        current: { start, end, label: `Tháng ${prevMonth + 1}/${prevYear}` },
      };
    }

    // Case 2: Specific month "tháng 8", "tháng 9", etc.
    const monthMatch = text.match(/tháng\s+(\d{1,2})/);
    if (monthMatch && !text.includes('so sánh') && !text.includes('tháng này') && !text.includes('tháng trước')) {
      const m = parseInt(monthMatch[1], 10);
      if (m >= 1 && m <= 12) {
        const start = new Date(Date.UTC(vnYear, m - 1, 1));
        const end = new Date(Date.UTC(vnYear, m, 0, 23, 59, 59, 999));
        return {
          current: { start, end, label: `Tháng ${m}/${vnYear}` },
        };
      }
    }

    // Case 3: "so sánh tháng này với tháng trước" / comparison request
    if (text.includes('so sánh') || text.includes('so sanh') || text.includes('compare')) {
      const currentStart = new Date(Date.UTC(vnYear, vnMonth, 1));
      const currentEnd = new Date(Date.UTC(vnYear, vnMonth + 1, 0, 23, 59, 59, 999));

      const prevMonth = vnMonth === 0 ? 11 : vnMonth - 1;
      const prevYear = vnMonth === 0 ? vnYear - 1 : vnYear;
      const prevStart = new Date(Date.UTC(prevYear, prevMonth, 1));
      const prevEnd = new Date(Date.UTC(prevYear, prevMonth + 1, 0, 23, 59, 59, 999));

      return {
        current: { start: currentStart, end: currentEnd, label: `Tháng ${vnMonth + 1}/${vnYear}` },
        previous: { start: prevStart, end: prevEnd, label: `Tháng ${prevMonth + 1}/${prevYear}` },
      };
    }

    // Case 4: "hôm nay" / "today"
    if (text.includes('hôm nay') || text.includes('hom nay') || text.includes('today')) {
      const start = new Date(Date.UTC(vnYear, vnMonth, now.getUTCDate()));
      const end = new Date(Date.UTC(vnYear, vnMonth, now.getUTCDate(), 23, 59, 59, 999));
      return {
        current: { start, end, label: `Hôm nay (${start.toISOString().slice(0, 10)})` },
      };
    }

    // Case 5: "tuần này" / "this week"
    if (text.includes('tuần này') || text.includes('tuan nay') || text.includes('this week')) {
      const dayOfWeek = now.getUTCDay(); // 0 is Sun, 1 is Mon
      const diffToMonday = (dayOfWeek + 6) % 7;
      const start = new Date(Date.UTC(vnYear, vnMonth, now.getUTCDate() - diffToMonday));
      const end = new Date(Date.UTC(vnYear, vnMonth, now.getUTCDate() + (6 - diffToMonday), 23, 59, 59, 999));
      return {
        current: { start, end, label: 'Tuần này' },
      };
    }

    // Case 6: "quý này" / "this quarter"
    if (text.includes('quý này') || text.includes('quy nay') || text.includes('this quarter')) {
      const q = Math.floor(vnMonth / 3);
      const start = new Date(Date.UTC(vnYear, q * 3, 1));
      const end = new Date(Date.UTC(vnYear, (q + 1) * 3, 0, 23, 59, 59, 999));
      return {
        current: { start, end, label: `Quý ${q + 1}/${vnYear}` },
      };
    }

    // Case 7: "năm nay" / "this year"
    if (text.includes('năm nay') || text.includes('nam nay') || text.includes('this year')) {
      const start = new Date(Date.UTC(vnYear, 0, 1));
      const end = new Date(Date.UTC(vnYear, 12, 0, 23, 59, 59, 999));
      return {
        current: { start, end, label: `Năm ${vnYear}` },
      };
    }

    // Default: "tháng này" / current month with previous month comparison
    const currentStart = new Date(Date.UTC(vnYear, vnMonth, 1));
    const currentEnd = new Date(Date.UTC(vnYear, vnMonth + 1, 0, 23, 59, 59, 999));
    const prevMonth = vnMonth === 0 ? 11 : vnMonth - 1;
    const prevYear = vnMonth === 0 ? vnYear - 1 : vnYear;
    const prevStart = new Date(Date.UTC(prevYear, prevMonth, 1));
    const prevEnd = new Date(Date.UTC(prevYear, prevMonth + 1, 0, 23, 59, 59, 999));

    return {
      current: { start: currentStart, end: currentEnd, label: `Tháng ${vnMonth + 1}/${vnYear}` },
      previous: { start: prevStart, end: prevEnd, label: `Tháng ${prevMonth + 1}/${prevYear}` },
    };
  }
  // DETERMINISTIC MATH CALCULATION HELPERS

  rate(numerator: number, denominator: number): number | null {
    if (!denominator || denominator <= 0) return null;
    return Math.round((numerator / denominator) * 10000) / 100;
  }

  average(sum: number, count: number): number | null {
    if (!count || count <= 0) return null;
    return Math.round((sum / count) * 100) / 100;
  }

  delta(current: number | null, previous: number | null): number | null {
    if (current === null || previous === null) return null;
    return Math.round((current - previous) * 100) / 100;
  }

  relativeChange(current: number | null, previous: number | null): number | null {
    if (current === null || previous === null || previous === 0) return null;
    return Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100;
  }
  // 1. WORKFORCE ANALYTICS

  async getWorkforceAnalytics(
    orgId: string,
    permissions: Set<string>,
    timeRange: TimeRange
  ): Promise<WorkforceAnalytics | null> {
    if (!permissions.has(PERMISSIONS.EMPLOYEE_READ)) return null;

    const [total, active, inactive, newHiresInRange, departments] = await Promise.all([
      this.prisma.employee.count({ where: { organizationId: orgId } }),
      this.prisma.employee.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.employee.count({ where: { organizationId: orgId, status: 'INACTIVE' } }),
      this.prisma.employee.count({
        where: {
          organizationId: orgId,
          createdAt: { gte: timeRange.start, lte: timeRange.end },
        },
      }),
      this.prisma.department.findMany({
        where: { organizationId: orgId, status: 'ACTIVE' },
        include: {
          _count: {
            select: { employees: { where: { status: 'ACTIVE' } } },
          },
        },
      }),
    ]);

    const deptDistribution = departments.map((d) => ({
      id: d.id,
      name: d.name,
      employeeCount: d._count.employees,
      percentage: this.rate(d._count.employees, active) ?? 0,
    }));

    deptDistribution.sort((a, b) => b.employeeCount - a.employeeCount);
    const topDepartment = deptDistribution.length > 0 ? { name: deptDistribution[0].name, count: deptDistribution[0].employeeCount } : null;

    return {
      total,
      active,
      inactive,
      newHiresInRange,
      departments: deptDistribution,
      topDepartment,
    };
  }
  // 2. ATTENDANCE ANALYTICS

  async getAttendanceAnalytics(
    orgId: string,
    permissions: Set<string>,
    currentRange: TimeRange,
    previousRange?: TimeRange
  ): Promise<AttendanceAnalytics | null> {
    if (!permissions.has(PERMISSIONS.ATTENDANCE_READ) && !permissions.has(PERMISSIONS.ATTENDANCE_MANAGE)) {
      return null;
    }

    const currentRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        organizationId: orgId,
        workDate: { gte: currentRange.start, lte: currentRange.end },
      },
      include: {
        employee: {
          select: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    const totalRecords = currentRecords.length;
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let onLeaveCount = 0;
    let earlyLeaveCount = 0;
    let totalWorkedMinutes = 0;
    let completedRecords = 0;

    // Per department tracking
    const deptMap = new Map<string, { total: number; present: number; late: number }>();

    for (const r of currentRecords) {
      if (r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'INCOMPLETE') {
        presentCount++;
      }
      if (r.status === 'LATE' || r.lateMinutes > 0) {
        lateCount++;
      }
      if (r.status === 'ABSENT') {
        absentCount++;
      }
      if (r.status === 'ON_LEAVE') {
        onLeaveCount++;
      }
      if (r.earlyLeaveMinutes > 0) {
        earlyLeaveCount++;
      }
      if (r.workedMinutes && r.workedMinutes > 0) {
        totalWorkedMinutes += r.workedMinutes;
        completedRecords++;
      }

      const deptName = r.employee?.department?.name ?? 'Chưa phân bổ';
      const dEntry = deptMap.get(deptName) ?? { total: 0, present: 0, late: 0 };
      dEntry.total++;
      if (r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'INCOMPLETE') {
        dEntry.present++;
      }
      if (r.status === 'LATE' || r.lateMinutes > 0) {
        dEntry.late++;
      }
      deptMap.set(deptName, dEntry);
    }

    const attendanceRate = this.rate(presentCount, presentCount + absentCount);
    const lateRate = this.rate(lateCount, presentCount);
    const totalWorkedHours = Math.round((totalWorkedMinutes / 60) * 10) / 10;
    const averageWorkedHoursPerRecord = completedRecords > 0
      ? Math.round((totalWorkedMinutes / completedRecords / 60) * 10) / 10
      : null;

    const departmentBreakdown = Array.from(deptMap.entries()).map(([name, stat]) => ({
      departmentName: name,
      totalRecords: stat.total,
      presentCount: stat.present,
      lateCount: stat.late,
      attendanceRate: this.rate(stat.present, stat.total),
      lateRate: this.rate(stat.late, stat.present),
    }));

    // Comparison with previous range if requested
    let comparison: AttendanceAnalytics['comparison'] = undefined;
    if (previousRange) {
      const prevRecords = await this.prisma.attendanceRecord.findMany({
        where: {
          organizationId: orgId,
          workDate: { gte: previousRange.start, lte: previousRange.end },
        },
        select: { status: true, lateMinutes: true },
      });

      if (prevRecords.length > 0) {
        let prevPresent = 0;
        let prevLate = 0;
        let prevAbsent = 0;
        for (const pr of prevRecords) {
          if (pr.status === 'PRESENT' || pr.status === 'LATE' || pr.status === 'INCOMPLETE') prevPresent++;
          if (pr.status === 'LATE' || pr.lateMinutes > 0) prevLate++;
          if (pr.status === 'ABSENT') prevAbsent++;
        }
        const prevAttendanceRate = this.rate(prevPresent, prevPresent + prevAbsent);
        const prevLateRate = this.rate(prevLate, prevPresent);

        comparison = {
          previousRangeLabel: previousRange.label,
          attendanceRateDelta: this.delta(attendanceRate, prevAttendanceRate),
          lateRateDelta: this.delta(lateRate, prevLateRate),
          lateCountDelta: lateCount - prevLate,
          lateCountRelativeChangePercent: this.relativeChange(lateCount, prevLate),
        };
      }
    }

    return {
      totalRecords,
      presentCount,
      lateCount,
      absentCount,
      onLeaveCount,
      earlyLeaveCount,
      attendanceRate,
      lateRate,
      totalWorkedHours,
      averageWorkedHoursPerRecord,
      comparison,
      departmentBreakdown,
    };
  }
  // 3. LEAVE ANALYTICS

  async getLeaveAnalytics(
    orgId: string,
    permissions: Set<string>,
    currentRange: TimeRange,
    previousRange?: TimeRange
  ): Promise<LeaveAnalytics | null> {
    if (!permissions.has(PERMISSIONS.LEAVE_READ) && !permissions.has(PERMISSIONS.LEAVE_APPROVE)) {
      return null;
    }

    const currentRequests = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId: orgId,
        startsAt: { gte: currentRange.start, lte: currentRange.end },
      },
      include: {
        employee: {
          select: { department: { select: { id: true, name: true } } },
        },
      },
    });

    const totalRequests = currentRequests.length;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let cancelledCount = 0;
    let totalApprovedDays = 0;

    const typeMap = new Map<string, { count: number; approvedDays: number }>();
    const deptMap = new Map<string, { count: number; approvedDays: number }>();

    for (const req of currentRequests) {
      if (req.status === LeaveStatus.PENDING) pendingCount++;
      if (req.status === LeaveStatus.APPROVED) {
        approvedCount++;
        totalApprovedDays += req.daysCount;
      }
      if (req.status === LeaveStatus.REJECTED) rejectedCount++;
      if (req.status === LeaveStatus.CANCELLED) cancelledCount++;

      // Type aggregation
      const tEntry = typeMap.get(req.leaveType) ?? { count: 0, approvedDays: 0 };
      tEntry.count++;
      if (req.status === LeaveStatus.APPROVED) tEntry.approvedDays += req.daysCount;
      typeMap.set(req.leaveType, tEntry);

      // Dept aggregation
      const deptName = req.employee?.department?.name ?? 'Chưa phân bổ';
      const dEntry = deptMap.get(deptName) ?? { count: 0, approvedDays: 0 };
      dEntry.count++;
      if (req.status === LeaveStatus.APPROVED) dEntry.approvedDays += req.daysCount;
      deptMap.set(deptName, dEntry);
    }

    // Average approved days per active employee
    const activeEmployeesCount = await this.prisma.employee.count({
      where: { organizationId: orgId, status: 'ACTIVE' },
    });
    const averageApprovedDaysPerEmployee = activeEmployeesCount > 0
      ? Math.round((totalApprovedDays / activeEmployeesCount) * 100) / 100
      : null;

    const byType = Array.from(typeMap.entries()).map(([type, stat]) => ({
      type,
      count: stat.count,
      approvedDays: Math.round(stat.approvedDays * 10) / 10,
    }));

    const departmentBreakdown = Array.from(deptMap.entries()).map(([name, stat]) => ({
      departmentName: name,
      requestCount: stat.count,
      approvedDays: Math.round(stat.approvedDays * 10) / 10,
    }));

    let comparison: LeaveAnalytics['comparison'] = undefined;
    if (previousRange) {
      const prevRequests = await this.prisma.leaveRequest.findMany({
        where: {
          organizationId: orgId,
          startsAt: { gte: previousRange.start, lte: previousRange.end },
        },
        select: { status: true, daysCount: true },
      });
      if (prevRequests.length > 0) {
        const prevTotal = prevRequests.length;
        const prevApprovedDays = prevRequests
          .filter((r) => r.status === LeaveStatus.APPROVED)
          .reduce((sum, r) => sum + r.daysCount, 0);

        comparison = {
          previousRangeLabel: previousRange.label,
          totalRequestsDelta: totalRequests - prevTotal,
          approvedDaysDelta: Math.round((totalApprovedDays - prevApprovedDays) * 10) / 10,
        };
      }
    }

    return {
      totalRequests,
      pendingCount,
      approvedCount,
      rejectedCount,
      cancelledCount,
      totalApprovedDays: Math.round(totalApprovedDays * 10) / 10,
      averageApprovedDaysPerEmployee,
      byType,
      comparison,
      departmentBreakdown,
    };
  }
  // 4. PAYROLL ANALYTICS (Strict RBAC & Currency Segregation)

  async getPayrollAnalytics(
    orgId: string,
    permissions: Set<string>
  ): Promise<PayrollAnalytics | null> {
    if (!permissions.has(PERMISSIONS.PAYROLL_READ)) return null;

    // Get latest calculated/approved/finalized period
    const periods = await this.prisma.payrollPeriod.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['CALCULATED', 'APPROVED', 'FINALIZED'] },
      },
      orderBy: { periodEnd: 'desc' },
      take: 2,
    });

    if (periods.length === 0) {
      return {
        periodName: null,
        periodStatus: null,
        periodStart: null,
        periodEnd: null,
        currencies: [],
        departmentBreakdown: [],
      };
    }

    const latestPeriod = periods[0];
    const previousPeriod = periods.length > 1 ? periods[1] : null;

    // Fetch records of latest period with department info
    const records = await this.prisma.payrollRecord.findMany({
      where: {
        organizationId: orgId,
        payrollPeriodId: latestPeriod.id,
      },
      include: {
        employee: {
          select: {
            id: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Previous period records for comparison
    const prevRecords = previousPeriod
      ? await this.prisma.payrollRecord.findMany({
          where: { organizationId: orgId, payrollPeriodId: previousPeriod.id },
          select: { currency: true, netAmount: true },
        })
      : [];

    const prevCurrencyMap = new Map<string, number>();
    for (const pr of prevRecords) {
      const cur = pr.currency || 'VND';
      prevCurrencyMap.set(cur, (prevCurrencyMap.get(cur) ?? 0) + Number(pr.netAmount));
    }

    // Group by currency (STRICT RULE: NEVER ADD VND AND USD TOGETHER!)
    const currencyMap = new Map<
      string,
      { gross: number; net: number; count: number; employees: Set<string> }
    >();

    const deptMap = new Map<
      string,
      { currency: string; net: number; count: number }
    >();

    for (const r of records) {
      const cur = r.currency || 'VND';
      const cEntry = currencyMap.get(cur) ?? {
        gross: 0,
        net: 0,
        count: 0,
        employees: new Set<string>(),
      };
      cEntry.gross += Number(r.grossAmount);
      cEntry.net += Number(r.netAmount);
      cEntry.count++;
      cEntry.employees.add(r.employeeId);
      currencyMap.set(cur, cEntry);

      const deptName = r.employee?.department?.name ?? 'Chưa phân bổ';
      const deptKey = `${deptName}___${cur}`;
      const dEntry = deptMap.get(deptKey) ?? { currency: cur, net: 0, count: 0 };
      dEntry.net += Number(r.netAmount);
      dEntry.count++;
      deptMap.set(deptKey, dEntry);
    }

    const currencies: PayrollCurrencyGroup[] = Array.from(currencyMap.entries()).map(
      ([cur, data]) => {
        const prevNet = prevCurrencyMap.get(cur);
        const comparison =
          previousPeriod && prevNet !== undefined
            ? {
                previousPeriodName: previousPeriod.name,
                netDelta: Math.round((data.net - prevNet) * 100) / 100,
                relativeChangePercent: this.relativeChange(data.net, prevNet),
              }
            : undefined;

        return {
          currency: cur,
          totalGross: Math.round(data.gross * 100) / 100,
          totalNet: Math.round(data.net * 100) / 100,
          recordCount: data.count,
          employeeCount: data.employees.size,
          averageNet: data.count > 0 ? Math.round((data.net / data.count) * 100) / 100 : null,
          comparison,
        };
      }
    );

    const departmentBreakdown = Array.from(deptMap.entries()).map(([key, data]) => {
      const [deptName] = key.split('___');
      return {
        departmentName: deptName,
        currency: data.currency,
        totalNet: Math.round(data.net * 100) / 100,
        employeeCount: data.count,
        averageNet: data.count > 0 ? Math.round((data.net / data.count) * 100) / 100 : null,
      };
    });

    return {
      periodName: latestPeriod.name,
      periodStatus: latestPeriod.status,
      periodStart: latestPeriod.periodStart,
      periodEnd: latestPeriod.periodEnd,
      currencies,
      departmentBreakdown,
    };
  }
  // 5. PERFORMANCE ANALYTICS

  async getPerformanceAnalytics(
    orgId: string,
    permissions: Set<string>
  ): Promise<PerformanceAnalytics | null> {
    if (!permissions.has(PERMISSIONS.PERFORMANCE_READ)) return null;

    const [reviews, goals, kpis] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where: { organizationId: orgId },
        include: {
          employee: {
            select: { department: { select: { id: true, name: true } } },
          },
        },
      }),
      permissions.has(PERMISSIONS.GOAL_READ)
        ? this.prisma.performanceGoal.findMany({
            where: { organizationId: orgId, status: { not: 'CANCELLED' } },
            select: { progress: true },
          })
        : [],
      permissions.has(PERMISSIONS.KPI_READ)
        ? this.prisma.performanceKpi.findMany({
            where: { organizationId: orgId },
            select: { score: true },
          })
        : [],
    ]);

    const totalReviews = reviews.length;
    let completedReviews = 0;
    let cancelledReviews = 0;
    let sumRating = 0;
    let ratingCount = 0;
    const ratingDistMap = new Map<number, number>([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ]);

    const deptMap = new Map<string, { count: number; sumRating: number; ratedCount: number }>();

    for (const r of reviews) {
      if (r.status === 'COMPLETED') completedReviews++;
      if (r.status === 'CANCELLED') cancelledReviews++;

      if (r.finalRating && r.finalRating >= 1 && r.finalRating <= 5) {
        sumRating += r.finalRating;
        ratingCount++;
        ratingDistMap.set(r.finalRating, (ratingDistMap.get(r.finalRating) ?? 0) + 1);
      }

      const deptName = r.employee?.department?.name ?? 'Chưa phân bổ';
      const dEntry = deptMap.get(deptName) ?? { count: 0, sumRating: 0, ratedCount: 0 };
      dEntry.count++;
      if (r.finalRating) {
        dEntry.sumRating += r.finalRating;
        dEntry.ratedCount++;
      }
      deptMap.set(deptName, dEntry);
    }

    const completionRate = this.rate(completedReviews, totalReviews - cancelledReviews);
    const averageRating = ratingCount > 0 ? Math.round((sumRating / ratingCount) * 10) / 10 : null;

    const ratingDistribution = [1, 2, 3, 4, 5].map((stars) => ({
      rating: stars,
      count: ratingDistMap.get(stars) ?? 0,
      percentage: this.rate(ratingDistMap.get(stars) ?? 0, ratingCount) ?? 0,
    }));

    // Average goal progress
    let averageGoalProgress: number | null = null;
    if (goals.length > 0) {
      const sumProgress = goals.reduce((s, g) => s + Number(g.progress), 0);
      averageGoalProgress = Math.round((sumProgress / goals.length) * 10) / 10;
    }

    // Average KPI score
    let averageKpiScore: number | null = null;
    if (kpis.length > 0) {
      const sumKpi = kpis.reduce((s, k) => s + Number(k.score), 0);
      averageKpiScore = Math.round((sumKpi / kpis.length) * 10) / 10;
    }

    const departmentBreakdown = Array.from(deptMap.entries()).map(([name, stat]) => ({
      departmentName: name,
      reviewCount: stat.count,
      averageRating: stat.ratedCount > 0 ? Math.round((stat.sumRating / stat.ratedCount) * 10) / 10 : null,
      averageKpiScore,
    }));

    return {
      totalReviews,
      completedReviews,
      cancelledReviews,
      completionRate,
      averageRating,
      ratingDistribution,
      averageGoalProgress,
      averageKpiScore,
      departmentBreakdown,
    };
  }
  // 6. COMPLIANCE & DOCUMENTS ANALYTICS

  async getComplianceAnalytics(
    orgId: string,
    permissions: Set<string>
  ): Promise<ComplianceAnalytics | null> {
    if (!permissions.has(PERMISSIONS.DOCUMENT_READ)) return null;

    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    const [requirements, employees, documents] = await Promise.all([
      this.prisma.documentRequirement.findMany({
        where: { organizationId: orgId, isRequired: true },
      }),
      this.prisma.employee.findMany({
        where: { organizationId: orgId, status: 'ACTIVE' },
        select: {
          id: true,
          departmentId: true,
          department: { select: { id: true, name: true } },
        },
      }),
      this.prisma.employeeDocument.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: {
          id: true,
          employeeId: true,
          category: true,
          status: true,
          sensitivity: true,
          expiryDate: true,
        },
      }),
    ]);

    // Check sensitive permission: if lacks DOCUMENT_SENSITIVE_READ, exclude sensitive docs
    const hasSensitive = permissions.has(PERMISSIONS.DOCUMENT_SENSITIVE_READ);
    const visibleDocs = hasSensitive
      ? documents
      : documents.filter((d) => d.sensitivity !== 'SENSITIVE');

    let totalExpected = 0;
    let totalFulfilled = 0;
    let compliantEmployeesCount = 0;

    const deptMap = new Map<
      string,
      { totalEmp: number; compliantEmp: number; expected: number; fulfilled: number }
    >();

    for (const emp of employees) {
      const deptName = emp.department?.name ?? 'Chưa phân bổ';
      const dEntry = deptMap.get(deptName) ?? { totalEmp: 0, compliantEmp: 0, expected: 0, fulfilled: 0 };
      dEntry.totalEmp++;

      const empReqs = requirements.filter(
        (r) => !r.applicableDepartmentId || r.applicableDepartmentId === emp.departmentId
      );
      totalExpected += empReqs.length;
      dEntry.expected += empReqs.length;

      const empDocs = visibleDocs.filter(
        (d) => d.employeeId === emp.id && d.status === DocumentStatus.ACTIVE
      );

      let fulfilledForEmp = 0;
      for (const req of empReqs) {
        const doc = empDocs.find((d) => d.category === req.category);
        if (doc) {
          const isExpired = doc.expiryDate && new Date(doc.expiryDate) < now;
          if (!isExpired) {
            fulfilledForEmp++;
          }
        }
      }

      totalFulfilled += fulfilledForEmp;
      dEntry.fulfilled += fulfilledForEmp;

      if (empReqs.length > 0 && fulfilledForEmp === empReqs.length) {
        compliantEmployeesCount++;
        dEntry.compliantEmp++;
      }
      deptMap.set(deptName, dEntry);
    }

    const expiredDocs = visibleDocs.filter(
      (d) =>
        d.status === DocumentStatus.EXPIRED ||
        (d.expiryDate && new Date(d.expiryDate) < now && d.status !== DocumentStatus.ARCHIVED)
    );

    const expiringSoonDocs = visibleDocs.filter(
      (d) =>
        d.status === DocumentStatus.ACTIVE &&
        d.expiryDate &&
        new Date(d.expiryDate) >= now &&
        new Date(d.expiryDate) <= in30Days
    );

    const complianceRate = this.rate(totalFulfilled, totalExpected);

    const departmentBreakdown = Array.from(deptMap.entries()).map(([name, stat]) => ({
      departmentName: name,
      employeeCount: stat.totalEmp,
      compliantEmployeeCount: stat.compliantEmp,
      complianceRate: this.rate(stat.fulfilled, stat.expected),
      missingCount: stat.expected - stat.fulfilled,
    }));

    return {
      totalDocuments: visibleDocs.length,
      activeDocuments: visibleDocs.filter((d) => d.status === DocumentStatus.ACTIVE).length,
      expiredCount: expiredDocs.length,
      expiringSoonCount: expiringSoonDocs.length,
      missingRequiredCount: totalExpected - totalFulfilled,
      compliantEmployeesCount,
      totalEmployees: employees.length,
      complianceRate,
      departmentBreakdown,
    };
  }
  // 7. CROSS-DOMAIN HR OVERVIEW & ANOMALY DETECTION

  async getHROverview(
    orgId: string,
    permissions: Set<string>,
    currentRange: TimeRange,
    previousRange?: TimeRange
  ): Promise<HROverviewAnalytics> {
    const [workforce, attendance, leave, payroll, performance, compliance] = await Promise.all([
      this.getWorkforceAnalytics(orgId, permissions, currentRange),
      this.getAttendanceAnalytics(orgId, permissions, currentRange, previousRange),
      this.getLeaveAnalytics(orgId, permissions, currentRange, previousRange),
      this.getPayrollAnalytics(orgId, permissions),
      this.getPerformanceAnalytics(orgId, permissions),
      this.getComplianceAnalytics(orgId, permissions),
    ]);

    const insights: string[] = [];
    const anomalies: string[] = [];

    // Workforce insights
    if (workforce) {
      if (workforce.topDepartment) {
        insights.push(
          `Phòng ${workforce.topDepartment.name} hiện có quy mô nhân sự lớn nhất với ${workforce.topDepartment.count} nhân sự (${this.rate(workforce.topDepartment.count, workforce.active)}% tổng nhân sự active).`
        );
      }
      if (workforce.inactive > 0) {
        insights.push(`Hệ thống có ${workforce.inactive} nhân sự ở trạng thái ngừng hoạt động.`);
      }
    }

    // Attendance insights & anomaly detection
    if (attendance) {
      if (attendance.lateRate !== null && attendance.lateRate > 15) {
        anomalies.push(
          `Tỷ lệ đi muộn ghi nhận ở mức cao (${attendance.lateRate}% với ${attendance.lateCount} lượt). Dữ liệu hiện có chưa xác định được nguyên nhân cụ thể.`
        );
      }
      if (attendance.comparison?.lateRateDelta !== null && attendance.comparison?.lateRateDelta !== undefined && attendance.comparison.lateRateDelta > 3) {
        anomalies.push(
          `Tỷ lệ đi muộn tăng ${attendance.comparison.lateRateDelta} điểm phần trăm so với kỳ trước (${attendance.comparison.previousRangeLabel}).`
        );
      }
      if (attendance.attendanceRate !== null) {
        insights.push(`Tỷ lệ đi làm đạt ${attendance.attendanceRate}% trong kỳ ${currentRange.label}.`);
      }
    }

    // Leave insights
    if (leave) {
      if (leave.pendingCount > 0) {
        insights.push(`Hiện có ${leave.pendingCount} đơn nghỉ phép đang chờ phê duyệt từ cấp quản lý.`);
      }
      if (leave.approvedCount > 0) {
        insights.push(`Tổng số ngày nghỉ đã duyệt là ${leave.totalApprovedDays} ngày cho toàn doanh nghiệp.`);
      }
    }

    // Payroll insights
    if (payroll && payroll.currencies.length > 0) {
      for (const cur of payroll.currencies) {
        const formattedNet = cur.totalNet.toLocaleString('vi-VN');
        const formattedAvg = cur.averageNet ? cur.averageNet.toLocaleString('vi-VN') : '0';
        insights.push(
          `Tổng chi phí lương thực nhận (${cur.currency}) kỳ gần nhất: ${formattedNet} ${cur.currency} cho ${cur.employeeCount} nhân sự (Trung bình: ${formattedAvg} ${cur.currency}/người).`
        );
        if (cur.comparison && cur.comparison.relativeChangePercent !== null) {
          const sign = cur.comparison.relativeChangePercent > 0 ? '+' : '';
          insights.push(
            `Tổng lương ${cur.currency} thay đổi ${sign}${cur.comparison.relativeChangePercent}% so với kỳ trước (${cur.comparison.previousPeriodName}).`
          );
        }
      }
    }

    // Performance insights
    if (performance && performance.averageRating !== null) {
      insights.push(
        `Điểm đánh giá hiệu suất trung bình đạt ${performance.averageRating}/5 với tỷ lệ hoàn thành kỳ đánh giá là ${performance.completionRate ?? 0}%.`
      );
    }

    // Compliance insights & anomalies
    if (compliance) {
      if (compliance.complianceRate !== null && compliance.complianceRate < 80) {
        anomalies.push(
          `Tỷ lệ tuân thủ hồ sơ pháp lý hiện ở mức ${compliance.complianceRate}%, có ${compliance.missingRequiredCount} mục tài liệu bắt buộc còn thiếu.`
        );
      }
      if (compliance.expiringSoonCount > 0) {
        insights.push(`Có ${compliance.expiringSoonCount} hồ sơ/chứng chỉ sẽ hết hạn trong vòng 30 ngày tới.`);
      }
    }

    return {
      workforce: workforce ?? undefined,
      attendance: attendance ?? undefined,
      leave: leave ?? undefined,
      payroll: payroll ?? undefined,
      performance: performance ?? undefined,
      compliance: compliance ?? undefined,
      insights,
      anomalies,
      timeRangeLabel: currentRange.label,
    };
  }
  // 8. SUMMARY FOR FRONTEND AI INSIGHTS WIDGET

  async getAiInsightsSummary(
    orgId: string,
    userId: string
  ): Promise<AiInsightsSummary> {
    const permsList = await this.authorization.effectivePermissions(userId, orgId);
    const permissions = new Set<string>(permsList ?? []);

    const timeRange = this.parseTimeRange('tháng này').current;

    const [workforce, attendance, performance, compliance, payroll] = await Promise.all([
      this.getWorkforceAnalytics(orgId, permissions, timeRange),
      this.getAttendanceAnalytics(orgId, permissions, timeRange),
      this.getPerformanceAnalytics(orgId, permissions),
      this.getComplianceAnalytics(orgId, permissions),
      this.getPayrollAnalytics(orgId, permissions),
    ]);

    return {
      workforce: workforce
        ? {
            total: workforce.total,
            active: workforce.active,
            topDepartment: workforce.topDepartment?.name ?? null,
          }
        : null,
      attendance: attendance
        ? {
            attendanceRate: attendance.attendanceRate,
            lateRate: attendance.lateRate,
            lateCount: attendance.lateCount,
          }
        : null,
      performance: performance
        ? {
            averageRating: performance.averageRating,
            completionRate: performance.completionRate,
          }
        : null,
      compliance: compliance
        ? {
            complianceRate: compliance.complianceRate,
            expiringSoonCount: compliance.expiringSoonCount,
            missingCount: compliance.missingRequiredCount,
          }
        : null,
      payroll: payroll && payroll.currencies.length > 0
        ? {
            latestPeriod: payroll.periodName,
            currencies: payroll.currencies.map((c) => ({
              currency: c.currency,
              totalNet: c.totalNet,
            })),
          }
        : null,
    };
  }
}

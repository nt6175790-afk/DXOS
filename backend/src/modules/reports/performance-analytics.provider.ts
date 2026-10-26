// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';
import type { ReportQueryDto } from './reports.dto';
import { employeeScope } from './analytics.repository';
import { rate, reportRange } from './report-calculations';
import type { PerformanceReport } from './reports.types';

// TASK 7 boundary: only organization managers can aggregate reviews across employees.
// Never select assessment text, feedback, snapshots or draft ratings.
@Injectable()
export class PerformanceAnalyticsProvider {
  async get(tx: Prisma.TransactionClient, org: string, q: ReportQueryDto, permissions: readonly PermissionKey[]): Promise<PerformanceReport> {
    if (!permissions.includes(PERMISSIONS.PERFORMANCE_READ) || !permissions.includes(PERMISSIONS.PERFORMANCE_MANAGE)) return { available: false, reason: 'permission_denied' };
    const { start, end } = reportRange(q);
    const [row] = await tx.$queryRaw<{ total: bigint; completed: Prisma.Decimal; cancelled: Prisma.Decimal; averageRating: Prisma.Decimal | null }[]>(Prisma.sql`
      SELECT COUNT(*) AS total, COALESCE(SUM(r.status = 'COMPLETED'),0) AS completed, COALESCE(SUM(r.status = 'CANCELLED'),0) AS cancelled,
      AVG(CASE WHEN r.status = 'COMPLETED' THEN r.final_rating END) AS averageRating
      FROM performance_reviews r JOIN employees e ON e.id = r.employee_id AND e.organization_id = r.organization_id
      JOIN performance_review_cycles c ON c.id = r.cycle_id AND c.organization_id = r.organization_id
      WHERE r.organization_id = ${org} AND ${employeeScope(org, q)} AND c.end_date >= ${start} AND c.end_date <= ${end}`);
    const total = Number(row.total), completed = Number(row.completed), cancelled = Number(row.cancelled);
    const metrics = { reviews: total, completedReviews: completed, cancelledReviews: cancelled, completionRate: rate(completed, total - cancelled), averageCompletedRating: row.averageRating === null ? null : Number(row.averageRating.toFixed(2)) };
    // Goal/KPI metrics have separate source permissions; they cannot be inferred from performance:read.
    if (permissions.includes(PERMISSIONS.GOAL_READ)) {
      const [goals] = await tx.$queryRaw<{ total: bigint; completed: Prisma.Decimal; averageProgress: Prisma.Decimal | null }[]>(Prisma.sql`
        SELECT COUNT(*) AS total, COALESCE(SUM(g.status = 'COMPLETED'),0) AS completed, AVG(g.progress) AS averageProgress
        FROM performance_goals g JOIN employees e ON e.id = g.employee_id AND e.organization_id = g.organization_id
        JOIN performance_review_cycles c ON c.id = g.cycle_id AND c.organization_id = g.organization_id
        WHERE g.organization_id = ${org} AND ${employeeScope(org, q)} AND c.end_date >= ${start} AND c.end_date <= ${end} AND g.status <> 'CANCELLED'`);
      Object.assign(metrics, { goals: Number(goals.total), completedGoals: Number(goals.completed), averageGoalProgress: goals.averageProgress === null ? null : Number(goals.averageProgress.toFixed(2)) });
    }
    if (permissions.includes(PERMISSIONS.KPI_READ)) {
      const [kpis] = await tx.$queryRaw<{ total: bigint; averageScore: Prisma.Decimal | null }[]>(Prisma.sql`
        SELECT COUNT(*) AS total, AVG(k.score) AS averageScore FROM performance_kpis k
        JOIN employees e ON e.id = k.employee_id AND e.organization_id = k.organization_id
        JOIN performance_review_cycles c ON c.id = k.cycle_id AND c.organization_id = k.organization_id
        WHERE k.organization_id = ${org} AND ${employeeScope(org, q)} AND c.end_date >= ${start} AND c.end_date <= ${end}`);
      Object.assign(metrics, { kpis: Number(kpis.total), averageKpiScore: kpis.averageScore === null ? null : Number(kpis.averageScore.toFixed(2)) });
    }
    return { available: true, metrics };
  }
}

import { Injectable } from '@nestjs/common';
import { DashboardService } from '../../dashboard/dashboard.service';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { formatVnDateTime } from '../agent/vn-time';
import { clip, objectSchema } from './tool.types';
import type { AiCitation, AiTool, ToolContext, ToolOutcome } from './tool.types';

export class GetOverviewArgs {}

@Injectable()
export class GetOverviewTool implements AiTool<GetOverviewArgs> {
  readonly name = 'get_overview';
  readonly description = 'Organization snapshot right now (same as the dashboard): task counts by status, open/overdue/unassigned, completion %, ' +
    'overduePercentOfOpen (overdue / open × 100, already computed), ' +
    'health (ON_TRACK/ATTENTION/EMPTY), up to 5 most overdue tasks, department and employee counts, the 5 busiest people and unread notifications. ' +
    'It has no per-department breakdown: use list_departments for open tasks or headcount per department. ' +
    'Sections the user may not see are null. Use it for "how are things today?".';
  readonly parameters = objectSchema({});
  readonly argsType = GetOverviewArgs;
  readonly requiredPermissions = [PERMISSIONS.AI_USE];

  constructor(private readonly dashboard: DashboardService) {}

  async execute(_args: GetOverviewArgs, context: ToolContext): Promise<ToolOutcome> {
    const d = await this.dashboard.get(context.userId, context.organizationId);
    const overdueItems = d.tasks?.overdueItems ?? [];
    const citations: AiCitation[] = [
      { type: 'metric', id: null, label: 'Tổng quan', href: '/dashboard' },
      ...overdueItems.map((t): AiCitation => ({ type: 'task', id: t.id, label: clip(t.title, 120), href: `/tasks/${t.id}` })),
    ];
    return {
      status: 'OK',
      data: {
        asOf: formatVnDateTime(context.now),
        tasks: d.tasks ? {
          total: d.tasks.total, byStatus: d.tasks.byStatus, open: d.tasks.open, overdue: d.tasks.overdue, unassigned: d.tasks.unassigned,
          completionPercent: d.tasks.completionPercent,
          overduePercentOfOpen: d.tasks.open ? Math.round((d.tasks.overdue / d.tasks.open) * 1000) / 10 : null,
          health: d.tasks.health,
          mostOverdue: overdueItems.map((t) => ({ id: t.id, title: clip(t.title, 160), priority: t.priority, due: t.dueAt ? formatVnDateTime(t.dueAt) : null })),
        } : null,
        departments: d.departments ? { total: d.departments.total, active: d.departments.active } : null,
        employees: d.employees,
        busiestPeople: d.workload ? d.workload.items.slice(0, 5).map((w) => ({ name: w.displayName, openTasks: w.openTasks })) : null,
        unreadNotifications: d.notifications.unread,
      },
      citations,
    };
  }
}

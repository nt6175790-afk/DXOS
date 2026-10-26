// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Link } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';
import {
  Building2,
  Users,
  CheckSquare,
  Bell,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Activity,
  Plus,
  UserPlus,
  CalendarPlus,
  FileText,
  Bot,
  Clock,
  ClipboardCheck,
  CalendarDays,
} from 'lucide-react';
import { format } from 'date-fns';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { useOrganizationResource } from '@/hooks/useOrganizationResource';
import { getDashboard } from '@/api/dashboard';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { activityLabel } from './activity-labels';

const number = (value: number | null | undefined) => (value == null ? '—' : value.toLocaleString('vi-VN'));
const time = (value: string) => format(new Date(value), 'dd/MM/yyyy HH:mm');

function Unavailable() {
  return <p className="p-4 text-sm text-slate-500">Bạn chưa có quyền xem dữ liệu này.</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-slate-500">{children}</p>;
}

function Heading({ children, to }: { children: React.ReactNode; to?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
      <h2 className="text-sm font-semibold text-slate-900">{children}</h2>
      {to && (
        <Link to={to} className="text-xs text-brand-600 flex items-center gap-1 font-medium hover:text-brand-700">
          Xem tất cả <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

const quickActions = [
  { to: '/tasks', label: 'Thêm công việc', icon: Plus, permission: 'task:create', readPermissions: ['task:read'] },
  { to: '/people', label: 'Thêm nhân sự', icon: UserPlus, permission: 'employee:create', readPermissions: ['employee:read'] },
  { to: '/calendar', label: 'Tạo sự kiện', icon: CalendarPlus, permission: 'calendar:create', readPermissions: ['task:read', 'calendar:read'] },
  { to: '/files', label: 'Kho tài liệu', icon: FileText, permission: 'file:read' },
  { to: '/my-schedule', label: 'Lịch đi làm', icon: CalendarDays, permission: null },
  { to: '/attendance', label: 'Chấm công', icon: Clock, permission: 'attendance:read' },
  { to: '/approvals', label: 'Phê duyệt', icon: ClipboardCheck, permission: 'approval:read' },
  { to: '/ai', label: 'Hỏi Trợ lý AI', icon: Bot, permission: 'ai:use' },
] as const;

export function DashboardPage() {
  const { currentOrg } = useOrganization();
  const { hasPermission } = usePermission();
  const { data, error, isLoading, refresh } = useOrganizationResource(getDashboard);
  const guard = useOrgBootstrapGuard();
  if (guard) return guard;
  if (isLoading) return <LoadingState message="Đang tải bảng tổng quan..." />;
  if (error?.error.code === 'FORBIDDEN') return <ForbiddenState />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  if (!data || data.organizationId !== currentOrg?.id) {
    return <ErrorState message="Dữ liệu tổng quan không khớp tổ chức hiện tại." onRetry={refresh} />;
  }

  const cards = [
    {
      label: 'Phòng ban',
      value: data.departments?.total,
      detail: data.departments ? `${number(data.departments.active)} đang hoạt động` : 'Chưa có quyền xem',
      icon: Building2,
      to: '/departments',
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Nhân sự',
      value: data.employees?.total,
      detail: data.employees ? `${number(data.employees.active)} đang làm việc` : 'Chưa có quyền xem',
      icon: Users,
      to: '/people',
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Công việc đang mở',
      value: data.tasks?.open,
      detail: data.tasks ? `${number(data.tasks.total)} công việc tổng cộng` : 'Chưa có quyền xem',
      icon: CheckSquare,
      to: '/tasks',
      color: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Công việc quá hạn',
      value: data.tasks?.overdue,
      detail: data.tasks ? 'Chưa hoàn thành và đã qua hạn' : 'Chưa có quyền xem',
      icon: AlertTriangle,
      to: '/tasks',
      color: 'bg-red-50 text-red-600',
    },
    {
      label: 'Tỷ lệ hoàn thành',
      value: data.tasks?.completionPercent,
      detail: 'Không tính công việc đã hủy',
      icon: Activity,
      to: '/tasks',
      color: 'bg-violet-50 text-violet-600',
      percent: true,
    },
    {
      label: 'Thông báo chưa đọc',
      value: data.notifications.unread,
      detail: 'Dành riêng cho bạn',
      icon: Bell,
      to: '/notifications',
      color: 'bg-sky-50 text-sky-600',
    },
  ];

  const statusRows = [
    { key: 'TODO' as const, label: 'Cần làm', color: 'bg-slate-400' },
    { key: 'IN_PROGRESS' as const, label: 'Đang thực hiện', color: 'bg-blue-500' },
    { key: 'DONE' as const, label: 'Hoàn thành', color: 'bg-emerald-500' },
    { key: 'CANCELLED' as const, label: 'Đã hủy', color: 'bg-slate-300' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description={`${currentOrg?.name} — Dữ liệu toàn tổ chức, cập nhật ${time(data.generatedAt)}`}
        actions={
          <button type="button" onClick={refresh} className="btn-secondary">
            <RefreshCw className="h-4 w-4 mr-2" />
            Làm mới
          </button>
        }
      />

      <section className="card dashboard-actions p-4 sm:p-5" aria-label="Tác vụ nhanh">
        <div className="flex items-center justify-between mb-4"><h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500">Tác vụ nhanh</h2><span className="text-xs text-slate-500 hidden sm:inline">Truy cập công việc hằng ngày</span></div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {quickActions.filter(action => (!action.permission || hasPermission(action.permission)) && (!('readPermissions' in action) || action.readPermissions.some(permission => hasPermission(permission)))).map(action => <Link key={action.to} to={action.to} className="dashboard-action-link">
            <span className="dashboard-action-icon"><action.icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            <span className="min-w-0 text-sm font-medium leading-5">{action.label}</span>
            <ArrowRight className="h-3.5 w-3.5 ml-auto shrink-0 opacity-40 hidden sm:block" aria-hidden="true" />
          </Link>)}
        </div>
      </section>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="card dashboard-kpi p-5 flex justify-between gap-3 transition-all"
            aria-disabled={card.value == null || undefined}
            onClick={event => { if (card.value == null) event.preventDefault(); }}
            tabIndex={card.value == null ? -1 : undefined}
            aria-label={`${card.label}: ${number(card.value)}${card.percent && card.value != null ? '%' : ''}`}
          >
            <div>
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900 mt-2">
                {number(card.value)}
                {card.percent && card.value != null ? '%' : ''}
              </p>
              <p className="text-xs text-slate-500 mt-2">{card.detail}</p>
            </div>
            <span className={`rounded-lg p-2.5 h-fit ${card.color}`}>
              <card.icon className="h-5 w-5" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>

      {data.tasks && (
        <section
          className={`dashboard-health-panel rounded-xl border p-4 shadow-sm ${
            data.tasks.health === 'ATTENTION'
              ? 'border-amber-200 bg-amber-50/70'
              : 'border-emerald-200 bg-emerald-50/70'
          }`}
        >
          <h2 className="font-semibold text-sm">
            Tình hình công việc:{' '}
            {data.tasks.health === 'EMPTY'
              ? 'Chưa có dữ liệu'
              : data.tasks.health === 'ATTENTION'
              ? 'Cần chú ý'
              : 'Đang kiểm soát tốt'}
          </h2>
          <p className="text-sm mt-1 text-slate-700">
            {number(data.tasks.overdue)} công việc quá hạn · {number(data.tasks.unassigned)} công việc đang mở chưa được phân công.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Chỉ báo từ công việc hiện tại; không phải đánh giá hiệu suất nhân sự hay sức khỏe tài chính.
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <section className="card">
          <Heading to="/tasks">Phân bố trạng thái công việc</Heading>
          {!data.tasks ? (
            <Unavailable />
          ) : !data.tasks.total ? (
            <Empty>Chưa có công việc để thống kê.</Empty>
          ) : (
            <div className="p-4 space-y-4">
              {statusRows.map((row) => {
                const count = data.tasks!.byStatus[row.key];
                return (
                  <div key={row.key}>
                    <div className="flex justify-between text-sm mb-1 font-medium">
                      <span>{row.label}</span>
                      <span className="tabular-nums">{number(count)}</span>
                    </div>
                    <div
                      role="meter"
                      aria-label={row.label}
                      aria-valuenow={count}
                      aria-valuemin={0}
                      aria-valuemax={data.tasks!.total}
                      className="h-2 bg-slate-100 rounded-full overflow-hidden"
                    >
                      <div
                        className={`h-full ${row.color} rounded-full transition-all`}
                        style={{ width: `${(count / data.tasks!.total) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-slate-500">Tỷ lệ hoàn thành = số đã hoàn thành / tổng công việc không bị hủy.</p>
            </div>
          )}
        </section>

        {/* Overdue Tasks */}
        <section className="card">
          <Heading to="/tasks">Công việc cần xử lý</Heading>
          {!data.tasks ? (
            <Unavailable />
          ) : !data.tasks.overdueItems.length ? (
            <Empty>Không có công việc đang mở bị quá hạn.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.tasks.overdueItems.map((task) => {
                const daysOverdue = Math.max(1, Math.floor((Date.now() - new Date(task.dueAt).getTime()) / 86400000));
                return (
                  <li key={task.id}>
                    <Link to={`/tasks/${task.id}`} className="block px-4 py-3 hover:bg-slate-50 transition-colors">
                      <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <PriorityBadge priority={task.priority} />
                        <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                          Trễ {daysOverdue} ngày
                        </span>
                        <span className="text-xs text-red-600 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Hạn {time(task.dueAt)}
                        </span>
                        <span className="text-xs text-slate-500 font-medium tabular-nums">{task.progressPercent}%</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {data.tasks?.overdueHasMore && <p className="p-4 text-xs text-slate-500">Hiển thị 5 công việc quá hạn sớm nhất.</p>}
        </section>

        {/* Departments */}
        <section className="card">
          <Heading to="/departments">Thống kê phòng ban</Heading>
          {!data.departments ? (
            <Unavailable />
          ) : !data.departments.items.length ? (
            <Empty>Chưa có phòng ban.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="p-3 font-medium text-slate-600">Phòng ban</th>
                    <th className="p-3 font-medium text-slate-600">Nhân sự</th>
                    <th className="p-3 font-medium text-slate-600">Việc mở</th>
                  </tr>
                </thead>
                <tbody>
                  {data.departments.items.map((department) => (
                    <tr key={department.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="p-3 font-medium text-slate-800">
                        {department.name}
                        {department.status === 'INACTIVE' && (
                          <span className="block text-xs text-slate-400 font-normal">Ngừng hoạt động</span>
                        )}
                      </td>
                      <td
                        className="p-3 tabular-nums text-slate-600"
                        title={department.employeeCount === null ? 'Chưa có quyền xem nhân sự' : undefined}
                      >
                        {number(department.employeeCount)}
                      </td>
                      <td
                        className="p-3 tabular-nums text-slate-600"
                        title={department.openTasks === null ? 'Chưa có quyền xem công việc' : undefined}
                      >
                        {number(department.openTasks)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.departments?.hasMore && (
            <p className="p-4 text-xs text-slate-500">Hiển thị 10 phòng ban; KPI vẫn tính toàn tổ chức.</p>
          )}
        </section>

        {/* Workload */}
        <section className="card">
          <Heading to="/people">Phân bổ công việc theo nhân sự</Heading>
          {!data.workload ? (
            <Unavailable />
          ) : !data.workload.items.length ? (
            <Empty>Chưa có nhân sự được giao công việc đang mở.</Empty>
          ) : (
            <div className="p-4 space-y-3">
              {data.workload.items.map((employee) => (
                <div key={employee.employeeId}>
                  <div className="flex justify-between gap-2 text-sm mb-1">
                    <span className="font-medium text-slate-800">
                      {employee.displayName}
                      {employee.status === 'INACTIVE' ? ' (Ngừng hoạt động)' : ''}
                    </span>
                    <span className="tabular-nums text-slate-600">{number(employee.openTasks)} việc</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-600 rounded-full transition-all"
                      style={{
                        width: `${(employee.openTasks / Math.max(1, data.workload!.items[0].openTasks)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500">
                {data.workload.hasMore ? 'Hiển thị 10 nhân sự có nhiều việc mở nhất. ' : ''}
                Số việc được giao, chưa phản ánh thời lượng hoặc công suất làm việc.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Activity Feed */}
      <section className="card">
        <Heading>Hoạt động tổ chức gần đây</Heading>
        {!data.activity ? (
          <Unavailable />
        ) : !data.activity.items.length ? (
          <Empty>Chưa có hoạt động được ghi nhận.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.activity.items.map((item) => (
              <li key={item.id} className="px-4 py-3 flex justify-between flex-wrap gap-2 text-sm hover:bg-slate-50/50">
                <span className="text-slate-800 font-medium">
                  {activityLabel(item.event)}
                  {item.outcome !== 'SUCCESS' && (
                    <span className="ml-2 text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      {item.outcome === 'DENIED' ? 'Bị từ chối' : 'Không thành công'}
                    </span>
                  )}
                </span>
                <time className="text-xs text-slate-400 tabular-nums" dateTime={item.createdAt}>
                  {time(item.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
        {data.activity?.hasMore && (
          <p className="p-4 text-xs text-slate-500">10 hoạt động gần nhất trong phạm vi bạn được phép xem.</p>
        )}
      </section>
    </div>
  );
}

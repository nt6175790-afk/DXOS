// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, BarChart3 } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { useOrganizationResource } from '@/hooks/useOrganizationResource';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState } from '@/components/ui/ErrorState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { LoadingState } from '@/components/ui/LoadingState';
import { exportReport, getHrOverview, getReportDepartments, type ReportFilters, type ReportKind, type DepartmentReport, type Metrics } from '@/api/reports';
import { amount, count, initialFilters, percent, validRange } from './report-format';
import { ReportChart } from './ReportChart';
import { ReportEntityFilter } from './ReportEntityFilter';

const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50 hover:bg-slate-50';
const names: Record<ReportKind, string> = { workforce: 'Nhân sự', attendance: 'Chấm công', leave: 'Nghỉ phép', payroll: 'Tiền lương', departments: 'Phòng ban' };
function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-slate-900">{title}</h2>{action}</div>{children}</section>;
}
function Stats({ values }: { values: [string, string][] }) {
  return <dl className="grid grid-cols-2 gap-4">{values.map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-lg font-semibold text-slate-900">{value}</dd></div>)}</dl>;
}
function Distribution({ items }: { items: { name: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((r) => r.value));
  return <div className="space-y-3">{items.map((r) => <div key={r.name}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{r.name}</span><span>{count(r.value)}</span></div><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-600" style={{ width: `${r.value / max * 100}%` }} /></div></div>)}</div>;
}
export function ReportsPage() {
  const guard = useOrgBootstrapGuard(), { currentOrg } = useOrganization(), permission = usePermission();
  if (guard) return guard;
  if (permission.isLoading) return <LoadingState message="Đang kiểm tra quyền báo cáo…" />;
  if (permission.error) return <ErrorState error={permission.error} onRetry={permission.refreshPermissions} />;
  if (!permission.hasPermission('report:read')) return <ForbiddenState />;
  return <ReportsWorkspace key={`${currentOrg!.id}:${[...permission.permissions].sort().join(',')}`} org={currentOrg!.id} />;
}
function ReportsWorkspace({ org }: { org: string }) {
  const { hasPermission } = usePermission();
  const [draft, setDraft] = useState<ReportFilters>(initialFilters), [applied, setApplied] = useState<ReportFilters>(initialFilters);
  const [validation, setValidation] = useState('');
  const update = (key: keyof ReportFilters, value: string) => setDraft((q) => ({ ...q, [key]: key === 'dateFrom' || key === 'dateTo' ? value : value || undefined }));
  const select = (key: keyof ReportFilters, label: string, options: [string, string][]) => <label className="block text-xs font-medium text-slate-600">{label}<select className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={draft[key] ?? ''} onChange={(e) => update(key, e.target.value)}>{options.map(([v, name]) => <option key={v} value={v}>{name}</option>)}</select></label>;
  return <div className="space-y-6">
    <PageHeader title={<span className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-brand-600" />Báo cáo & Phân tích</span>} description="Dữ liệu thực của tổ chức • Múi giờ Việt Nam • Không thay đổi nghiệp vụ gốc" />
    <form className="rounded-xl border border-slate-200 bg-white p-4" onSubmit={(e) => { e.preventDefault(); if (!validRange(draft)) { setValidation('Chọn khoảng ngày hợp lệ, tối đa 366 ngày.'); return; } setValidation(''); setApplied({ ...draft }); }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(['dateFrom', 'dateTo'] as const).map((key) => <label key={key} className="text-xs font-medium text-slate-600">{key === 'dateFrom' ? 'Từ ngày' : 'Đến ngày'}<input type="date" required min="1000-01-01" max="9998-12-31" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={draft[key]} onChange={(e) => update(key, e.target.value)} /></label>)}
        {hasPermission('department:read') && <ReportEntityFilter org={org} kind="department" value={draft.departmentId ?? ''} onChange={(id) => update('departmentId', id)} />}
        {hasPermission('employee:read') && <ReportEntityFilter org={org} kind="employee" value={draft.employeeId ?? ''} onChange={(id) => update('employeeId', id)} />}
        {select('interval', 'Nhóm thời gian', [['day', 'Theo ngày'], ['week', 'Theo tuần'], ['month', 'Theo tháng']])}
        {select('employeeStatus', 'Trạng thái nhân viên', [['', 'Tất cả'], ['ACTIVE', 'Đang hoạt động'], ['INACTIVE', 'Ngừng hoạt động']])}
        {hasPermission('attendance:manage') && select('attendanceStatus', 'Trạng thái chấm công', [['', 'Tất cả'], ['PRESENT', 'Có mặt'], ['LATE', 'Đi muộn'], ['ABSENT', 'Vắng mặt'], ['ON_LEAVE', 'Nghỉ phép'], ['INCOMPLETE', 'Chưa hoàn tất']])}
        {hasPermission('leave:approve') && select('leaveStatus', 'Trạng thái nghỉ phép', [['', 'Tất cả'], ['PENDING', 'Chờ duyệt'], ['APPROVED', 'Đã duyệt'], ['REJECTED', 'Từ chối'], ['CANCELLED', 'Đã hủy']])}
        {hasPermission('payroll:read') && select('payrollStatus', 'Trạng thái kỳ lương', [['FINALIZED', 'Đã chốt'], ['APPROVED', 'Đã duyệt'], ['PENDING_APPROVAL', 'Chờ duyệt'], ['CALCULATED', 'Đã tính'], ['PROCESSING', 'Đang tính'], ['DRAFT', 'Nháp'], ['CANCELLED', 'Đã hủy']])}
      </div><div className="mt-4 flex flex-wrap items-center gap-3"><button type="submit" className={`${button} bg-brand-600 text-white hover:bg-brand-700`}>Áp dụng</button><p className="text-xs text-slate-500">Bộ lọc chỉ áp dụng khi bạn nhấn nút. Tuần bắt đầu vào thứ Hai.</p></div>{validation && <p role="alert" className="mt-2 text-sm text-red-600">{validation}</p>}
    </form>
    <ReportResults key={JSON.stringify(applied)} org={org} filters={applied} />
  </div>;
}
function ReportResults({ org, filters }: { org: string; filters: ReportFilters }) {
  const load = useCallback((id: string) => getHrOverview(id, filters), [filters]);
  const { data, error, isLoading, refresh } = useOrganizationResource(load);
  const { hasPermission } = usePermission();
  const [busy, setBusy] = useState<ReportKind | null>(null), [exportError, setExportError] = useState('');
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const download = async (kind: ReportKind) => {
    setBusy(kind); setExportError('');
    try {
      const blob = await exportReport(org, kind, filters); if (!alive.current) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `hr-${kind}-${filters.dateFrom}-${filters.dateTo}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (alive.current) setExportError('Không thể xuất báo cáo. Hãy kiểm tra quyền truy cập và thử lại.'); }
    finally { if (alive.current) setBusy(null); }
  };
  const action = (kind: ReportKind) => hasPermission('report:export') ? <button className={button} disabled={busy !== null} onClick={() => void download(kind)} aria-label={`Xuất CSV ${names[kind]}`}><Download className="h-4 w-4" />{busy === kind ? 'Đang xuất…' : 'CSV'}</button> : null;
  if (isLoading) return <LoadingState message="Đang tổng hợp báo cáo…" />;
  if (error?.error.code === 'FORBIDDEN') return <ForbiddenState />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  if (!data || data.organizationId !== org) return <ErrorState message="Dữ liệu báo cáo không khớp tổ chức hiện tại." onRetry={refresh} />;
  const { workforce: w, attendance: a, leave: l, payroll: p } = data;
  const metric = (m: Metrics, key: string) => count(m[key]);
  return <div className="space-y-6" data-testid="report-results">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Đã áp dụng: {filters.dateFrom} → {filters.dateTo} • Cập nhật {new Date(data.generatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p><button className={button} onClick={refresh}>Làm mới báo cáo</button></div>
    {exportError && <p role="alert" className="text-sm text-red-600">{exportError}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card title="Tổng nhân sự"><p className="text-3xl font-semibold">{count(w?.metrics.total)}</p><p className="mt-2 text-xs text-slate-500">{w ? 'Nhân sự hiện tại theo bộ lọc' : 'Chưa có quyền xem nhân sự'}</p></Card>
      <Card title="Tỷ lệ tham dự ca"><p className="text-3xl font-semibold">{percent(a?.metrics.attendanceRate)}</p><p className="mt-2 text-xs text-slate-500">{a ? 'Số ca có mặt / ca làm đã phân; cần quyền xem phân ca' : 'Cần quyền quản lý chấm công'}</p></Card>
      <Card title="Đơn nghỉ phép"><p className="text-3xl font-semibold">{count(l?.metrics.total)}</p><p className="mt-2 text-xs text-slate-500">{l ? 'Theo ngày bắt đầu nghỉ' : 'Cần quyền duyệt nghỉ phép'}</p></Card>
      {p && <Card title="Tổng lương thực nhận">{p.currencies.length ? p.currencies.map((c) => <p key={c.currency} className="break-words text-xl font-semibold">{amount(c.net, c.currency)}</p>) : <p className="text-sm text-slate-500">Chưa có bảng lương phù hợp</p>}<p className="mt-2 text-xs text-slate-500">Theo ngày kết thúc kỳ; từng loại tiền tệ</p></Card>}
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      {w && <Card title="Cơ cấu nhân sự" action={action('workforce')}><Distribution items={[{ name: 'Đang hoạt động', value: w.metrics.active ?? 0 }, { name: 'Ngừng hoạt động', value: w.metrics.inactive ?? 0 }, { name: 'Chưa có phòng ban', value: w.metrics.unassigned ?? 0 }]} /><p className="mt-4 text-xs text-slate-500">Hiện trạng tại lúc xem; hệ thống chưa lưu lịch sử biến động nhân sự.</p><h3 className="mt-5 text-sm font-medium">Hồ sơ nhân viên được tạo mới</h3><ReportChart title="Hồ sơ mới" points={w.trend.map((r) => ({ label: r.bucket, value: r.metrics.newEmployeeRecords ?? 0 }))} /></Card>}
      {a && <Card title="Chấm công" action={action('attendance')}><Stats values={[[ 'Bản ghi', metric(a.metrics, 'total') ], ['Tỷ lệ đi muộn', percent(a.metrics.lateRate)], ['Đi muộn / về sớm', `${metric(a.metrics, 'late')} / ${metric(a.metrics, 'earlyLeave')}`], ['Giờ làm đã ghi nhận', count(a.metrics.workedMinutes == null ? null : a.metrics.workedMinutes / 60)], ['Giờ trung bình / bản ghi hoàn tất', count(a.metrics.averageWorkedMinutes == null ? null : a.metrics.averageWorkedMinutes / 60)], ['Vắng mặt / nghỉ theo lịch', `${metric(a.metrics, 'absent')} / ${metric(a.metrics, 'offDays')}`], ['Ca dự kiến / ca có mặt', `${metric(a.metrics, 'plannedDays')} / ${metric(a.metrics, 'attendedPlannedDays')}`]]} /><ReportChart title="Xu hướng chấm công" points={a.trend.map((r) => ({ label: r.bucket, value: r.metrics.total ?? 0 }))} /><p className="text-xs text-slate-500">Dùng phút công đã lưu. Không suy diễn vắng mặt từ bản ghi thiếu. Mẫu số ca không chịu bộ lọc trạng thái chấm công.</p></Card>}
      {l && <Card title="Nghỉ phép" action={action('leave')}><Distribution items={[['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối'], ['cancelled', 'Đã hủy']].map(([key, name]) => ({ name, value: l.metrics[key] ?? 0 }))} /><p className="mt-4 text-sm">Tổng ngày: {metric(l.metrics, 'days')} • Ngày đã duyệt: {metric(l.metrics, 'approvedDays')}</p><ReportChart title="Xu hướng nghỉ phép" points={l.trend.map((r) => ({ label: r.bucket, value: r.metrics.total ?? 0 }))} /><p className="text-xs text-slate-500">Toàn bộ ngày nghỉ của đơn được tính vào ngày bắt đầu; không phân bổ lại theo khoảng lọc.</p></Card>}
      {p && <Card title="Tổng hợp tiền lương" action={action('payroll')}><Stats values={[[ 'Kỳ lương', count(p.periods)], ['Nhân viên', count(p.employees)], ['Bảng lương', count(p.records)]]} />
        {!p.currencies.length ? <p className="py-6 text-sm text-slate-500">Chưa có dữ liệu lương trong khoảng đã chọn.</p> : p.currencies.map((c) => <div key={c.currency} className="mt-5 border-t pt-4"><h3 className="mb-3 font-medium">{c.currency}</h3><Stats values={[[ 'Tổng trước khấu trừ', amount(c.gross, c.currency)], ['Thực nhận', amount(c.net, c.currency)], ['Trung bình / bảng lương', amount(c.averageNet, c.currency)]]} /><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left">Xu hướng lương {c.currency}</caption><thead><tr><th>Nhóm thời gian</th><th className="text-right">Thực nhận</th></tr></thead><tbody>{p.trend.map((r) => { const v = r.currencies.find((m) => m.currency === c.currency); return v ? <tr key={r.bucket}><td className="py-2">{r.bucket}</td><td className="text-right">{amount(v.net, c.currency)}</td></tr> : null; })}</tbody></table></div></div>)}<p className="mt-3 text-xs text-slate-500">Không cộng gộp các loại tiền tệ. Không tính lại hoặc thay đổi bảng lương đã chốt.</p></Card>}
      {data.performance.available && data.performance.metrics && <Card title="Hiệu suất nhân sự"><Stats values={[[ 'Đánh giá', metric(data.performance.metrics, 'reviews')], ['Đã hoàn tất', metric(data.performance.metrics, 'completedReviews')], ['Tỷ lệ hoàn tất (trừ đã hủy)', percent(data.performance.metrics.completionRate)], ['Điểm hoàn tất trung bình', metric(data.performance.metrics, 'averageCompletedRating')], ...('goals' in data.performance.metrics ? [['Mục tiêu đã xong / tổng', `${metric(data.performance.metrics, 'completedGoals')} / ${metric(data.performance.metrics, 'goals')}`], ['Tiến độ mục tiêu trung bình', percent(data.performance.metrics.averageGoalProgress)]] as [string, string][] : []), ...('kpis' in data.performance.metrics ? [['Chỉ số KPI', metric(data.performance.metrics, 'kpis')], ['Điểm KPI trung bình', metric(data.performance.metrics, 'averageKpiScore')]] as [string, string][] : [])]} /><p className="mt-4 text-xs text-slate-500">Theo ngày kết thúc chu kỳ. Chỉ điểm đánh giá hoàn tất; không hiển thị nhận xét riêng tư.</p></Card>}
    </div>
    {data.departments && <Card title="Thống kê phòng ban" action={action('departments')}><DepartmentTable org={org} filters={filters} initial={data.departments} showPayroll={p !== null} /></Card>}
    {!w && !a && !l && !p && !data.departments && !data.performance.available && <p className="rounded-xl border p-6 text-sm text-slate-500">Bạn có quyền mở báo cáo nhưng chưa có quyền đọc các nguồn dữ liệu. Liên hệ người quản lý quyền của tổ chức.</p>}
  </div>;
}
function DepartmentTable({ org, filters, initial, showPayroll }: { org: string; filters: ReportFilters; initial: DepartmentReport; showPayroll: boolean }) {
  const [page, setPage] = useState(initial), [loading, setLoading] = useState(false), [error, setError] = useState(false);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const next = async () => { if (!page.nextCursor) return; setLoading(true); setError(false); try { const p = await getReportDepartments(org, filters, page.nextCursor); if (alive.current) setPage(p); } catch { if (alive.current) setError(true); } finally { if (alive.current) setLoading(false); } };
  if (!page.items.length) return <p className="text-sm text-slate-500">Chưa có phòng ban phù hợp.</p>;
  return <div><p className="mb-4 text-xs text-slate-500">Phân trang theo phòng ban hiện tại. Nhân viên chưa có phòng ban được đếm riêng ở phần nhân sự. Dấu — nghĩa là thiếu quyền hoặc không có mẫu số.</p>
    <Distribution items={page.items.map((r) => ({ name: r.name, value: r.workforce.total ?? 0 }))} />
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><caption className="sr-only">Bảng thống kê phòng ban</caption><thead className="bg-slate-50"><tr>{['Phòng ban', 'Nhân viên', 'Bản ghi công', 'Đi muộn', 'Đơn nghỉ', ...(showPayroll ? ['Thực nhận'] : [])].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{page.items.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="max-w-64 break-words p-3">{r.name}</td><td className="p-3">{count(r.workforce.total)}</td><td className="p-3">{r.attendance ? count(r.attendance.total ?? 0) : '—'}</td><td className="p-3">{r.attendance ? count(r.attendance.late ?? 0) : '—'}</td><td className="p-3">{r.leave ? count(r.leave.total ?? 0) : '—'}</td>{showPayroll && <td className="p-3">{r.payroll?.length ? r.payroll.map((c) => <p key={c.currency}>{amount(c.net, c.currency)}</p>) : '—'}</td>}</tr>)}</tbody></table></div>
    <div className="mt-4 flex gap-2">{page !== initial && <button className={button} onClick={() => setPage(initial)} disabled={loading}>Trang đầu</button>}{page.nextCursor && <button className={button} onClick={() => void next()} disabled={loading}>{loading ? 'Đang tải…' : 'Trang phòng ban tiếp'}</button>}</div>{error && <p role="alert" className="mt-2 text-sm text-red-600">Không tải được trang phòng ban. Hãy thử lại.</p>}
  </div>;
}

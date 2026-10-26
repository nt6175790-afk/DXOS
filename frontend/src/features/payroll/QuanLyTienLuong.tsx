// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DollarSign,
  Plus,
  Calendar,
  Eye,
  CheckCircle2,
  Clock,
  Lock,
  Search,
  Building,
  User,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { payrollApi } from '@/api/payroll';
import type { PayrollPeriod, PayrollRecord } from '@/api/types';
import { CreatePayrollPeriodModal } from './CreatePayrollPeriodModal';
import { PayrollPeriodDetailModal } from './PayrollPeriodDetailModal';
import { PayrollRecordDetailModal } from './PayrollRecordDetailModal';

type TabKey = 'periods' | 'records' | 'my-payroll';

export function PayrollPage() {
  const { currentOrg } = useOrganization();
  const { hasPermission } = usePermission();
  const orgId = currentOrg?.id || '';

  const canManage = hasPermission('payroll:create');

  const [activeTab, setActiveTab] = useState<TabKey>('periods');
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [myRecords, setMyRecords] = useState<PayrollRecord[]>([]);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPeriodForDetail, setSelectedPeriodForDetail] = useState<PayrollPeriod | null>(null);
  const [selectedRecordForPayslip, setSelectedRecordForPayslip] = useState<PayrollRecord | null>(null);

  // States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all periods
  const fetchPeriods = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await payrollApi.listPeriods(orgId);
      setPeriods(data);
      if (data.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(data[0].id);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể tải danh sách kỳ lương';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, selectedPeriodId]);

  // Fetch records for selected period
  const fetchRecords = useCallback(async (periodId: string) => {
    if (!orgId || !periodId) return;
    try {
      const data = await payrollApi.listRecords(orgId, periodId);
      setRecords(data);
    } catch (err: unknown) {
      console.error('Failed to load period records:', err);
    }
  }, [orgId]);

  // Fetch my payroll
  const fetchMyPayroll = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await payrollApi.getMyPayroll(orgId);
      setMyRecords(data);
    } catch (err: unknown) {
      console.error('Failed to load my payroll:', err);
    }
  }, [orgId]);

  useEffect(() => {
    fetchPeriods();
    fetchMyPayroll();
  }, [fetchPeriods, fetchMyPayroll]);

  useEffect(() => {
    if (selectedPeriodId) {
      fetchRecords(selectedPeriodId);
    }
  }, [selectedPeriodId, fetchRecords]);

  // KPIs
  const latestPeriod = periods[0] || null;
  const totalEmployees = latestPeriod?.employeeCount || 0;
  const totalGross = latestPeriod?.totalGross || 0;
  const totalNet = latestPeriod?.totalNet || 0;

  const formatMoney = (val?: number | string) => {
    return Number(val || 0).toLocaleString('vi-VN') + ' đ';
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const lower = searchTerm.toLowerCase();
    return records.filter(
      (r) =>
        r.employee?.displayName?.toLowerCase().includes(lower) ||
        r.employee?.employeeCode?.toLowerCase().includes(lower) ||
        r.employee?.department?.name?.toLowerCase().includes(lower)
    );
  }, [records, searchTerm]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <DollarSign className="w-7 h-7 text-emerald-600" />
            Quản lý Tiền lương & Đãi ngộ
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Hệ thống tính lương tự động, tích hợp dữ liệu chấm công, nghỉ phép và ca làm việc
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Tạo kỳ lương mới
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kỳ lương gần nhất</p>
            <h3 className="text-lg font-bold text-slate-900 mt-1 truncate max-w-[150px]">
              {latestPeriod ? latestPeriod.name : '--'}
            </h3>
            <span className="text-xs text-slate-400">
              {latestPeriod ? latestPeriod.status : 'Chưa có kỳ lương'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nhân viên tính lương</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalEmployees}</h3>
            <span className="text-xs text-slate-400">Trong kỳ hiện tại</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
            <User className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng thu nhập Gross</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatMoney(totalGross)}</h3>
            <span className="text-xs text-slate-400">Trước khấu trừ</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng thực nhận Net</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{formatMoney(totalNet)}</h3>
            <span className="text-xs text-emerald-700 font-medium">Thực chi doanh nghiệp</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-slate-200 bg-slate-50/50 px-6 flex gap-8">
          <button
            onClick={() => setActiveTab('periods')}
            className={`py-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'periods'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Danh sách Kỳ lương ({periods.length})
          </button>

          <button
            onClick={() => setActiveTab('records')}
            className={`py-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'records'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            Bảng lương chi tiết
          </button>

          <button
            onClick={() => setActiveTab('my-payroll')}
            className={`py-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'my-payroll'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Lương của tôi ({myRecords.length})
          </button>
        </div>

        {/* Tab 1: Periods */}
        {activeTab === 'periods' && (
          <div className="p-6">
            {isLoading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Đang tải danh sách kỳ lương...</div>
            ) : error ? (
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : periods.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-800">Chưa có kỳ lương nào</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  Hãy bắt đầu bằng cách nhấn nút &quot;Tạo kỳ lương mới&quot; để thiết lập kỳ tính lương.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Tên kỳ lương</th>
                      <th className="py-3 px-4">Khoảng thời gian</th>
                      <th className="py-3 px-4 text-center">Số NV</th>
                      <th className="py-3 px-4 text-right">Tổng Gross</th>
                      <th className="py-3 px-4 text-right">Tổng Net</th>
                      <th className="py-3 px-4">Trạng thái</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {periods.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {p.name}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 text-xs">
                          {p.periodStart.slice(0, 10)} → {p.periodEnd.slice(0, 10)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium text-slate-700">
                          {p.employeeCount}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-800">
                          {formatMoney(p.totalGross)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                          {formatMoney(p.totalNet)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            p.status === 'FINALIZED'
                              ? 'bg-slate-900 text-white'
                              : p.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : p.status === 'PENDING_APPROVAL'
                              ? 'bg-amber-100 text-amber-700'
                              : p.status === 'CALCULATED'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {p.status === 'FINALIZED' && 'Đã chốt sổ'}
                            {p.status === 'APPROVED' && 'Đã duyệt'}
                            {p.status === 'PENDING_APPROVAL' && 'Chờ duyệt'}
                            {p.status === 'CALCULATED' && 'Đã tính'}
                            {p.status === 'DRAFT' && 'Nháp'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedPeriodForDetail(p)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Chi tiết / Quản lý
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Records */}
        {activeTab === 'records' && (
          <div className="p-6 space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Chọn kỳ lương:
                </span>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium text-slate-800"
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm nhân viên, mã NV, phòng ban..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Records Table */}
            {records.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                Kỳ lương này chưa có bảng lương nào được tính toán.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Nhân viên</th>
                      <th className="py-3 px-4">Phòng ban</th>
                      <th className="py-3 px-4 text-right">Lương cơ bản</th>
                      <th className="py-3 px-4 text-center">Công chuẩn</th>
                      <th className="py-3 px-4 text-center">Công thực tế</th>
                      <th className="py-3 px-4 text-right">Gross</th>
                      <th className="py-3 px-4 text-right">Thực nhận (Net)</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div>{r.employee?.displayName}</div>
                          <span className="text-xs text-slate-400 font-normal">{r.employee?.employeeCode}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 text-xs">
                          {r.employee?.department?.name || '--'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-800">
                          {formatMoney(r.baseSalary)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium text-slate-700">
                          {Number(r.workingDays).toFixed(1)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-emerald-700">
                          {Number(r.workedDays).toFixed(1)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                          {formatMoney(r.grossAmount)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-emerald-700">
                          {formatMoney(r.netAmount)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedRecordForPayslip(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-md transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Xem phiếu lương
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: My Payroll */}
        {activeTab === 'my-payroll' && (
          <div className="p-6">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Lịch sử phiếu lương cá nhân của bạn ({myRecords.length})
            </h4>

            {myRecords.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                Bạn chưa có phiếu lương nào được duyệt hoặc chốt sổ.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-5 rounded-xl border border-slate-200 bg-white hover:border-brand-300 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Đã phê duyệt
                        </span>
                        <span className="text-xs text-slate-400">
                          {rec.createdAt ? rec.createdAt.slice(0, 10) : ''}
                        </span>
                      </div>
                      <h4 className="text-lg font-bold text-slate-900">
                        Phiếu lương ({rec.createdAt ? rec.createdAt.slice(0, 7) : ''})
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Công thực tế: <strong>{Number(rec.workedDays).toFixed(1)}</strong> / {Number(rec.workingDays).toFixed(1)} ngày
                      </p>
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <span className="text-xs text-slate-500 block">Thực nhận (Net):</span>
                        <span className="text-2xl font-black text-emerald-700 mt-0.5 block">
                          {formatMoney(rec.netAmount)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedRecordForPayslip(rec)}
                      className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Chi tiết thu nhập & khấu trừ
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreatePayrollPeriodModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={fetchPeriods}
      />

      <PayrollPeriodDetailModal
        isOpen={Boolean(selectedPeriodForDetail)}
        onClose={() => setSelectedPeriodForDetail(null)}
        period={selectedPeriodForDetail}
        onRefresh={fetchPeriods}
      />

      <PayrollRecordDetailModal
        isOpen={Boolean(selectedRecordForPayslip)}
        onClose={() => setSelectedRecordForPayslip(null)}
        record={selectedRecordForPayslip}
      />
    </div>
  );
}

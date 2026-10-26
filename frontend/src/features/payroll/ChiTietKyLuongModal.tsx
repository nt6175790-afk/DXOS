// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Calculator,
  Send,
  Lock,
  Calendar,
  DollarSign,
  AlertCircle,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { useOrganization } from '@/contexts/OrganizationContext';
import { payrollApi } from '@/api/payroll';
import type { PayrollPeriod, PayrollRecord } from '@/api/types';
import { PayrollRecordDetailModal } from './PayrollRecordDetailModal';

interface PayrollPeriodDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  period: PayrollPeriod | null;
  onRefresh: () => void;
}

export function PayrollPeriodDetailModal({
  isOpen,
  onClose,
  period,
  onRefresh,
}: PayrollPeriodDetailModalProps) {
  const { currentOrg } = useOrganization();
  const { hasPermission } = usePermission();
  const canCalculate = hasPermission('payroll:calculate');
  const canFinalize = hasPermission('payroll:finalize');
  const orgId = currentOrg?.id || '';

  const [currentPeriod, setCurrentPeriod] = useState<PayrollPeriod | null>(period);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!period || !orgId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [updatedPeriod, recordsRes] = await Promise.all([
        payrollApi.getPeriod(orgId, period.id),
        payrollApi.listRecords(orgId, period.id),
      ]);
      setCurrentPeriod(updatedPeriod);
      setRecords(recordsRes);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể tải chi tiết kỳ lương';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, period]);

  useEffect(() => {
    if (isOpen && period) {
      setCurrentPeriod(period);
      fetchDetails();
    }
  }, [isOpen, period, fetchDetails]);

  if (!isOpen || !currentPeriod) return null;

  const handleCalculate = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await payrollApi.calculatePeriod(orgId, currentPeriod.id);
      setCurrentPeriod(updated);
      setSuccessMsg('Tính lương thành công! Dữ liệu ngày công và tiền lương đã được cập nhật.');
      fetchDetails();
      onRefresh();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể tính toán lương';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestApproval = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await payrollApi.requestApproval(orgId, currentPeriod.id, {
        reason: `Yêu cầu phê duyệt bảng lương ${currentPeriod.name}`,
      });
      setCurrentPeriod(updated);
      setSuccessMsg('Đã gửi yêu cầu phê duyệt thành công vào Hộp thư phê duyệt chung!');
      fetchDetails();
      onRefresh();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể gửi yêu cầu duyệt';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn chốt sổ kỳ lương này? Sau khi chốt, dữ liệu sẽ bất biến và không thể sửa đổi.')) {
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await payrollApi.finalizePeriod(orgId, currentPeriod.id, {});
      setCurrentPeriod(updated);
      setSuccessMsg('Kỳ lương đã được chốt sổ (FINALIZED) thành công!');
      fetchDetails();
      onRefresh();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể chốt sổ kỳ lương';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const formatMoney = (val?: number | string) => {
    return Number(val || 0).toLocaleString('vi-VN') + ' đ';
  };

  return (
    <>
      <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-4xl w-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-5 h-5 text-brand-600" />
                <h3 className="text-base font-semibold text-slate-900">{currentPeriod.name}</h3>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  currentPeriod.status === 'FINALIZED'
                    ? 'bg-slate-900 text-white'
                    : currentPeriod.status === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : currentPeriod.status === 'PENDING_APPROVAL'
                    ? 'bg-amber-100 text-amber-700'
                    : currentPeriod.status === 'CALCULATED'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {currentPeriod.status === 'FINALIZED' && 'Đã chốt sổ (Khóa)'}
                  {currentPeriod.status === 'APPROVED' && 'Đã phê duyệt'}
                  {currentPeriod.status === 'PENDING_APPROVAL' && 'Chờ phê duyệt'}
                  {currentPeriod.status === 'CALCULATED' && 'Đã tính toán'}
                  {currentPeriod.status === 'DRAFT' && 'Nháp'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Chu kỳ: {currentPeriod.periodStart.slice(0, 10)} đến {currentPeriod.periodEnd.slice(0, 10)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Alerts */}
          {error && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* KPI Summary Cards */}
          <div className="p-6 border-b border-slate-200 bg-white grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs text-slate-500 font-medium">Nhân viên tính lương</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{currentPeriod.employeeCount} người</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs text-slate-500 font-medium">Tổng thu nhập Gross</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{formatMoney(currentPeriod.totalGross)}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
              <span className="text-xs text-emerald-700 font-medium">Tổng thực nhận Net</span>
              <p className="text-xl font-bold text-emerald-700 mt-1">{formatMoney(currentPeriod.totalNet)}</p>
            </div>
            <div className="flex flex-col justify-center gap-2">
              {/* Contextual Actions */}
              {canCalculate && (currentPeriod.status === 'DRAFT' || currentPeriod.status === 'CALCULATED') && (
                <button
                  onClick={handleCalculate}
                  disabled={actionLoading}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  {currentPeriod.status === 'CALCULATED' ? 'Tính toán lại' : 'Tính lương'}
                </button>
              )}

              {canCalculate && currentPeriod.status === 'CALCULATED' && (
                <button
                  onClick={handleRequestApproval}
                  disabled={actionLoading}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 rounded-lg transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Gửi phê duyệt
                </button>
              )}

              {canFinalize && currentPeriod.status === 'APPROVED' && (
                <button
                  onClick={handleFinalize}
                  disabled={actionLoading}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-black disabled:opacity-50 rounded-lg shadow-sm transition-colors"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Chốt sổ kỳ lương
                </button>
              )}

              {currentPeriod.status === 'FINALIZED' && (
                <div className="flex items-center justify-center gap-1 text-xs text-slate-500 font-medium py-1">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Đã đóng sổ bất biến
                </div>
              )}
            </div>
          </div>

          {/* Records Table */}
          <div className="p-6 max-h-[50vh] overflow-y-auto">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Danh sách bảng lương nhân viên ({records.length})
            </h4>

            {isLoading ? (
              <div className="py-8 text-center text-slate-400 text-sm">Đang tải bảng lương...</div>
            ) : records.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">Chưa có bảng lương được tính</p>
                <p className="text-xs text-slate-400 mt-1">
                  Nhấn nút &quot;Tính lương&quot; để tổng hợp công và tiền lương cho nhân viên có hồ sơ đãi ngộ.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Nhân viên</th>
                      <th className="py-2.5 px-3">Lương cơ bản</th>
                      <th className="py-2.5 px-3 text-center">Chuẩn</th>
                      <th className="py-2.5 px-3 text-center">Thực tế</th>
                      <th className="py-2.5 px-3 text-center">Nghỉ phép</th>
                      <th className="py-2.5 px-3 text-right">Thực nhận</th>
                      <th className="py-2.5 px-3 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">{r.employee?.displayName}</div>
                          <div className="text-xs text-slate-500">{r.employee?.employeeCode} • {r.employee?.department?.name || 'Chưa gán'}</div>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800">
                          {formatMoney(r.baseSalary)}
                        </td>
                        <td className="py-3 px-3 text-center font-medium text-slate-700">
                          {Number(r.workingDays).toFixed(1)}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-emerald-700">
                          {Number(r.workedDays).toFixed(1)}
                        </td>
                        <td className="py-3 px-3 text-center text-xs">
                          <span className="text-purple-700 font-medium">{Number(r.paidLeaveDays).toFixed(1)} có lương</span>
                          {Number(r.unpaidLeaveDays) > 0 && (
                            <span className="text-amber-700 block">{Number(r.unpaidLeaveDays).toFixed(1)} không lương</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700">
                          {formatMoney(r.netAmount)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => setSelectedRecord(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-md transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Phiếu lương
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-slate-200 bg-slate-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      {/* Payslip Modal */}
      {selectedRecord && (
        <PayrollRecordDetailModal
          isOpen={Boolean(selectedRecord)}
          onClose={() => setSelectedRecord(null)}
          record={selectedRecord}
          periodName={currentPeriod.name}
        />
      )}
    </>
  );
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { X, User, Building, Calendar, DollarSign, FileText } from 'lucide-react';
import type { PayrollRecord } from '@/api/types';

interface PayrollRecordDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: PayrollRecord | null;
  periodName?: string;
}

export function PayrollRecordDetailModal({
  isOpen,
  onClose,
  record,
  periodName,
}: PayrollRecordDetailModalProps) {
  if (!isOpen || !record) return null;

  const formatMoney = (val?: number | string) => {
    return Number(val || 0).toLocaleString('vi-VN') + ' đ';
  };

  const formatDays = (val?: number | string) => {
    return Number(val || 0).toFixed(1);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Phiếu lương chi tiết</h3>
              <p className="text-xs text-slate-500">{periodName || 'Kỳ lương'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Employee Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-lg">
              {record.employee?.displayName?.[0] || 'E'}
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 text-base flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                {record.employee?.displayName}
              </h4>
              <p className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                <span>Mã NV: <strong className="text-slate-700">{record.employee?.employeeCode}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  {record.employee?.department?.name || 'Chưa gán phòng ban'}
                </span>
                <span>•</span>
                <span>{record.employee?.jobTitle || 'Nhân viên'}</span>
              </p>
            </div>
          </div>

          {/* Working Days & Attendance Metrics */}
          <div>
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              Tổng hợp công và ngày nghỉ trong kỳ
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                <span className="text-xs text-slate-500 block">Ngày công chuẩn:</span>
                <span className="text-base font-bold text-slate-800">{formatDays(record.workingDays)} ngày</span>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg shadow-sm">
                <span className="text-xs text-emerald-700 block">Công thực tế:</span>
                <span className="text-base font-bold text-emerald-800">{formatDays(record.workedDays)} ngày</span>
              </div>
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg shadow-sm">
                <span className="text-xs text-purple-700 block">Nghỉ hưởng lương:</span>
                <span className="text-base font-bold text-purple-800">{formatDays(record.paidLeaveDays)} ngày</span>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg shadow-sm">
                <span className="text-xs text-amber-700 block">Nghỉ không lương:</span>
                <span className="text-base font-bold text-amber-800">{formatDays(record.unpaidLeaveDays)} ngày</span>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg shadow-sm">
                <span className="text-xs text-rose-700 block">Vắng mặt:</span>
                <span className="text-base font-bold text-rose-800">{formatDays(record.absentDays)} ngày</span>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg shadow-sm">
                <span className="text-xs text-blue-700 block">Tăng ca (phút):</span>
                <span className="text-base font-bold text-blue-800">{record.overtimeMinutes} phút</span>
              </div>
            </div>
          </div>

          {/* Salary Breakdown */}
          <div>
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-400" />
              Chi tiết các khoản thu nhập & khấu trừ
            </h5>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Khoản mục</th>
                    <th className="py-2.5 px-4">Loại</th>
                    <th className="py-2.5 px-4">Số lượng / Ghi chú</th>
                    <th className="py-2.5 px-4 text-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/30">
                    <td className="py-3 px-4 font-medium text-slate-900">Lương cơ bản thỏa thuận</td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-500">Mức đóng/hợp đồng</td>
                    <td className="py-3 px-4 text-xs text-slate-500">Theo hợp đồng</td>
                    <td className="py-3 px-4 text-right font-medium text-slate-900">
                      {formatMoney(record.baseSalary)}
                    </td>
                  </tr>

                  {record.items && record.items.length > 0 ? (
                    record.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-medium text-slate-800">{item.name}</td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                            item.type === 'EARNING' || item.type === 'ALLOWANCE' || item.type === 'BONUS'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500">
                          {item.quantity ? `${Number(item.quantity).toFixed(1)} ${item.unit || ''}` : '--'}
                          {item.notes ? ` (${item.notes})` : ''}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-900">
                          {formatMoney(item.amount)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-3 px-4 text-center text-slate-400 text-xs">
                        Chưa có khoản mục chi tiết
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={3} className="py-3 px-4 font-semibold text-slate-700 text-right">
                      Tổng thu nhập Gross:
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 text-base">
                      {formatMoney(record.grossAmount)}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-200 bg-emerald-50/60">
                    <td colSpan={3} className="py-3.5 px-4 font-bold text-emerald-800 text-right">
                      THỰC NHẬN (NET AMOUNT):
                    </td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-emerald-700 text-lg">
                      {formatMoney(record.netAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
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
  );
}

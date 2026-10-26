// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useId } from 'react';
import { X, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { createLeaveRequest, LeaveType } from '@/api/leave';
import type { Employee } from '@/api/types';
import { useToast } from '@/contexts/ToastContext';

interface CreateLeaveModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentEmployee: Pick<Employee, 'id' | 'employeeCode' | 'displayName'> | null;
  orgId: string;
}

export function CreateLeaveModal({
  open,
  onClose,
  onSuccess,
  currentEmployee,
  orgId,
}: CreateLeaveModalProps) {
  const { showToast } = useToast();
  const titleId = useId();

  // Default dates: tomorrow 08:00 to 17:00
  const [leaveType, setLeaveType] = useState<LeaveType>('ANNUAL');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const now = new Date();
      // Format as YYYY-MM-DDThh:mm
      const pad = (n: number) => n.toString().padStart(2, '0');
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const startStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T08:00`;
      const endStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T17:00`;

      setStartsAt(startStr);
      setEndsAt(endStr);
      setLeaveType('ANNUAL');
      setReason('');
      setErrorMessage(null);
    }
  }, [open]);

  if (!open) return null;

  // Estimated days preview calculation
  let estimatedDays = 0;
  if (startsAt && endsAt) {
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    if (e.getTime() > s.getTime()) {
      const hours = (e.getTime() - s.getTime()) / (3600 * 1000);
      const sDay = Math.floor(s.getTime() / (86400 * 1000));
      const eDay = Math.floor(e.getTime() / (86400 * 1000));
      if (sDay === eDay) {
        estimatedDays = hours <= 5 ? 0.5 : 1.0;
      } else {
        estimatedDays = Math.max(1, eDay - sDay + 1);
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmployee) {
      setErrorMessage('Không tìm thấy thông tin nhân viên của bạn trong tổ chức.');
      return;
    }

    if (!startsAt || !endsAt) {
      setErrorMessage('Vui lòng chọn thời gian bắt đầu và kết thúc.');
      return;
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (endDate.getTime() <= startDate.getTime()) {
      setErrorMessage('Thời gian kết thúc phải sau thời gian bắt đầu.');
      return;
    }

    if (!reason.trim()) {
      setErrorMessage('Vui lòng nhập lý do nghỉ phép.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Send ISO timestamps
      await createLeaveRequest(orgId, {
        employeeId: currentEmployee.id,
        leaveType,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        reason: reason.trim(),
      });

      showToast('Gửi đơn nghỉ phép thành công!', 'success');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { error?: { message?: string }; response?: { data?: { error?: { message?: string }; message?: string } }; message?: string };
      const msg =
        axiosErr?.error?.message ||
        axiosErr?.response?.data?.error?.message ||
        axiosErr?.response?.data?.message ||
        axiosErr?.message ||
        'Không thể gửi đơn nghỉ phép. Vui lòng kiểm tra lại.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isSubmitting) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-slate-800">
                Tạo đơn nghỉ phép
              </h2>
              <p className="text-xs text-slate-500">
                Gửi yêu cầu nghỉ phép đến người quản lý
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Đóng modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Current employee info */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 flex justify-between items-center">
            <span>
              Người xin nghỉ:{' '}
              <strong className="text-slate-800">
                {currentEmployee?.displayName || 'Đang tải...'}
              </strong>
            </span>
            <span className="text-slate-500">
              Mã NV: {currentEmployee?.employeeCode || 'N/A'}
            </span>
          </div>

          {/* Leave Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Loại nghỉ phép <span className="text-red-500">*</span>
            </label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            >
              <option value="ANNUAL">Nghỉ phép năm (Annual Leave)</option>
              <option value="SICK">Nghỉ ốm (Sick Leave)</option>
              <option value="PERSONAL">Việc riêng (Personal Leave)</option>
              <option value="UNPAID">Nghỉ không lương (Unpaid Leave)</option>
              <option value="OTHER">Nghỉ khác (Other)</option>
            </select>
          </div>

          {/* From - To dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Từ ngày giờ <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Đến ngày giờ <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
          </div>

          {/* Days count estimation helper */}
          {estimatedDays > 0 && (
            <div className="text-xs text-indigo-700 bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-100 flex items-center justify-between">
              <span>Số ngày công dự kiến:</span>
              <strong className="text-sm font-semibold">{estimatedDays} ngày</strong>
            </div>
          )}

          {/* Reason */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-sm font-medium text-slate-700">
                Lý do nghỉ phép <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-slate-400">
                {reason.length} / 500
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              placeholder="Nhập lý do nghỉ phép và kế hoạch bàn giao công việc..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              required
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim() || !startsAt || !endsAt}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Gửi đơn</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

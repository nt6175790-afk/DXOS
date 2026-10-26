// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useId } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { approveLeaveRequest, rejectLeaveRequest, cancelLeaveRequest, LeaveRequest } from '@/api/leave';
import { useToast } from '@/contexts/ToastContext';

interface ActionModalProps {
  leave: LeaveRequest | null;
  orgId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ApproveModal({ leave, orgId, onClose, onSuccess }: ActionModalProps) {
  const { showToast } = useToast();
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  if (!leave) return null;

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await approveLeaveRequest(orgId, leave.id, { note: note.trim() || undefined });
      showToast('Đã phê duyệt đơn nghỉ phép thành công!', 'success');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setError(axiosErr?.response?.data?.error?.message || axiosErr?.message || 'Có lỗi xảy ra khi phê duyệt.');
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
      onKeyDown={(e) => e.key === 'Escape' && !isSubmitting && onClose()}
    >
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-emerald-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle className="w-5 h-5" />
            </div>
            <h2 id={titleId} className="text-base font-semibold text-slate-800">
              Phê duyệt đơn nghỉ phép
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleApprove} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
            <p>
              Nhân viên: <strong className="text-slate-800">{leave.employee.displayName}</strong> ({leave.employee.employeeCode})
            </p>
            <p>
              Thời gian nghỉ: <strong>{leave.daysCount} ngày</strong>
            </p>
            <p className="text-xs text-slate-500">Lý do: &ldquo;{leave.reason}&rdquo;</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ghi chú phê duyệt (không bắt buộc)
            </label>
            <input
              type="text"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              placeholder="VD: Đồng ý bàn giao công việc..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Xác nhận duyệt</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RejectModal({ leave, orgId, onClose, onSuccess }: ActionModalProps) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  if (!leave) return null;

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do từ chối.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await rejectLeaveRequest(orgId, leave.id, { reason: reason.trim() });
      showToast('Đã từ chối đơn nghỉ phép.', 'info');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setError(axiosErr?.response?.data?.error?.message || axiosErr?.message || 'Có lỗi xảy ra khi từ chối.');
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
      onKeyDown={(e) => e.key === 'Escape' && !isSubmitting && onClose()}
    >
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-red-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-red-100 text-red-700">
              <XCircle className="w-5 h-5" />
            </div>
            <h2 id={titleId} className="text-base font-semibold text-slate-800">
              Từ chối đơn nghỉ phép
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleReject} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
            <p>
              Nhân viên: <strong className="text-slate-800">{leave.employee.displayName}</strong>
            </p>
            <p>
              Thời gian nghỉ: <strong>{leave.daysCount} ngày</strong>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Lý do từ chối <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              placeholder="VD: Trùng lịch release dự án quan trọng..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none resize-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Xác nhận từ chối</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CancelModal({ leave, orgId, onClose, onSuccess }: ActionModalProps) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  if (!leave) return null;

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await cancelLeaveRequest(orgId, leave.id, { reason: reason.trim() || undefined });
      showToast('Đã hủy đơn nghỉ phép.', 'info');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setError(axiosErr?.response?.data?.error?.message || axiosErr?.message || 'Có lỗi xảy ra khi hủy đơn.');
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
      onKeyDown={(e) => e.key === 'Escape' && !isSubmitting && onClose()}
    >
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-amber-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 id={titleId} className="text-base font-semibold text-slate-800">
              Hủy đơn nghỉ phép
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCancel} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <p className="text-sm text-slate-600">
            Bạn có chắc chắn muốn hủy đơn nghỉ phép ({leave.daysCount} ngày) không?
            {leave.status === 'APPROVED' && (
              <span className="block mt-1 text-xs text-amber-700 font-medium">
                * Đơn đã duyệt khi hủy sẽ tự động hủy lịch nghỉ trên Calendar.
              </span>
            )}
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Lý do hủy (không bắt buộc)
            </label>
            <input
              type="text"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              placeholder="VD: Thay đổi kế hoạch cá nhân..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Quay lại
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Xác nhận hủy</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Building,
  Calendar,
  AlertCircle,
  FileText,
  Ban,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { approvalsApi } from '@/api/approvals';
import type { ApprovalRequest } from '@/api/types';

interface ApiErrorLike {
  response?: {
    data?: {
      error?: {
        message?: string;
      };
    };
  };
  message?: string;
}

interface AttendanceAdjustmentPayload {
  workDate?: string;
  targetCheckInAt?: string;
  targetCheckOutAt?: string;
  originalCheckInAt?: string;
  originalCheckOutAt?: string;
  reason?: string;
  shiftId?: string;
}

interface LeavePayload {
  leaveId?: string;
  leaveType?: string;
  daysCount?: number;
  startsAt?: string;
  endsAt?: string;
  reason?: string;
}

interface Props {
  isOpen: boolean;
  approval: ApprovalRequest | null;
  canApprove: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ApprovalDetailModal({ isOpen, approval, canApprove, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id;

  const [mode, setMode] = useState<'view' | 'approve' | 'reject' | 'cancel'>('view');
  const [note, setNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !approval || !orgId) return null;

  const isRequester = approval.requester.userId === user?.id;
  const isPending = approval.status === 'PENDING';
  const allowApproveActions = canApprove && hasPermission('approval:approve') && !isRequester && isPending;
  const allowRejectActions = hasPermission('approval:reject') && !isRequester && isPending;
  const allowCancel = hasPermission('approval:create') && (isRequester || hasPermission('approval:manage')) && isPending;

  const handleApprove = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await approvalsApi.approve(orgId, approval.id, { note: note.trim() || undefined });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as ApiErrorLike;
      setError(apiErr?.response?.data?.error?.message || apiErr?.message || 'Không thể phê duyệt yêu cầu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 3) {
      setError('Lý do từ chối phải có ít nhất 3 ký tự');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await approvalsApi.reject(orgId, approval.id, { reason: rejectReason.trim() });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as ApiErrorLike;
      setError(apiErr?.response?.data?.error?.message || apiErr?.message || 'Không thể từ chối yêu cầu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await approvalsApi.cancel(orgId, approval.id, { reason: cancelReason.trim() || undefined });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as ApiErrorLike;
      setError(apiErr?.response?.data?.error?.message || apiErr?.message || 'Không thể hủy yêu cầu');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (dStr?: string | null) => {
    if (!dStr) return '--';
    const d = new Date(dStr);
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                approval.type === 'LEAVE'
                  ? 'bg-purple-100 text-purple-700'
                  : approval.type === 'PAYROLL'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {approval.type === 'LEAVE'
                  ? 'Nghỉ phép'
                  : approval.type === 'PAYROLL'
                  ? 'Bảng lương'
                  : 'Điều chỉnh chấm công'}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                approval.status === 'APPROVED'
                  ? 'bg-emerald-100 text-emerald-700'
                  : approval.status === 'REJECTED'
                  ? 'bg-rose-100 text-rose-700'
                  : approval.status === 'CANCELLED'
                  ? 'bg-slate-100 text-slate-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {approval.status === 'APPROVED' && 'Đã phê duyệt'}
                {approval.status === 'REJECTED' && 'Bị từ chối'}
                {approval.status === 'CANCELLED' && 'Đã hủy'}
                {approval.status === 'PENDING' && 'Chờ phê duyệt'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">{approval.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Requester Info Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-3">
              Thông tin người gửi
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">Nhân viên:</span>
                <span className="font-medium text-slate-900">{approval.requester.displayName}</span>
                <span className="text-xs text-slate-500">({approval.requester.employeeCode})</span>
              </div>
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">Phòng ban:</span>
                <span className="font-medium text-slate-900">
                  {approval.requester.department?.name || '--'}
                </span>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">Thời gian tạo:</span>
                <span className="font-medium text-slate-900">{formatDateTime(approval.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Details based on Request Type */}
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-2">
              Chi tiết yêu cầu
            </h3>
            <div className="p-4 border border-slate-200 rounded-lg space-y-3 text-sm">
              {approval.type === 'ATTENDANCE_ADJUSTMENT' && (() => {
                const p = approval.payload as AttendanceAdjustmentPayload;
                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500">Ngày làm việc:</span>{' '}
                        <span className="font-semibold text-slate-900">{p.workDate}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Giờ vào thực tế:</span>{' '}
                        <span className="font-semibold text-brand-700">
                          {formatDateTime(p.targetCheckInAt)}
                        </span>
                      </div>
                    </div>
                    {p.targetCheckOutAt && (
                      <div>
                        <span className="text-slate-500">Giờ ra thực tế:</span>{' '}
                        <span className="font-semibold text-brand-700">
                          {formatDateTime(p.targetCheckOutAt)}
                        </span>
                      </div>
                    )}
                    {p.originalCheckInAt && (
                      <div className="text-xs text-slate-500 pt-1 border-t border-slate-100">
                        Giờ ghi nhận trước đó: Vào {formatDateTime(p.originalCheckInAt)}
                        {p.originalCheckOutAt && ` - Ra ${formatDateTime(p.originalCheckOutAt)}`}
                      </div>
                    )}
                  </div>
                );
              })()}

              {approval.type === 'LEAVE' && (() => {
                const p = approval.payload as LeavePayload;
                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500">Loại nghỉ:</span>{' '}
                        <span className="font-semibold text-slate-900">{p.leaveType}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Số ngày nghỉ:</span>{' '}
                        <span className="font-semibold text-purple-700">{p.daysCount} ngày</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500">Bắt đầu:</span>{' '}
                        <span className="font-medium text-slate-900">{formatDateTime(p.startsAt)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Kết thúc:</span>{' '}
                        <span className="font-medium text-slate-900">{formatDateTime(p.endsAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {approval.type === 'PAYROLL' && (() => {
                const p = approval.payload as {
                  name?: string;
                  totalGross?: string | number;
                  totalNet?: string | number;
                  employeeCount?: number;
                };
                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500">Kỳ lương:</span>{' '}
                        <span className="font-semibold text-slate-900">{p.name || approval.title}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Số nhân viên:</span>{' '}
                        <span className="font-semibold text-slate-900">{p.employeeCount ?? 0} người</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500">Tổng Gross:</span>{' '}
                        <span className="font-medium text-slate-900">
                          {Number(p.totalGross || 0).toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Tổng Net:</span>{' '}
                        <span className="font-bold text-emerald-600">
                          {Number(p.totalNet || 0).toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-500 block mb-1">Lý do:</span>
                <p className="text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {approval.reason}
                </p>
              </div>
            </div>
          </div>

          {/* Review History / Timeline */}
          {approval.reviewedAt && (
            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-2">
                Kết quả xử lý
              </h3>
              <div className="p-4 border border-slate-200 rounded-lg text-sm space-y-2 bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Người xử lý:</span>
                  <span className="font-semibold text-slate-900">
                    {approval.reviewer?.displayName || 'Quản trị viên'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Thời gian xử lý:</span>
                  <span className="font-medium text-slate-800">{formatDateTime(approval.reviewedAt)}</span>
                </div>
                {approval.reviewerNote && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-600 block mb-1">Ghi chú phản hồi:</span>
                    <p className="text-slate-800 bg-white p-2.5 rounded border border-slate-200">
                      {approval.reviewerNote}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Modes Forms */}
          {mode === 'approve' && (
            <div className="p-4 border-2 border-emerald-300 bg-emerald-50 rounded-lg space-y-3">
              <h4 className="font-semibold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Xác nhận phê duyệt yêu cầu
              </h4>
              <p className="text-xs text-emerald-700">
                Khi phê duyệt, dữ liệu công chấm công hoặc lịch nghỉ phép sẽ tự động cập nhật.
              </p>
              <div>
                <label className="block text-xs font-medium text-emerald-800 mb-1">
                  Ghi chú cho nhân viên (tùy chọn)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Đồng ý điều chỉnh..."
                  className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-emerald-100 rounded-lg"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  {isLoading ? 'Đang xử lý...' : 'Xác nhận duyệt'}
                </button>
              </div>
            </div>
          )}

          {mode === 'reject' && (
            <div className="p-4 border-2 border-rose-300 bg-rose-50 rounded-lg space-y-3">
              <h4 className="font-semibold text-rose-900 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-600" /> Xác nhận từ chối yêu cầu
              </h4>
              <div>
                <label className="block text-xs font-medium text-rose-800 mb-1">
                  Lý do từ chối <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  required
                  placeholder="Nêu rõ lý do từ chối để nhân viên nắm được..."
                  className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-rose-100 rounded-lg"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
                >
                  {isLoading ? 'Đang xử lý...' : 'Xác nhận từ chối'}
                </button>
              </div>
            </div>
          )}

          {mode === 'cancel' && (
            <div className="p-4 border-2 border-slate-300 bg-slate-50 rounded-lg space-y-3">
              <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                <Ban className="w-4 h-4 text-slate-600" /> Xác nhận hủy yêu cầu
              </h4>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Lý do hủy (tùy chọn)
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Tôi xin hủy vì..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50"
                >
                  {isLoading ? 'Đang xử lý...' : 'Xác nhận hủy'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions when in view mode */}
        {mode === 'view' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div>
              {allowCancel && (
                <button
                  type="button"
                  onClick={() => setMode('cancel')}
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg flex items-center gap-1.5"
                >
                  <Ban className="w-4 h-4" /> Hủy yêu cầu
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg"
              >
                Đóng
              </button>

              {allowRejectActions && (
                  <button
                    type="button"
                    onClick={() => setMode('reject')}
                    className="px-4 py-2 text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Từ chối
                  </button>
              )}
              {allowApproveActions && (
                  <button
                    type="button"
                    onClick={() => setMode('approve')}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Phê duyệt
                  </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

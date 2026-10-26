// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import { X, Clock, AlertCircle } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { approvalsApi } from '@/api/approvals';
import { listShifts, Shift } from '@/api/shifts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateAttendanceAdjustmentModal({ isOpen, onClose, onSuccess }: Props) {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id;

  const todayStr = new Date().toISOString().split('T')[0];
  const [workDate, setWorkDate] = useState(todayStr);
  const [checkInTime, setCheckInTime] = useState('08:30');
  const [checkOutTime, setCheckOutTime] = useState('17:30');
  const [shiftId, setShiftId] = useState('');
  const [reason, setReason] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !orgId) return;
    listShifts(orgId, { isActive: true })
      .then((res) => setShifts(res))
      .catch(() => {});
  }, [isOpen, orgId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    if (!workDate) {
      setError('Vui lòng chọn ngày làm việc');
      return;
    }
    if (!checkInTime) {
      setError('Vui lòng nhập giờ check-in thực tế');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Lý do phải có ít nhất 3 ký tự');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build ISO UTC timestamps based on Vietnam offset (UTC+7)
      // e.g. 2026-09-20 08:30 in VN time -> 2026-09-20 01:30:00.000Z
      const [cinH, cinM] = checkInTime.split(':').map(Number);
      const targetCheckIn = new Date(`${workDate}T${checkInTime}:00+07:00`).toISOString();

      let targetCheckOut: string | undefined = undefined;
      if (checkOutTime) {
        targetCheckOut = new Date(`${workDate}T${checkOutTime}:00+07:00`).toISOString();
      }

      await approvalsApi.createAttendanceAdjustment(orgId, {
        workDate,
        targetCheckInAt: targetCheckIn,
        targetCheckOutAt: targetCheckOut,
        shiftId: shiftId || undefined,
        reason: reason.trim(),
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg = apiErr?.response?.data?.error?.message || apiErr?.message || 'Có lỗi xảy ra khi gửi yêu cầu';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-900">Yêu cầu điều chỉnh chấm công</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ngày làm việc cần điều chỉnh <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Giờ vào thực tế <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Giờ ra thực tế
              </label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ca làm việc áp dụng
            </label>
            <select
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="">-- Mặc định theo lịch phân ca --</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime} - {s.endTime})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Lý do điều chỉnh <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ví dụ: Máy chấm công không nhận vân tay, đi công tác đột xuất..."
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50"
            >
              {isLoading ? 'Đang gửi...' : 'Gửi yêu cầu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

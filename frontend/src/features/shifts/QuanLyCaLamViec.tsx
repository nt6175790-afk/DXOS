// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Plus,
  Search,
  Filter,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Moon,
  Sun,
  Coffee,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import {
  listShifts,
  createShift,
  updateShift,
  deleteShift,
  Shift,
  CreateShiftInput,
} from '@/api/shifts';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export function ShiftsPage() {
  const { currentOrg } = useOrganization();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();
  const { showToast } = useToast();

  const canRead = hasPermission('shift:read');
  const canCreate = hasPermission('shift:create');
  const canUpdate = hasPermission('shift:update');
  const canManage = hasPermission('shift:manage');

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal create/edit state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [hasBreak, setHasBreak] = useState(true);
  const [breakStart, setBreakStart] = useState('12:00');
  const [breakEnd, setBreakEnd] = useState('13:00');
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(10);
  const [isOvernight, setIsOvernight] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState('');

  // Delete confirmation modal state
  const [deletingShift, setDeletingShift] = useState<Shift | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const orgId = currentOrg?.id;

  const loadShifts = useCallback(async () => {
    if (!orgId || !canRead) return;
    setIsLoading(true);
    try {
      const data = await listShifts(orgId, {
        search: search.trim() || undefined,
        isActive: activeFilter === 'ALL' ? undefined : activeFilter === 'ACTIVE',
      });
      setShifts(data);
    } catch (err: unknown) {
      showToast('Không thể tải danh sách ca làm việc.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, canRead, search, activeFilter, showToast]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  const openCreateModal = () => {
    setEditingShift(null);
    setName('');
    setCode('');
    setStartTime('09:00');
    setEndTime('18:00');
    setHasBreak(true);
    setBreakStart('12:00');
    setBreakEnd('13:00');
    setGracePeriodMinutes(10);
    setIsOvernight(false);
    setIsActive(true);
    setDescription('');
    setIsModalOpen(true);
  };

  const openEditModal = (shift: Shift) => {
    setEditingShift(shift);
    setName(shift.name);
    setCode(shift.code);
    setStartTime(shift.startTime);
    setEndTime(shift.endTime);
    setHasBreak(Boolean(shift.breakStart && shift.breakEnd));
    setBreakStart(shift.breakStart || '12:00');
    setBreakEnd(shift.breakEnd || '13:00');
    setGracePeriodMinutes(shift.gracePeriodMinutes);
    setIsOvernight(shift.isOvernight);
    setIsActive(shift.isActive);
    setDescription(shift.description || '');
    setIsModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || isSubmitting) return;

    if (!name.trim() || !code.trim() || !startTime || !endTime) {
      showToast('Vui lòng điền đầy đủ thông tin bắt buộc.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateShiftInput = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        startTime,
        endTime,
        breakStart: hasBreak ? breakStart : undefined,
        breakEnd: hasBreak ? breakEnd : undefined,
        gracePeriodMinutes: Number(gracePeriodMinutes),
        isOvernight,
        isActive,
        description: description.trim() || undefined,
      };

      if (editingShift) {
        await updateShift(orgId, editingShift.id, payload);
        showToast('Cập nhật ca làm việc thành công!', 'success');
      } else {
        await createShift(orgId, payload);
        showToast('Tạo ca làm việc mới thành công!', 'success');
      }

      setIsModalOpen(false);
      loadShifts();
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string }; response?: { data?: { message?: string } }; message?: string };
      const msg = errorObj.error?.message || errorObj.response?.data?.message || errorObj.message || 'Lưu ca làm việc thất bại.';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!orgId || !deletingShift || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteShift(orgId, deletingShift.id);
      showToast('Đã xóa ca làm việc thành công.', 'success');
      setDeletingShift(null);
      loadShifts();
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string }; response?: { data?: { message?: string } }; message?: string };
      const msg =
        errorObj.error?.message ||
        errorObj.response?.data?.message ||
        errorObj.message ||
        'Không thể xóa ca làm việc. Vui lòng thử vô hiệu hóa ca thay vì xóa.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isPermissionLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (!canRead) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Không có quyền truy cập</h2>
        <p className="text-slate-600">Bạn chưa được cấp quyền để xem danh sách ca làm việc.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Ca làm việc"
        description="Định nghĩa các ca làm việc, thời gian nghỉ giữa ca và quy định đi muộn cho tổ chức."
        actions={
          canCreate && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Thêm ca làm việc
            </button>
          )
        }
      />

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã ca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50 text-xs font-medium">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setActiveFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeFilter === 'ACTIVE'
                  ? 'bg-white text-emerald-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đang hoạt động
            </button>
            <button
              onClick={() => setActiveFilter('INACTIVE')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeFilter === 'INACTIVE'
                  ? 'bg-white text-slate-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vô hiệu hóa
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Chưa có ca làm việc nào"
          description={
            search
              ? 'Không tìm thấy ca làm việc phù hợp với từ khóa tìm kiếm.'
              : 'Hãy tạo ca làm việc đầu tiên để bắt đầu phân ca cho nhân viên.'
          }
          action={
            canCreate && !search ? (
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Tạo ca làm việc
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shifts.map((shift) => (
            <div
              key={shift.id}
              className={`bg-white rounded-xl border shadow-sm transition-all duration-200 flex flex-col justify-between ${
                shift.isActive
                  ? 'border-slate-200 hover:border-brand-300 hover:shadow-md'
                  : 'border-slate-200 bg-slate-50/50 opacity-75'
              }`}
            >
              {/* Card Header */}
              <div className="p-6 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">{shift.name}</h3>
                      {shift.isOvernight && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Moon className="w-3 h-3" /> Qua đêm
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded mt-1 inline-block">
                      Mã: {shift.code}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      shift.isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                  >
                    {shift.isActive ? 'Đang áp dụng' : 'Vô hiệu hóa'}
                  </span>
                </div>

                {/* Shift Timings */}
                <div className="bg-slate-50 rounded-lg p-3 my-4 border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-brand-600" /> Giờ làm việc:
                    </span>
                    <span className="font-bold text-slate-900 text-base">
                      {shift.startTime} → {shift.endTime}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-200/60">
                    <span className="flex items-center gap-1">
                      <Coffee className="w-3.5 h-3.5 text-amber-600" /> Nghỉ giữa ca:
                    </span>
                    <span className="font-medium text-slate-800">
                      {shift.breakStart && shift.breakEnd
                        ? `${shift.breakStart} → ${shift.breakEnd}`
                        : 'Không nghỉ giữa ca'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <Sun className="w-3.5 h-3.5 text-blue-600" /> Ân hạn đi muộn:
                    </span>
                    <span className="font-semibold text-brand-700">
                      {shift.gracePeriodMinutes > 0 ? `${shift.gracePeriodMinutes} phút` : 'Không có'}
                    </span>
                  </div>
                </div>

                {shift.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mt-2">{shift.description}</p>
                )}
              </div>

              {/* Card Footer Actions */}
              {(canUpdate || canManage) && (
                <div className="px-6 py-3 bg-slate-50/70 border-t border-slate-100 rounded-b-xl flex items-center justify-end gap-2">
                  {canUpdate && (
                    <button
                      onClick={() => openEditModal(shift)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors shadow-sm"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Sửa
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => setDeletingShift(shift)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded-md hover:bg-rose-50 transition-colors shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Xóa
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingShift ? 'Chỉnh sửa Ca làm việc' : 'Tạo Ca làm việc mới'}
      >
        <form onSubmit={handleSaveShift} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên ca <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="VD: Ca hành chính"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã ca (viết hoa, không dấu) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="VD: HC, SANG, DEM"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giờ bắt đầu <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giờ kết thúc <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBreak}
                  onChange={(e) => setHasBreak(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Có thời gian nghỉ giữa ca (trừ vào giờ làm)
              </label>
            </div>

            {hasBreak && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="block text-xs text-slate-500 mb-1">Bắt đầu nghỉ</span>
                  <input
                    type="time"
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm bg-white"
                  />
                </div>
                <div>
                  <span className="block text-xs text-slate-500 mb-1">Kết thúc nghỉ</span>
                  <input
                    type="time"
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ân hạn đi muộn (phút)
              </label>
              <input
                type="number"
                min="0"
                max="120"
                value={gracePeriodMinutes}
                onChange={(e) => setGracePeriodMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Đến trong thời gian này vẫn tính Đúng giờ.
              </span>
            </div>

            <div className="flex flex-col justify-center space-y-2 pt-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOvernight}
                  onChange={(e) => setIsOvernight(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="font-medium">Ca làm việc qua đêm</span>
                <span className="text-xs text-slate-400">(Tan ca ngày hôm sau)</span>
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="font-medium">Đang áp dụng</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả thêm</label>
            <textarea
              rows={2}
              placeholder="Ghi chú chi tiết về ca..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : editingShift ? 'Lưu thay đổi' : 'Tạo ca làm việc'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deletingShift)}
        onClose={() => !isDeleting && setDeletingShift(null)}
        title="Xác nhận xóa ca làm việc"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">Lưu ý quan trọng</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Nếu ca làm việc đã được sử dụng trong lịch phân ca hoặc dữ liệu chấm công lịch sử, hệ thống sẽ ngăn chặn thao tác xóa để bảo toàn dữ liệu. Bạn nên chuyển trạng thái ca sang <b>Vô hiệu hóa</b> thay vì xóa.
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-700">
            Bạn có chắc chắn muốn xóa ca làm việc <b>{deletingShift?.name}</b> ({deletingShift?.code}) không?
          </p>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setDeletingShift(null)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              {isDeleting ? 'Đang xóa...' : 'Xóa ca làm việc'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

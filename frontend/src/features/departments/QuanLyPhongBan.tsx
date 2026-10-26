// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { useToast } from '@/contexts/ToastContext';
import { usePermission } from '@/hooks/usePermission';
import { listDepartments, createDepartment, updateDepartment } from '@/api/departments';
import { isApiError } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import type { Department, DepartmentStatus, ApiError } from '@/api/types';
import { format } from 'date-fns';

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export function DepartmentsPage() {
  const { currentOrg } = useOrganization();
  const { showToast } = useToast();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();

  const canRead = hasPermission('department:read');
  const canCreate = hasPermission('department:create');
  const canUpdate = hasPermission('department:update');

  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [formData, setFormData] = useState({ code: '', name: '', description: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const orgId = currentOrg?.id;

  const loadDepartments = useCallback(async (cursor?: string) => {
    if (!orgId) return;
    try {
      const params: Record<string, unknown> = { limit: 25 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (cursor) params.after = cursor;

      const response = await listDepartments(orgId, params as import('@/api/types').DepartmentListParams);

      if (cursor) {
        setDepartments((prev) => [...prev, ...response.items]);
      } else {
        setDepartments(response.items);
      }
      setNextCursor(response.nextCursor);
      setError(null);
      setIsForbidden(false);
    } catch (err) {
      if (isApiError(err) && err.error.code === 'FORBIDDEN') {
        setIsForbidden(true);
      } else if (isApiError(err)) {
        setError(err);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [orgId, statusFilter]);

  useEffect(() => {
    if (!orgId || isPermissionLoading) return;

    if (!canRead) {
      setIsForbidden(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setDepartments([]);
    setNextCursor(null);
    loadDepartments();
  }, [orgId, isPermissionLoading, canRead, loadDepartments]);

  const handleLoadMore = () => {
    if (nextCursor) {
      setIsLoadingMore(true);
      loadDepartments(nextCursor);
    }
  };

  const openCreate = () => {
    setEditingDept(null);
    setFormData({ code: '', name: '', description: '' });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditingDept(dept);
    setFormData({ code: dept.code, name: dept.name, description: dept.description || '' });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!orgId) return;
    setIsSaving(true);
    setFormErrors({});

    try {
      if (editingDept) {
        const updateData: Record<string, unknown> = {};
        if (formData.name !== editingDept.name) updateData.name = formData.name;
        if ((formData.description || null) !== editingDept.description) {
          updateData.description = formData.description || null;
        }
        if (Object.keys(updateData).length > 0) {
          await updateDepartment(orgId, editingDept.id, updateData as import('@/api/types').UpdateDepartmentRequest);
        }
        showToast('Cập nhật phòng ban thành công', 'success');
      } else {
        await createDepartment(orgId, {
          code: formData.code.toUpperCase().trim(),
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
        });
        showToast('Tạo phòng ban thành công', 'success');
      }
      setModalOpen(false);
      setIsLoading(true);
      loadDepartments();
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          showToast('Bạn không có quyền thực hiện thao tác này.', 'error');
          setModalOpen(false);
        } else if (err.error.code === 'CONFLICT') {
          setFormErrors({ code: 'Mã phòng ban này đã được sử dụng.' });
        } else if (err.error.details?.fields) {
          const fieldErrors: Record<string, string> = {};
          err.error.details.fields.forEach((f: string) => {
            fieldErrors.general = f;
          });
          setFormErrors(fieldErrors);
        } else {
          showToast(err.error.message, 'error');
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (dept: Department) => {
    if (!orgId) return;
    const newStatus: DepartmentStatus = dept.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateDepartment(orgId, dept.id, { status: newStatus });
      showToast(`Đã ${newStatus === 'ACTIVE' ? 'kích hoạt' : 'ngừng kích hoạt'} phòng ban`, 'success');
      loadDepartments();
    } catch (err) {
      if (isApiError(err)) {
        showToast(err.error.message, 'error');
      }
    }
  };

  const orgGuard = useOrgBootstrapGuard();
  if (orgGuard) return orgGuard;
  if (isPermissionLoading) return <LoadingState message="Đang kiểm tra quyền hạn..." />;
  if (isForbidden || !canRead) {
    return <ForbiddenState message="Bạn không có quyền truy cập hoặc xem danh sách phòng ban." />;
  }
  if (error) return <ErrorState error={error} onRetry={() => { setIsLoading(true); loadDepartments(); }} />;

  return (
    <div>
      <PageHeader
        title="Phòng ban"
        description="Quản lý các phòng ban trong tổ chức của bạn"
        actions={
          canCreate ? (
            <button onClick={openCreate} className="btn-primary">
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Thêm phòng ban
            </button>
          ) : undefined
        }
      />

      {/* Status Filter */}
      <div className="flex gap-2 mb-4">
        {(['ALL', 'ACTIVE', 'INACTIVE'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === f
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            {f === 'ALL' ? 'Tất cả' : f === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState message="Đang tải danh sách phòng ban..." />
      ) : departments.length === 0 ? (
        <EmptyState
          title="Không tìm thấy phòng ban nào"
          description={statusFilter !== 'ALL' ? 'Thử thay đổi bộ lọc trạng thái.' : 'Tạo phòng ban đầu tiên để bắt đầu quản lý.'}
          action={
            statusFilter === 'ALL' && canCreate ? (
              <button onClick={openCreate} className="btn-primary text-sm">
                <Plus className="h-4 w-4 mr-1" /> Thêm phòng ban
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Mã</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Tên phòng ban</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Mô tả</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Trạng thái</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Cập nhật lúc</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {departments.map((dept) => (
                    <tr key={dept.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{dept.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{dept.name}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                        <span className="truncate block max-w-[200px]">{dept.description || '—'}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={dept.status} /></td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                        {format(new Date(dept.updatedAt), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canUpdate ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(dept)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                              aria-label={`Chỉnh sửa ${dept.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(dept)}
                              className={`px-2 py-1 text-xs rounded font-medium ${
                                dept.status === 'ACTIVE'
                                  ? 'text-amber-700 hover:bg-amber-50'
                                  : 'text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {dept.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination hasMore={!!nextCursor} onLoadMore={handleLoadMore} isLoading={isLoadingMore} />
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingDept ? 'Chỉnh sửa phòng ban' : 'Thêm phòng ban mới'}
      >
        {formErrors.general && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-sm text-red-700" role="alert">
            {formErrors.general}
          </div>
        )}
        <FormField label="Mã phòng ban" htmlFor="dept-code" error={formErrors.code} required hint="Chữ cái và số in hoa (ví dụ: ENG, HR-01)">
          <input
            id="dept-code"
            className="input-field font-mono uppercase"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            disabled={!!editingDept}
            placeholder="ENG"
            maxLength={64}
          />
        </FormField>
        <FormField label="Tên phòng ban" htmlFor="dept-name" error={formErrors.name} required>
          <input
            id="dept-name"
            className="input-field"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Kỹ thuật công nghệ"
            maxLength={200}
          />
        </FormField>
        <FormField label="Mô tả" htmlFor="dept-desc" hint="Không bắt buộc">
          <textarea
            id="dept-desc"
            className="input-field min-h-[80px]"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Mô tả ngắn gọn về chức năng của phòng ban"
            maxLength={1000}
          />
        </FormField>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={isSaving}>
            Hủy
          </button>
          <button onClick={handleSave} className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Đang lưu...' : editingDept ? 'Lưu thay đổi' : 'Tạo phòng ban'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

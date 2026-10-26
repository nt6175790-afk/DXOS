// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Pencil,
  User,
  Search,
  List,
  LayoutGrid,
  Building2,
  Phone,
  ArrowUpDown,
  Eye,
  X,
} from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { useToast } from '@/contexts/ToastContext';
import { usePermission } from '@/hooks/usePermission';
import { listEmployees, createEmployee, updateEmployee } from '@/api/employees';
import { listDepartments } from '@/api/departments';
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
import { EmployeeDetailModal } from './EmployeeDetailModal';
import type { Employee, Department, EmployeeStatus, ApiError } from '@/api/types';

type SortOption = 'name_asc' | 'name_desc' | 'code' | 'date_desc' | 'date_asc';
type ViewMode = 'table' | 'cards';

export function PeoplePage() {
  const { currentOrg } = useOrganization();
  const { showToast } = useToast();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();

  const canRead = hasPermission('employee:read');
  const canCreate = hasPermission('employee:create');
  const canUpdate = hasPermission('employee:update');
  const canReadDept = hasPermission('department:read');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | EmployeeStatus>('ALL');
  const [deptFilter, setDeptFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Detail Profile modal state
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Create/Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({
    userId: '',
    employeeCode: '',
    displayName: '',
    departmentId: '',
    jobTitle: '',
    phone: '',
  });
  const [formStatus, setFormStatus] = useState<EmployeeStatus>('ACTIVE');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const orgId = currentOrg?.id;

  // Load departments for display and filtering
  useEffect(() => {
    if (!orgId || !canReadDept) return;
    listDepartments(orgId, { limit: 100, status: 'ACTIVE' })
      .then((r) => setDepartments(r.items))
      .catch(() => {});
  }, [orgId, canReadDept]);

  const getDeptName = (deptId: string | null) => {
    if (!deptId) return '—';
    return departments.find((d) => d.id === deptId)?.name || deptId.slice(0, 8);
  };

  const loadEmployees = useCallback(async (cursor?: string) => {
    if (!orgId) return;
    try {
      const params: Record<string, unknown> = { limit: 50 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (deptFilter) params.departmentId = deptFilter;
      if (cursor) params.after = cursor;

      const response = await listEmployees(orgId, params as import('@/api/types').EmployeeListParams);
      if (cursor) {
        setEmployees((prev) => [...prev, ...response.items]);
      } else {
        setEmployees(response.items);
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
  }, [orgId, statusFilter, deptFilter]);

  useEffect(() => {
    if (!orgId || isPermissionLoading) return;
    if (!canRead) {
      setIsForbidden(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setEmployees([]);
    setNextCursor(null);
    loadEmployees();
  }, [orgId, isPermissionLoading, canRead, loadEmployees]);

  const handleLoadMore = () => {
    if (nextCursor) {
      setIsLoadingMore(true);
      loadEmployees(nextCursor);
    }
  };

  // Filter & sort employees client-side for immediate responsive experience
  const filteredAndSortedEmployees = useMemo(() => {
    let result = [...employees];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (e) =>
          e.displayName.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          (e.jobTitle && e.jobTitle.toLowerCase().includes(q)) ||
          (e.phone && e.phone.includes(q))
      );
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.displayName.localeCompare(b.displayName, 'vi');
        case 'name_desc':
          return b.displayName.localeCompare(a.displayName, 'vi');
        case 'code':
          return a.employeeCode.localeCompare(b.employeeCode);
        case 'date_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'date_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        default:
          return 0;
      }
    });
    return result;
  }, [employees, searchQuery, sortBy]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ userId: '', employeeCode: '', displayName: '', departmentId: '', jobTitle: '', phone: '' });
    setFormStatus('ACTIVE');
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setFormData({
      userId: emp.userId,
      employeeCode: emp.employeeCode,
      displayName: emp.displayName,
      departmentId: emp.departmentId || '',
      jobTitle: emp.jobTitle || '',
      phone: emp.phone || '',
    });
    setFormStatus(emp.status);
    setFormErrors({});
    setModalOpen(true);
  };

  const openDetail = (emp: Employee) => {
    setSelectedEmployee(emp);
    setDetailModalOpen(true);
  };

  const handleSave = async () => {
    if (!orgId) return;
    setIsSaving(true);
    setFormErrors({});

    if (formData.phone && !/^\+[1-9][0-9]{7,14}$/.test(formData.phone.trim())) {
      setFormErrors({ phone: 'Số điện thoại phải đúng định dạng quốc tế, ví dụ: +84901234567' });
      setIsSaving(false);
      return;
    }

    try {
      if (editing) {
        const updateData: Record<string, unknown> = {};
        if (formData.displayName !== editing.displayName) updateData.displayName = formData.displayName.trim();
        if ((formData.departmentId || null) !== editing.departmentId) updateData.departmentId = formData.departmentId || null;
        if ((formData.jobTitle || null) !== editing.jobTitle) updateData.jobTitle = formData.jobTitle.trim() || null;
        if ((formData.phone || null) !== editing.phone) updateData.phone = formData.phone.trim() || null;
        if (formStatus !== editing.status) updateData.status = formStatus;

        if (Object.keys(updateData).length > 0) {
          await updateEmployee(orgId, editing.id, updateData as import('@/api/types').UpdateEmployeeRequest);
        }
        showToast('Cập nhật nhân sự thành công', 'success');
      } else {
        await createEmployee(orgId, {
          userId: formData.userId.trim(),
          employeeCode: formData.employeeCode.toUpperCase().trim(),
          displayName: formData.displayName.trim(),
          departmentId: formData.departmentId || undefined,
          jobTitle: formData.jobTitle.trim() || undefined,
          phone: formData.phone.trim() || undefined,
        });
        showToast('Thêm nhân sự thành công', 'success');
      }
      setModalOpen(false);
      setIsLoading(true);
      loadEmployees();
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          showToast('Bạn không có quyền thực hiện thao tác này.', 'error');
          setModalOpen(false);
        } else if (err.error.code === 'CONFLICT') {
          setFormErrors({ general: 'Xung đột dữ liệu — mã nhân viên bị trùng hoặc người dùng đã có hồ sơ.' });
        } else if (err.error.code === 'NOT_FOUND') {
          setFormErrors({ userId: 'Không tìm thấy người dùng hoặc người dùng chưa phải thành viên trong tổ chức này.' });
        } else {
          setFormErrors({ general: err.error.message });
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const orgGuard = useOrgBootstrapGuard();
  if (orgGuard) return orgGuard;
  if (isPermissionLoading) return <LoadingState message="Đang kiểm tra quyền hạn..." />;
  if (isForbidden || !canRead) {
    return <ForbiddenState message="Bạn không có quyền truy cập hoặc xem danh sách nhân sự của tổ chức này." />;
  }
  if (error) return <ErrorState error={error} onRetry={() => { setIsLoading(true); loadEmployees(); }} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh bạ Nhân sự"
        description="Quản lý hồ sơ, phòng ban và chức danh nhân sự trong tổ chức"
        actions={
          canCreate ? (
            <button onClick={openCreate} className="btn-primary">
              <Plus className="h-4 w-4 mr-1.5" /> Thêm nhân sự
            </button>
          ) : undefined
        }
      />

      {/* Search and Filters Bar */}
      <div className="card p-4 space-y-3 bg-white">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo tên, mã NV, chức danh..."
              className="input-field pl-9 pr-8 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* View Mode Toggle & Sort */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <ArrowUpDown className="h-3.5 w-3.5" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="input-field text-xs py-1.5 w-auto"
                aria-label="Sắp xếp danh sách"
              >
                <option value="name_asc">Tên (A → Z)</option>
                <option value="name_desc">Tên (Z → A)</option>
                <option value="code">Mã nhân viên</option>
                <option value="date_desc">Mới gia nhập</option>
                <option value="date_asc">Cũ nhất</option>
              </select>
            </div>

            <div className="border-l border-slate-200 pl-2 flex items-center gap-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                title="Xem dạng bảng"
                aria-label="Xem dạng bảng"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                title="Xem dạng thẻ"
                aria-label="Xem dạng thẻ"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Badges Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 mr-1">Trạng thái:</span>
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  statusFilter === f
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f === 'ALL' ? 'Tất cả' : f === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'}
              </button>
            ))}
          </div>

          {departments.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-slate-400 mr-1">Phòng ban:</span>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="input-field w-auto text-xs py-1"
                aria-label="Lọc theo phòng ban"
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Đang tải danh sách nhân sự..." />
      ) : employees.length === 0 ? (
        <EmptyState
          icon={User}
          title="Không tìm thấy nhân sự nào"
          description="Tạo hồ sơ nhân viên đầu tiên cho thành viên nhóm của bạn."
          action={
            canCreate ? (
              <button onClick={openCreate} className="btn-primary text-sm">
                <Plus className="h-4 w-4 mr-1" /> Thêm nhân sự
              </button>
            ) : undefined
          }
        />
      ) : filteredAndSortedEmployees.length === 0 ? (
        <div className="card p-8 text-center text-slate-500 text-sm">
          Không tìm thấy nhân sự phù hợp với từ khóa "{searchQuery}".
        </div>
      ) : viewMode === 'table' ? (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Họ và tên</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">Mã NV</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Chức danh</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Phòng ban</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Số điện thoại</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Trạng thái</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAndSortedEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openDetail(emp)}
                          className="font-medium text-slate-900 hover:text-brand-600 text-left flex items-center gap-2"
                        >
                          <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {emp.displayName.slice(0, 1).toUpperCase()}
                          </div>
                          <span>{emp.displayName}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 hidden sm:table-cell">
                        {emp.employeeCode}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                        {emp.jobTitle || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                        {getDeptName(emp.departmentId)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell font-mono text-xs">
                        {emp.phone || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={emp.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDetail(emp)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-brand-600"
                            title="Xem hồ sơ chi tiết"
                            aria-label={`Xem hồ sơ ${emp.displayName}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {canUpdate && (
                            <button
                              onClick={() => openEdit(emp)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-brand-600"
                              title="Chỉnh sửa"
                              aria-label={`Chỉnh sửa ${emp.displayName}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination hasMore={!!nextCursor} onLoadMore={handleLoadMore} isLoading={isLoadingMore} />
        </>
      ) : (
        /* Card Grid View */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAndSortedEmployees.map((emp) => {
              const initials = emp.displayName
                .split(' ')
                .filter(Boolean)
                .slice(-2)
                .map((w) => w[0])
                .join('')
                .toUpperCase() || 'NV';
              return (
                <div
                  key={emp.id}
                  className="card p-4 hover:shadow-md transition-all duration-150 flex flex-col justify-between space-y-3 bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <button
                          onClick={() => openDetail(emp)}
                          className="font-bold text-slate-900 hover:text-brand-600 truncate block text-left text-sm"
                        >
                          {emp.displayName}
                        </button>
                        <p className="text-xs text-slate-500 truncate">
                          {emp.jobTitle || 'Nhân viên'}
                        </p>
                        <span className="font-mono text-[10px] text-slate-400">
                          {emp.employeeCode}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={emp.status} />
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-500 border-t border-slate-100 pt-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        Phòng ban:
                      </span>
                      <span className="font-medium text-slate-700">{getDeptName(emp.departmentId)}</span>
                    </div>
                    {emp.phone && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          Điện thoại:
                        </span>
                        <span className="font-medium font-mono text-slate-700">{emp.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-auto">
                    <button
                      onClick={() => openDetail(emp)}
                      className="btn-secondary flex-1 text-xs py-1.5 inline-flex items-center justify-center gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Xem hồ sơ</span>
                    </button>
                    {canUpdate && (
                      <button
                        onClick={() => openEdit(emp)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition-colors"
                        aria-label={`Chỉnh sửa ${emp.displayName}`}
                        title="Chỉnh sửa"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination hasMore={!!nextCursor} onLoadMore={handleLoadMore} isLoading={isLoadingMore} />
        </>
      )}

      {/* Employee Detail Profile Modal */}
      <EmployeeDetailModal
        employee={selectedEmployee}
        departments={departments}
        open={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedEmployee(null);
        }}
        onEdit={(emp) => openEdit(emp)}
        canEdit={canUpdate}
      />

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Chỉnh sửa nhân sự' : 'Thêm nhân sự mới'} size="lg">
        {formErrors.general && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-sm text-red-700" role="alert">{formErrors.general}</div>
        )}

        {!editing && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 text-sm text-blue-700">
            <strong>Lưu ý:</strong> Người dùng phải có tài khoản và là thành viên đang hoạt động trong tổ chức này trước khi tạo hồ sơ nhân viên.
          </div>
        )}

        {!editing && (
          <FormField label="Mã định danh User ID" htmlFor="emp-userId" error={formErrors.userId} required hint="Mã UUID của tài khoản thành viên trong tổ chức">
            <input id="emp-userId" className="input-field font-mono text-xs" value={formData.userId}
              onChange={(e) => setFormData({ ...formData, userId: e.target.value })} placeholder="ví dụ: a1b2c3d4-..." />
          </FormField>
        )}
        {!editing && (
          <FormField label="Mã nhân viên" htmlFor="emp-code" error={formErrors.employeeCode} required hint="Chữ cái và số in hoa (ví dụ: EMP-001)">
            <input id="emp-code" className="input-field font-mono uppercase" value={formData.employeeCode}
              onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })} maxLength={64} placeholder="EMP-001" />
          </FormField>
        )}
        <FormField label="Tên hiển thị" htmlFor="emp-name" required>
          <input id="emp-name" className="input-field" value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })} maxLength={200} placeholder="Nguyễn Văn A" />
        </FormField>
        <FormField label="Phòng ban" htmlFor="emp-dept" hint="Không bắt buộc">
          <select id="emp-dept" className="input-field" value={formData.departmentId}
            onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}>
            <option value="">Không trực thuộc phòng ban</option>
            {departments.filter((d) => d.status === 'ACTIVE').map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Chức danh" htmlFor="emp-title" hint="Không bắt buộc">
          <input id="emp-title" className="input-field" value={formData.jobTitle}
            onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })} maxLength={200} placeholder="Kỹ sư phần mềm" />
        </FormField>
        <FormField label="Số điện thoại" htmlFor="emp-phone" error={formErrors.phone} hint="Định dạng quốc tế, ví dụ: +84901234567">
          <input id="emp-phone" className="input-field" value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+84901234567" maxLength={16} />
        </FormField>
        {editing && (
          <FormField label="Trạng thái" htmlFor="emp-status">
            <select id="emp-status" className="input-field" value={formStatus}
              onChange={(e) => setFormStatus(e.target.value as EmployeeStatus)}>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Ngừng hoạt động</option>
            </select>
          </FormField>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={isSaving}>Hủy</button>
          <button onClick={handleSave} className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Thêm nhân sự'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock, List, LayoutGrid } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { useToast } from '@/contexts/ToastContext';
import { usePermission } from '@/hooks/usePermission';
import { listTasks, createTask } from '@/api/tasks';
import { listEmployees } from '@/api/employees';
import { listDepartments } from '@/api/departments';
import { isApiError } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { TaskStatusBadge } from '@/components/ui/TaskStatusBadge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { TaskProgressBar } from '@/components/ui/TaskProgressBar';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import type { Task, Employee, Department, TaskStatus, TaskPriority, TaskListParams, ApiError } from '@/api/types';
import { format } from 'date-fns';
import { TaskKanban } from './TaskKanban';

export function TasksPage() {
  const { currentOrg } = useOrganization();
  const { permissions } = usePermission();
  return <TasksContent key={`${currentOrg?.id ?? 'no-organization'}:${permissions.join(',')}`} />;
}

function TasksContent() {
  const { currentOrg } = useOrganization();
  const { showToast } = useToast();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();
  const navigate = useNavigate();

  const canRead = hasPermission('task:read');
  const canUpdate = hasPermission('task:update');
  const canCreate = hasPermission('task:create');
  const canAssign = hasPermission('task:assign');
  const canReadEmp = hasPermission('employee:read');
  const canReadDept = hasPermission('department:read');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [view, setView] = useState<'list' | 'board'>('list');

  // Filters
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [deptFilter, setDeptFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', priority: 'MEDIUM' as TaskPriority, dueAt: '', departmentId: '', assigneeEmployeeId: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const orgId = currentOrg?.id;

  // Load reference data only if permitted
  useEffect(() => {
    if (!orgId || isPermissionLoading || !canRead) return;
    if (canReadEmp) {
      listEmployees(orgId, { limit: 100, status: 'ACTIVE' }).then((r) => setEmployees(r.items)).catch(() => {});
    }
    if (canReadDept) {
      listDepartments(orgId, { limit: 100, status: 'ACTIVE' }).then((r) => setDepartments(r.items)).catch(() => {});
    }
  }, [orgId, isPermissionLoading, canRead, canReadEmp, canReadDept]);

  const getEmployeeName = (id: string | null) => {
    if (!id) return '—';
    return employees.find((e) => e.id === id)?.displayName || 'Đã phân công';
  };
  const getDeptName = (id: string | null) => {
    if (!id) return '—';
    return departments.find((d) => d.id === id)?.name || id.slice(0, 8);
  };

  const loadTasks = useCallback(async (cursor?: string) => {
    if (!orgId) return;
    try {
      const params: TaskListParams = { limit: 25 };
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (deptFilter) params.departmentId = deptFilter;
      if (assigneeFilter) params.assigneeEmployeeId = assigneeFilter;
      if (cursor) params.after = cursor;

      const response = await listTasks(orgId, params);
      if (cursor) {
        setTasks((prev) => [...prev, ...response.items]);
      } else {
        setTasks(response.items);
      }
      setNextCursor(response.nextCursor);
      setError(null);
      setIsForbidden(false);
    } catch (err) {
      if (isApiError(err) && err.error.code === 'FORBIDDEN') setIsForbidden(true);
      else if (isApiError(err)) setError(err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [orgId, statusFilter, priorityFilter, deptFilter, assigneeFilter]);

  useEffect(() => {
    if (!orgId || isPermissionLoading) return;

    if (!canRead) {
      setIsForbidden(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setTasks([]);
    setNextCursor(null);
    loadTasks();
  }, [orgId, isPermissionLoading, canRead, loadTasks]);

  const handleCreate = async () => {
    if (!orgId || !canCreate || isSaving) return;
    setIsSaving(true);
    setFormErrors({});
    try {
      const data: import('@/api/types').CreateTaskRequest = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        priority: formData.priority,
        departmentId: formData.departmentId || undefined,
        assigneeEmployeeId: canAssign ? formData.assigneeEmployeeId || undefined : undefined,
        dueAt: formData.dueAt ? new Date(formData.dueAt).toISOString() : undefined,
      };
      await createTask(orgId, data);
      showToast('Tạo công việc thành công', 'success');
      setCreateOpen(false);
      setIsLoading(true);
      loadTasks();
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          showToast('Bạn không có quyền tạo công việc.', 'error');
          setCreateOpen(false);
        } else if (err.error.code === 'CONFLICT') {
          setFormErrors({ general: 'Nhân viên hoặc phòng ban đã thay đổi. Hãy tải lại và chọn lại.' });
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
    return <ForbiddenState message="Bạn không có quyền truy cập hoặc xem danh sách công việc của tổ chức này." />;
  }
  if (error) return <ErrorState error={error} onRetry={() => { setIsLoading(true); loadTasks(); }} />;

  return (
    <div>
      <PageHeader
        title="Công việc"
        description="Quản lý và theo dõi tiến độ công việc trong toàn tổ chức"
        actions={
          canCreate ? (
            <button onClick={() => { setFormData({ title: '', description: '', priority: 'MEDIUM', dueAt: '', departmentId: '', assigneeEmployeeId: '' }); setFormErrors({}); setCreateOpen(true); }} className="btn-primary">
              <Plus className="h-4 w-4 mr-1.5" />Thêm công việc
            </button>
          ) : undefined
        }
      />

      {/* View Mode Toggle */}
      <div className="inline-flex p-1 bg-slate-100 rounded-xl mb-4 border border-slate-200/80" aria-label="Chế độ xem công việc">
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            view === 'list'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          aria-pressed={view === 'list'}
          onClick={() => setView('list')}
        >
          <List className="h-3.5 w-3.5" />
          Danh sách
        </button>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            view === 'board'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          aria-pressed={view === 'board'}
          onClick={() => setView('board')}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Kanban
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')} className="input-field w-auto text-xs" aria-label="Lọc theo trạng thái">
          <option value="">Tất cả trạng thái</option>
          <option value="TODO">Cần làm</option>
          <option value="IN_PROGRESS">Đang thực hiện</option>
          <option value="DONE">Hoàn thành</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | '')} className="input-field w-auto text-xs" aria-label="Lọc theo độ ưu tiên">
          <option value="">Tất cả mức ưu tiên</option>
          <option value="LOW">Thấp</option>
          <option value="MEDIUM">Trung bình</option>
          <option value="HIGH">Cao</option>
          <option value="URGENT">Khẩn cấp</option>
        </select>
        {departments.length > 0 && (
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input-field w-auto text-xs" aria-label="Lọc theo phòng ban">
            <option value="">Tất cả phòng ban</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {employees.length > 0 && (
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="input-field w-auto text-xs" aria-label="Lọc theo người phụ trách">
            <option value="">Tất cả người phụ trách</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.displayName}</option>)}
          </select>
        )}
      </div>

      {view === 'board' && orgId ? <TaskKanban orgId={orgId} canUpdate={canUpdate} employeeName={getEmployeeName} onChange={() => void loadTasks()}
        filters={{ status: statusFilter || undefined, priority: priorityFilter || undefined, departmentId: deptFilter || undefined, assigneeEmployeeId: assigneeFilter || undefined }} /> : isLoading ? <LoadingState message="Đang tải danh sách công việc..." /> : tasks.length === 0 ? (
        <EmptyState
          title="Không tìm thấy công việc nào"
          description="Tạo công việc đầu tiên để bắt đầu theo dõi tiến độ."
          action={
            canCreate ? (
              <button onClick={() => setCreateOpen(true)} className="btn-primary text-sm"><Plus className="h-4 w-4 mr-1" />Tạo công việc</button>
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
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Tiêu đề</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Trạng thái</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 w-36">Tiến độ</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Độ ưu tiên</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Người phụ trách</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Phòng ban</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Hạn chót</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((task) => (
                    <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)} className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900">{task.title}</span>
                      </td>
                      <td className="px-4 py-3"><TaskStatusBadge status={task.status} /></td>
                      <td className="px-4 py-3 w-36">
                        <TaskProgressBar progress={task.progressPercent ?? 0} status={task.status} size="sm" />
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{getEmployeeName(task.assigneeEmployeeId)}</td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{getDeptName(task.departmentId)}</td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                        {task.dueAt ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(task.dueAt), 'dd/MM/yyyy')}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination hasMore={!!nextCursor} onLoadMore={() => { setIsLoadingMore(true); loadTasks(nextCursor!); }} isLoading={isLoadingMore} />
        </>
      )}

      {/* Create Task Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Thêm công việc mới" size="lg">
        {formErrors.general && <div className="mb-4 p-3 rounded-lg bg-red-50 text-sm text-red-700" role="alert">{formErrors.general}</div>}
        <FormField label="Tiêu đề công việc" htmlFor="task-title" required><input id="task-title" className="input-field" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} maxLength={200} placeholder="Nhập tiêu đề công việc" /></FormField>
        <FormField label="Mô tả chi tiết" htmlFor="task-desc" hint="Không bắt buộc"><textarea id="task-desc" className="input-field min-h-[100px]" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} maxLength={10000} placeholder="Mô tả nội dung công việc..." /></FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Độ ưu tiên" htmlFor="task-priority">
            <select id="task-priority" className="input-field" value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value as TaskPriority})}>
              <option value="LOW">Thấp</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn cấp</option>
            </select>
          </FormField>
          <FormField label="Hạn hoàn thành" htmlFor="task-due" hint="Không bắt buộc">
            <input id="task-due" type="datetime-local" className="input-field" value={formData.dueAt} onChange={(e) => setFormData({...formData, dueAt: e.target.value})} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Phòng ban" htmlFor="task-dept" hint="Không bắt buộc">
            <select id="task-dept" className="input-field" value={formData.departmentId} onChange={(e) => setFormData({...formData, departmentId: e.target.value})}>
              <option value="">Không chọn phòng ban</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </FormField>
          {canAssign && (
            <FormField label="Người phụ trách" htmlFor="task-assignee" hint={!canReadEmp ? 'Cần quyền xem nhân sự để chọn người phụ trách.' : undefined}>
              <select id="task-assignee" className="input-field" disabled={!canReadEmp} value={formData.assigneeEmployeeId} onChange={(e) => setFormData({...formData, assigneeEmployeeId: e.target.value})}>
                <option value="">Chưa phân công</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.displayName}</option>)}
              </select>
            </FormField>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setCreateOpen(false)} className="btn-secondary" disabled={isSaving}>Hủy</button>
          <button onClick={handleCreate} className="btn-primary" disabled={isSaving || !formData.title.trim()}>{isSaving ? 'Đang tạo...' : 'Tạo công việc'}</button>
        </div>
      </Modal>
    </div>
  );
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckSquare, History, Pencil, Trash2, UserCheck } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { useCursorList } from '@/hooks/useCursorList';
import { listEmployees } from '@/api/employees';
import { isApiError } from '@/api/client';
import { addChecklistItem, getTaskPlanning, listTaskActivity, removeChecklistItem, setTaskReviewer, updateChecklistItem } from '@/api/task-planning';
import type { TaskPlanning } from '@/api/task-planning';
import type { Task } from '@/api/types';
import { activityLabel } from '@/features/dashboard/activity-labels';

function message(error: unknown) {
  if (isApiError(error)) {
    if (error.error.code === 'FORBIDDEN') return 'Bạn không có quyền thực hiện thao tác này.';
    if (error.error.code === 'CONFLICT') return 'Dữ liệu đã thay đổi hoặc công việc đã kết thúc. Hãy tải lại trước khi tiếp tục.';
    if (error.error.code === 'NOT_FOUND') return 'Dữ liệu không còn tồn tại trong tổ chức này.';
  }
  return 'Không thể xử lý yêu cầu. Vui lòng thử lại.';
}

export function TaskPlanningPanel({ task }: { task: Task }) {
  const { currentOrg } = useOrganization();
  const { hasPermission, isLoading } = usePermission();
  if (!currentOrg || currentOrg.id !== task.organizationId || isLoading || !hasPermission('task:read')) return null;
  return <PlanningContent key={`${currentOrg.id}:${task.id}`} task={task} canUpdate={hasPermission('task:update')}
    canAssign={hasPermission('task:assign')} canReadEmployees={hasPermission('employee:read')} />;
}

function PlanningContent({ task, canUpdate, canAssign, canReadEmployees }: {
  task: Task; canUpdate: boolean; canAssign: boolean; canReadEmployees: boolean;
}) {
  const orgId = task.organizationId;
  const [data, setData] = useState<TaskPlanning | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [revision, setRevision] = useState(0);
  const alive = useRef(false);
  const serial = useRef(0);
  const terminal = task.status === 'DONE' || task.status === 'CANCELLED';
  useEffect(() => { const generation = serial; alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  const reload = useCallback(async () => {
    const id = ++serial.current;
    setLoading(true); setError('');
    try { const result = await getTaskPlanning(orgId, task.id); if (alive.current && id === serial.current) setData(result); }
    catch (err) { if (alive.current && id === serial.current) { setData(null); setError(message(err)); } }
    finally { if (alive.current && id === serial.current) setLoading(false); }
  }, [orgId, task.id]);
  useEffect(() => { void reload(); }, [reload, canReadEmployees]);
  const mutate = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await operation();
      if (!alive.current) return;
      setTitle(''); setEditing(null); setRevision((value) => value + 1); await reload();
    } catch (err) { if (alive.current) setError(message(err)); }
    finally { if (alive.current) setBusy(false); }
  };
  const completed = data?.checklist.filter((item) => item.isCompleted).length ?? 0;
  return <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6" aria-label="Kế hoạch công việc">
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 className="font-semibold flex items-center gap-2"><CheckSquare className="h-4 w-4" />Danh sách kiểm tra</h2>
        {data && <span className="text-sm text-slate-500">{completed}/{data.checklist.length} hoàn tất</span>}</div>
      <p className="text-xs text-slate-500 mb-4">Các bước nhỏ của công việc. Tiến độ công việc được cập nhật riêng.</p>
      {error && <div role="alert" className="mb-3 text-sm text-red-700">{error} <button className="underline" onClick={() => void reload()}>Tải lại</button></div>}
      {loading ? <p role="status" className="text-sm text-slate-500">Đang tải kế hoạch...</p> : data && <>
        {data.checklist.length === 0 && <p className="text-sm text-slate-500 mb-4">Chưa có mục kiểm tra.</p>}
        <ul className="space-y-3 mb-4">{data.checklist.map((item) => <li key={item.id} className="flex items-start gap-2">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" aria-label={item.title} checked={item.isCompleted} disabled={!canUpdate || terminal || busy}
            onChange={() => void mutate(() => updateChecklistItem(orgId, task.id, item.id, { isCompleted: !item.isCompleted }))} />
          {editing === item.id ? <form className="flex-1 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void mutate(() => updateChecklistItem(orgId, task.id, item.id, { title: editTitle.trim() })); }}>
            <input aria-label="Sửa nội dung mục kiểm tra" className="input-field flex-1" maxLength={200} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} disabled={busy} autoFocus />
            <button className="btn-primary text-xs" disabled={busy || !editTitle.trim()}>Lưu</button><button type="button" className="btn-secondary text-xs" onClick={() => setEditing(null)} disabled={busy}>Hủy</button>
          </form> : <span className={`flex-1 text-sm break-words min-w-0 ${item.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.title}</span>}
          {canUpdate && !terminal && editing !== item.id && <>
            <button disabled={busy} className="p-1 text-slate-500 hover:text-brand-600" aria-label={`Sửa mục ${item.title}`} onClick={() => { setEditing(item.id); setEditTitle(item.title); }}><Pencil className="h-4 w-4" /></button>
            <button disabled={busy} className="p-1 text-slate-500 hover:text-red-600" aria-label={`Xóa mục ${item.title}`} onClick={() => void mutate(() => removeChecklistItem(orgId, task.id, item.id))}><Trash2 className="h-4 w-4" /></button>
          </>}
        </li>)}</ul>
        {canUpdate && !terminal && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void mutate(() => addChecklistItem(orgId, task.id, title.trim())); }}>
          <input aria-label="Mục kiểm tra mới" className="input-field min-w-0" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Thêm một bước cần làm..." disabled={busy || data.checklist.length >= 100} />
          <button className="btn-primary shrink-0" disabled={busy || !title.trim() || data.checklist.length >= 100}>Thêm mục</button>
        </form>}
        {data.checklist.length >= 100 && <p className="text-xs text-slate-500 mt-2">Đã đạt giới hạn 100 mục.</p>}
      </>}
      {terminal && <p className="text-xs text-slate-500 mt-3">Công việc đã kết thúc. Kế hoạch được giữ lại để tra cứu.</p>}
    </div>
    <div className="space-y-6">
      <div className="card p-5"><h2 className="font-semibold flex items-center gap-2 mb-3"><UserCheck className="h-4 w-4" />Người kiểm tra</h2>
        <p className="text-sm text-slate-700 mb-2">{loading ? 'Đang tải...' : data ? data.reviewer ? canReadEmployees ? data.reviewer.displayName ?? 'Không thể xem tên nhân sự' : 'Đã chỉ định người kiểm tra' : 'Chưa chỉ định' : 'Không thể tải người kiểm tra'}</p>
        <p className="text-xs text-slate-500 mb-3">Vai trò phối hợp; không tự cấp quyền hoặc thay thế quy trình phê duyệt.</p>
        {canAssign && !terminal && data && <>
          {canReadEmployees ? <ReviewerPicker key={String(canReadEmployees)} orgId={orgId} selected={data.reviewer?.employeeId ?? ''} disabled={busy || loading}
            onSelect={(id) => void mutate(() => setTaskReviewer(orgId, task.id, id || null))} /> : <p className="text-xs text-slate-500">Cần quyền xem nhân sự để chọn người kiểm tra.</p>}
          {data.reviewer && <button className="btn-secondary text-xs mt-2" disabled={busy || loading} onClick={() => void mutate(() => setTaskReviewer(orgId, task.id, null))}>Bỏ người kiểm tra</button>}
        </>}
      </div>
      <TaskHistory key={`${revision}:${task.updatedAt}`} orgId={orgId} taskId={task.id} />
    </div>
  </section>;
}

function ReviewerPicker({ orgId, selected, disabled, onSelect }: { orgId: string; selected: string; disabled: boolean; onSelect: (id: string) => void }) {
  const load = useCallback((after?: string) => listEmployees(orgId, { limit: 50, status: 'ACTIVE', after }), [orgId]);
  const page = useCursorList(orgId, load);
  return <div>
    <select className="input-field" aria-label="Chọn người kiểm tra" value={selected} disabled={disabled || page.loading} onChange={(event) => onSelect(event.target.value)}>
      <option value="">Chưa chỉ định</option>
      {selected && !page.items.some((item) => item.id === selected) && <option value={selected}>Người kiểm tra hiện tại</option>}
      {page.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName} · {employee.employeeCode}</option>)}
    </select>
    {page.error ? <p role="alert" className="text-xs text-red-700 mt-2">{message(page.error)} <button className="underline" onClick={page.refresh}>Thử lại</button></p> : null}
    {page.loading && <p className="text-xs text-slate-500 mt-2" role="status">Đang tải nhân sự...</p>}
    {page.nextCursor && <button className="text-xs text-brand-600 mt-2" onClick={page.loadMore} disabled={page.loading}>Tải thêm nhân sự</button>}
  </div>;
}

function TaskHistory({ orgId, taskId }: { orgId: string; taskId: string }) {
  const load = useCallback((after?: string) => listTaskActivity(orgId, taskId, after), [orgId, taskId]);
  const page = useCursorList(`${orgId}:${taskId}`, load);
  return <div className="card p-5"><h2 className="font-semibold flex items-center gap-2 mb-3"><History className="h-4 w-4" />Lịch sử công việc</h2>
    <p className="text-xs text-slate-500 mb-3">Mới nhất trước. Bình luận và tài liệu nằm trong các mục bên dưới.</p>
    {page.error ? <p role="alert" className="text-sm text-red-700">{message(page.error)} <button className="underline" onClick={page.refresh}>Thử lại</button></p> : null}
    {!page.loading && !page.error && !page.items.length && <p className="text-sm text-slate-500">Chưa có hoạt động.</p>}
    <ol className="space-y-3">{page.items.map((event) => <li key={event.id} className="text-sm border-l-2 border-brand-100 pl-3"><p>{activityLabel(event.event)}</p><time className="text-xs text-slate-500" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('vi-VN')}</time></li>)}</ol>
    {page.loading && <p role="status" className="text-sm text-slate-500">Đang tải lịch sử...</p>}
    {page.nextCursor && <button className="btn-secondary text-xs mt-3" disabled={page.loading} onClick={page.loadMore}>Tải thêm lịch sử</button>}
  </div>;
}

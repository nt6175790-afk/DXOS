// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TaskPlanningPanel } from '@/features/tasks/TaskPlanningPanel';
import { TaskKanban } from '@/features/tasks/TaskKanban';
import * as planning from '@/api/task-planning';
import * as tasks from '@/api/tasks';
import * as employees from '@/api/employees';
import type { Task } from '@/api/types';

const state = vi.hoisted(() => ({ orgId: 'org-a', permissions: new Set<string>() }));
vi.mock('@/contexts/OrganizationContext', () => ({ useOrganization: () => ({ currentOrg: { id: state.orgId } }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: (key: string) => state.permissions.has(key), isLoading: false }) }));
vi.mock('@/api/task-planning');
vi.mock('@/api/tasks');
vi.mock('@/api/employees');
const timestamp = '2026-09-16T00:00:00.000Z';
const task: Task = { id: 'task-a', organizationId: 'org-a', title: 'Công việc A', status: 'TODO', priority: 'HIGH',
  progressPercent: 0, creatorEmployeeId: 'creator', assigneeEmployeeId: null, departmentId: null, description: null,
  dueAt: '2020-01-01T00:00:00Z', createdAt: timestamp, updatedAt: timestamp };
const item = { id: 'item-a', taskId: task.id, title: 'Kiểm tra tài liệu', isCompleted: false, createdAt: timestamp, updatedAt: timestamp };
const emptyPlanning = { reviewer: null, checklist: [] };
const denied = { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'test' } };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  vi.resetAllMocks(); state.orgId = 'org-a'; state.permissions = new Set(['task:read', 'task:update', 'task:assign', 'employee:read']);
  vi.mocked(planning.getTaskPlanning).mockResolvedValue({ reviewer: null, checklist: [item] });
  vi.mocked(planning.listTaskActivity).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(employees.listEmployees).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(tasks.listTasks).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(tasks.updateTask).mockResolvedValue(task);
});

describe('Task planning UI', () => {
  it('loads checklist and history only in the authenticated current organization', async () => {
    render(<TaskPlanningPanel task={task} />);
    expect(await screen.findByRole('checkbox', { name: item.title })).not.toBeChecked();
    expect(planning.getTaskPlanning).toHaveBeenCalledWith('org-a', 'task-a');
    expect(planning.listTaskActivity).toHaveBeenCalledWith('org-a', 'task-a', undefined);
    expect(screen.getByText('0/1 hoàn tất')).toBeInTheDocument();
  });
  it('handles checklist create, completion, rename and removal with server reload', async () => {
    render(<TaskPlanningPanel task={task} />); await screen.findByText(item.title);
    fireEvent.change(screen.getByLabelText('Mục kiểm tra mới'), { target: { value: '  Bước mới  ' } }); fireEvent.click(screen.getByText('Thêm mục'));
    await waitFor(() => expect(planning.addChecklistItem).toHaveBeenCalledWith('org-a', 'task-a', 'Bước mới'));
    await waitFor(() => expect(screen.getByLabelText(item.title)).toBeEnabled());
    fireEvent.click(screen.getByLabelText(item.title));
    await waitFor(() => expect(planning.updateChecklistItem).toHaveBeenCalledWith('org-a', 'task-a', 'item-a', { isCompleted: true }));
    await waitFor(() => expect(screen.getByLabelText(`Sửa mục ${item.title}`)).toBeEnabled());
    fireEvent.click(screen.getByLabelText(`Sửa mục ${item.title}`)); fireEvent.change(screen.getByLabelText('Sửa nội dung mục kiểm tra'), { target: { value: 'Đã sửa' } }); fireEvent.click(screen.getByText('Lưu'));
    await waitFor(() => expect(planning.updateChecklistItem).toHaveBeenCalledWith('org-a', 'task-a', 'item-a', { title: 'Đã sửa' }));
    await waitFor(() => expect(screen.getByLabelText(`Xóa mục ${item.title}`)).toBeEnabled()); fireEvent.click(screen.getByLabelText(`Xóa mục ${item.title}`));
    await waitFor(() => expect(planning.removeChecklistItem).toHaveBeenCalledWith('org-a', 'task-a', 'item-a'));
    expect(tasks.updateTask).not.toHaveBeenCalled();
  });
  it('pages reviewer choices and submits a scoped employee reference', async () => {
    const employee = { id: 'emp-b', organizationId: 'org-a', displayName: 'Trần Mai', employeeCode: 'EMP2', userId: 'user-b', departmentId: null, jobTitle: null, phone: null, status: 'ACTIVE' as const, createdAt: timestamp, updatedAt: timestamp };
    vi.mocked(employees.listEmployees).mockResolvedValueOnce({ items: [], nextCursor: 'cursor' }).mockResolvedValueOnce({ items: [employee], nextCursor: null });
    render(<TaskPlanningPanel task={task} />);
    fireEvent.click(await screen.findByText('Tải thêm nhân sự')); await screen.findByText('Trần Mai · EMP2');
    fireEvent.change(screen.getByLabelText('Chọn người kiểm tra'), { target: { value: 'emp-b' } });
    await waitFor(() => expect(planning.setTaskReviewer).toHaveBeenCalledWith('org-a', 'task-a', 'emp-b'));
    expect(employees.listEmployees).toHaveBeenLastCalledWith('org-a', { limit: 50, status: 'ACTIVE', after: 'cursor' });
  });
  it('hides editing without explicit update/assign permissions and avoids employee reads', async () => {
    state.permissions = new Set(['task:read']); render(<TaskPlanningPanel task={task} />);
    expect(await screen.findByLabelText(item.title)).toBeDisabled();
    expect(screen.queryByLabelText('Mục kiểm tra mới')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Chọn người kiểm tra')).not.toBeInTheDocument(); expect(employees.listEmployees).not.toHaveBeenCalled();
  });
  it.each(['DONE', 'CANCELLED'] as const)('keeps %s plans read-only', async (status) => {
    render(<TaskPlanningPanel task={{ ...task, status }} />); expect(await screen.findByLabelText(item.title)).toBeDisabled();
    expect(screen.queryByText('Thêm mục')).not.toBeInTheDocument(); expect(screen.queryByLabelText('Chọn người kiểm tra')).not.toBeInTheDocument();
  });
  it('handles empty, read error and retry states without showing success', async () => {
    vi.mocked(planning.getTaskPlanning).mockRejectedValueOnce(denied).mockResolvedValueOnce(emptyPlanning);
    render(<TaskPlanningPanel task={task} />); expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền');
    fireEvent.click(screen.getByText('Tải lại')); expect(await screen.findByText('Chưa có mục kiểm tra.')).toBeInTheDocument();
  });
  it('shows rejected mutations and retains the unchecked value', async () => {
    vi.mocked(planning.updateChecklistItem).mockRejectedValue(denied); render(<TaskPlanningPanel task={task} />);
    fireEvent.click(await screen.findByLabelText(item.title)); expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền'); expect(screen.getByLabelText(item.title)).not.toBeChecked();
  });
  it('ignores late responses when switching organization', async () => {
    const pending = deferred<planning.TaskPlanning>(); vi.mocked(planning.getTaskPlanning).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(emptyPlanning);
    const view = render(<TaskPlanningPanel task={task} />); state.orgId = 'org-b'; view.rerender(<TaskPlanningPanel task={{ ...task, organizationId: 'org-b', id: 'task-b' }} />);
    await screen.findByText('Chưa có mục kiểm tra.'); await act(async () => pending.resolve({ reviewer: null, checklist: [item] }));
    expect(screen.queryByText(item.title)).not.toBeInTheDocument();
  });
  it('does not request another organization or a task without read permission', () => {
    const view = render(<TaskPlanningPanel task={{ ...task, organizationId: 'foreign' }} />); expect(planning.getTaskPlanning).not.toHaveBeenCalled();
    state.permissions.clear(); view.rerender(<TaskPlanningPanel task={task} />); expect(planning.getTaskPlanning).not.toHaveBeenCalled();
  });
  it('pages task history without exposing raw event keys', async () => {
    vi.mocked(planning.listTaskActivity).mockResolvedValueOnce({ items: [{ id: 'event-1', event: 'task.created', createdAt: timestamp }], nextCursor: 'event-1' })
      .mockResolvedValueOnce({ items: [{ id: 'event-2', event: 'task.reviewer.changed', createdAt: timestamp }], nextCursor: null });
    render(<TaskPlanningPanel task={task} />); fireEvent.click(await screen.findByText('Tải thêm lịch sử')); expect(await screen.findByText('Đổi người kiểm tra')).toBeInTheDocument();
    expect(planning.listTaskActivity).toHaveBeenLastCalledWith('org-a', 'task-a', 'event-1');
  });
});

describe('Kanban', () => {
  const props = { orgId: 'org-a', filters: {}, canUpdate: true, onChange: vi.fn(), employeeName: () => 'Nhân viên' };
  it('loads each status independently, pages and uses existing status API', async () => {
    vi.mocked(tasks.listTasks).mockImplementation(async (_org, params) => ({ items: params?.status === 'TODO' ? params.after ? [{ ...task, id: 'task-2', title: 'Trang hai' }] : [task] : [], nextCursor: params?.status === 'TODO' && !params.after ? 'task-a' : null }));
    render(<MemoryRouter><TaskKanban {...props} /></MemoryRouter>); await screen.findByText('Công việc A');
    expect(tasks.listTasks).toHaveBeenCalledTimes(4); fireEvent.click(screen.getByText('Tải thêm cần làm')); await screen.findByText('Trang hai');
    expect(tasks.listTasks).toHaveBeenCalledWith('org-a', expect.objectContaining({ status: 'TODO', after: 'task-a', limit: 25 }));
    fireEvent.change(screen.getByLabelText('Chuyển trạng thái Công việc A'), { target: { value: 'IN_PROGRESS' } });
    await waitFor(() => expect(tasks.updateTask).toHaveBeenCalledWith('org-a', 'task-a', { status: 'IN_PROGRESS' }));
    expect(props.onChange).toHaveBeenCalledTimes(1);
  });
  it('does not offer terminal reopening or editing without permission', async () => {
    vi.mocked(tasks.listTasks).mockImplementation(async (_org, params) => ({ items: [{ ...task, id: params?.status ?? '', status: params!.status! }], nextCursor: null }));
    const view = render(<MemoryRouter><TaskKanban {...props} /></MemoryRouter>); await screen.findAllByText('Công việc A');
    expect(within(screen.getByRole('region', { name: 'Cột Hoàn thành' })).queryByRole('combobox')).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><TaskKanban {...props} canUpdate={false} /></MemoryRouter>); expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
  it('honors filters and prevents stale cards after an organization switch', async () => {
    const pending = deferred<{ items: Task[]; nextCursor: null }>(); vi.mocked(tasks.listTasks).mockReturnValueOnce(pending.promise).mockResolvedValue({ items: [], nextCursor: null });
    const view = render(<MemoryRouter><TaskKanban {...props} filters={{ status: 'TODO', priority: 'URGENT' }} /></MemoryRouter>);
    expect(tasks.listTasks).toHaveBeenCalledWith('org-a', expect.objectContaining({ status: 'TODO', priority: 'URGENT' }));
    view.rerender(<MemoryRouter><TaskKanban {...props} orgId="org-b" filters={{ status: 'TODO' }} /></MemoryRouter>);
    await screen.findByText('Chưa có công việc.'); await act(async () => pending.resolve({ items: [task], nextCursor: null })); expect(screen.queryByText(task.title)).not.toBeInTheDocument();
  });
  it('displays independent column errors and supports retry', async () => {
    vi.mocked(tasks.listTasks).mockRejectedValueOnce(denied).mockResolvedValue({ items: [], nextCursor: null });
    render(<MemoryRouter><TaskKanban {...props} filters={{ status: 'TODO' }} /></MemoryRouter>); expect(await screen.findByRole('alert')).toHaveTextContent('Không có quyền');
    fireEvent.click(screen.getByText('Thử lại')); expect(await screen.findByText('Chưa có công việc.')).toBeInTheDocument();
  });
});

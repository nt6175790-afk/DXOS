// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getDashboard, type DashboardData } from '@/api/dashboard';
import { usePermission } from '@/hooks/usePermission';

vi.mock('@/contexts/OrganizationContext', () => ({ useOrganization: vi.fn() }));
vi.mock('@/api/dashboard', () => ({ getDashboard: vi.fn() }));
const orgA = { id: 'org-a', name: 'Tổ chức A', slug: 'a', status: 'ACTIVE' as const, createdAt: '', updatedAt: '' };
const orgB = { ...orgA, id: 'org-b', name: 'Tổ chức B' };
function organization(org = orgA) {
  vi.mocked(useOrganization).mockReturnValue({ currentOrg: org, organizations: [orgA, orgB], isLoading: false, error: null,
    setCurrentOrg: vi.fn(), refreshOrganizations: vi.fn() });
}
const snapshot = (organizationId = 'org-a'): DashboardData => ({ organizationId, generatedAt: '2026-09-15T00:00:00Z',
  tasks: { total: 126, byStatus: { TODO: 10, IN_PROGRESS: 20, DONE: 90, CANCELLED: 6 }, open: 30, overdue: 9, unassigned: 4,
    completionPercent: 75, health: 'ATTENTION', overdueItems: [{ id: 'task-a', title: 'Hợp đồng quý 3', priority: 'HIGH', status: 'TODO', progressPercent: 0, dueAt: '2026-09-01T00:00:00Z' }], overdueHasMore: true },
  departments: { total: 42, active: 40, inactive: 2, items: [{ id: 'dept-a', name: 'Kỹ thuật', status: 'ACTIVE', employeeCount: 17, openTasks: 8 }], hasMore: true },
  employees: { total: 123, active: 120, inactive: 3 }, workload: { items: [{ employeeId: 'emp-a', displayName: 'Nguyễn An', status: 'ACTIVE', openTasks: 8 }], hasMore: false },
  notifications: { total: 70, unread: 41 }, activity: { items: [{ id: 'event-a', event: 'task.created', resourceType: 'task', resourceId: 'task-a', outcome: 'SUCCESS', createdAt: '2026-09-15T00:00:00Z' }], hasMore: false },
});
const page = () => <MemoryRouter><DashboardPage /></MemoryRouter>;
describe('Dashboard aggregates and organization isolation', () => {
  it('hides creation shortcuts for a read-only operator', async () => {
    const mocked = vi.mocked(usePermission);
    const original = mocked.getMockImplementation();
    mocked.mockReturnValue({ permissions: ['task:read'], hasPermission: p => p === 'task:read', hasAnyPermission: (...p) => p.includes('task:read'), isLoading: false, error: null, refreshPermissions: vi.fn() });
    try {
      render(page());
      await screen.findByRole('link', { name: 'Nhân sự: 123' });
      expect(screen.queryByRole('link', { name: 'Thêm công việc' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Thêm nhân sự' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Hỏi Trợ lý AI' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Lịch đi làm' })).toBeInTheDocument();
    } finally { if (original) mocked.mockImplementation(original); }
  });
  beforeEach(() => { vi.clearAllMocks(); organization(); vi.mocked(getDashboard).mockResolvedValue(snapshot()); });
  it('renders exact aggregate KPIs, charts, workload and Vietnamese activity labels', async () => {
    render(page());
    expect(await screen.findByRole('link', { name: 'Nhân sự: 123' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Phòng ban: 42' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thông báo chưa đọc: 41' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tỷ lệ hoàn thành: 75%' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Hoàn thành' })).toHaveAttribute('aria-valuenow', '90');
    expect(screen.getByRole('link', { name: /Hợp đồng quý 3/ })).toHaveAttribute('href', '/tasks/task-a');
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByText('Tạo công việc')).toBeInTheDocument();
    expect(getDashboard).toHaveBeenCalledWith('org-a');
  });
  it('does not present forbidden sections as zero', async () => {
    vi.mocked(getDashboard).mockResolvedValue({ ...snapshot(), tasks: null, employees: null, departments: null, workload: null, activity: null });
    render(page());
    expect(await screen.findByRole('link', { name: 'Nhân sự: —' })).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn An')).not.toBeInTheDocument();
    expect(screen.getAllByText('Bạn chưa có quyền xem dữ liệu này.')).toHaveLength(5);
  });
  it('distinguishes real empty data and missing denominator', async () => {
    const data = snapshot();
    data.tasks = { ...data.tasks!, total: 0, byStatus: { TODO: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 }, open: 0, overdue: 0, unassigned: 0, completionPercent: null, health: 'EMPTY', overdueItems: [], overdueHasMore: false };
    vi.mocked(getDashboard).mockResolvedValue(data); render(page());
    expect(await screen.findByText('Chưa có công việc để thống kê.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Công việc đang mở: 0' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tỷ lệ hoàn thành: —' })).toBeInTheDocument();
  });
  it('shows errors and retries rather than rendering false zero KPIs', async () => {
    vi.mocked(getDashboard).mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup(); render(page());
    expect(await screen.findByText('Không thể tải dữ liệu. Vui lòng thử lại.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Nhân sự:/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('link', { name: 'Nhân sự: 123' })).toBeInTheDocument();
  });
  it('shows permission denied for an inaccessible organization', async () => {
    vi.mocked(getDashboard).mockRejectedValue({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: '' } });
    render(page());
    expect(await screen.findByText(/không có quyền/i)).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn An')).not.toBeInTheDocument();
  });
  it('discards an old organization response even if it completes after the new one', async () => {
    let finishA!: (data: DashboardData) => void;
    vi.mocked(getDashboard).mockImplementation((org) => org === 'org-a' ? new Promise((resolve) => { finishA = resolve; }) : Promise.resolve({ ...snapshot('org-b'), workload: null }));
    const view = render(page()); organization(orgB); view.rerender(page());
    expect(await screen.findByText(/Tổ chức B — Dữ liệu/)).toBeInTheDocument();
    await act(async () => { finishA(snapshot()); });
    expect(screen.queryByText('Nguyễn An')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tổ chức A — Dữ liệu/)).not.toBeInTheDocument();
  });
  it('clears already rendered data immediately on organization switch', async () => {
    const view = render(page()); expect(await screen.findByText('Nguyễn An')).toBeInTheDocument();
    vi.mocked(getDashboard).mockImplementation(() => new Promise(() => {}));
    organization(orgB); view.rerender(page());
    expect(screen.queryByText('Nguyễn An')).not.toBeInTheDocument();
    expect(screen.getAllByText('Đang tải bảng tổng quan...').length).toBeGreaterThan(0);
  });
  it('rejects a response for the wrong organization and refreshes matching data', async () => {
    vi.mocked(getDashboard).mockResolvedValueOnce(snapshot('org-b'));
    const user = userEvent.setup(); render(page());
    expect(await screen.findByText('Dữ liệu tổng quan không khớp tổ chức hiện tại.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Nguyễn An')).toBeInTheDocument());
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LeavePage } from '@/features/leave/LeavePage';
import * as leaveApi from '@/api/leave';
import * as employeesApi from '@/api/employees';

const state = vi.hoisted(() => ({
  orgId: 'org-1',
  userId: 'user-actor',
  permissions: new Set<string>(),
}));

vi.mock('@/api/leave');
vi.mock('@/api/employees');
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: state.userId, email: 'actor@dxos.test', displayName: 'Actor User' },
    isAuthenticated: true,
  }),
}));
vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: () => ({ currentOrg: { id: state.orgId, name: 'DX-OS Corp' } }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    hasPermission: (key: string) => state.permissions.has(key),
    isLoading: false,
  }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const mockActorEmployee = {
  id: 'emp-actor',
  organizationId: 'org-1',
  userId: 'user-actor',
  employeeCode: 'EMP001',
  displayName: 'Actor User',
  departmentId: 'dept-1',
  jobTitle: 'Developer',
  phone: '0901234567',
  status: 'ACTIVE' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockOtherEmployee = {
  id: 'emp-other',
  organizationId: 'org-1',
  userId: 'user-other',
  employeeCode: 'EMP002',
  displayName: 'Other Colleague',
  departmentId: 'dept-1',
  jobTitle: 'Designer',
  phone: '0907654321',
  status: 'ACTIVE' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockMyLeave: leaveApi.LeaveRequest = {
  id: 'leave-1',
  organizationId: 'org-1',
  employeeId: 'emp-actor',
  createdByUserId: 'user-actor',
  leaveType: 'ANNUAL',
  startsAt: '2026-10-05T01:00:00.000Z',
  endsAt: '2026-10-06T10:00:00.000Z',
  daysCount: 2,
  reason: 'Nghỉ du lịch gia đình',
  status: 'PENDING',
  reviewerUserId: null,
  reviewerNote: null,
  reviewedAt: null,
  calendarEventId: null,
  createdAt: '2026-09-16T08:00:00.000Z',
  updatedAt: '2026-09-16T08:00:00.000Z',
  employee: {
    id: 'emp-actor',
    employeeCode: 'EMP001',
    displayName: 'Actor User',
    jobTitle: 'Developer',
    departmentId: 'dept-1',
    department: { id: 'dept-1', name: 'Công nghệ thông tin', code: 'IT' },
  },
};

const mockOtherLeave: leaveApi.LeaveRequest = {
  id: 'leave-2',
  organizationId: 'org-1',
  employeeId: 'emp-other',
  createdByUserId: 'user-other',
  leaveType: 'SICK',
  startsAt: '2026-10-08T01:00:00.000Z',
  endsAt: '2026-10-08T10:00:00.000Z',
  daysCount: 1,
  reason: 'Nghỉ khám sức khỏe định kỳ',
  status: 'PENDING',
  reviewerUserId: null,
  reviewerNote: null,
  reviewedAt: null,
  calendarEventId: null,
  createdAt: '2026-09-16T08:30:00.000Z',
  updatedAt: '2026-09-16T08:30:00.000Z',
  employee: {
    id: 'emp-other',
    employeeCode: 'EMP002',
    displayName: 'Other Colleague',
    jobTitle: 'Designer',
    departmentId: 'dept-1',
    department: { id: 'dept-1', name: 'Thiết kế', code: 'DESIGN' },
  },
};

function renderLeavePage() {
  return render(
    <MemoryRouter>
      <LeavePage />
    </MemoryRouter>,
  );
}

describe('LeavePage and Modals', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.orgId = 'org-1';
    state.userId = 'user-actor';
    state.permissions = new Set(['leave:read', 'leave:create', 'leave:approve', 'leave:cancel', 'employee:read']);

    vi.mocked(employeesApi.listEmployees).mockResolvedValue({
      items: [mockActorEmployee],
      nextCursor: null,
    });
    vi.mocked(leaveApi.listLeaveRequests).mockImplementation(async (_orgId, query) => {
      if (query?.mine) {
        return { items: [mockMyLeave], nextCursor: null };
      }
      return { items: [mockMyLeave, mockOtherLeave], nextCursor: null };
    });
    vi.mocked(leaveApi.createLeaveRequest).mockResolvedValue(mockMyLeave);
    vi.mocked(leaveApi.approveLeaveRequest).mockResolvedValue({ ...mockOtherLeave, status: 'APPROVED' });
    vi.mocked(leaveApi.rejectLeaveRequest).mockResolvedValue({ ...mockOtherLeave, status: 'REJECTED' });
    vi.mocked(leaveApi.cancelLeaveRequest).mockResolvedValue({ ...mockMyLeave, status: 'CANCELLED' });
  });

  it('renders Leave Page with title and KPI cards', async () => {
    renderLeavePage();
    expect(await screen.findByText('Quản lý nghỉ phép')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đơn của tôi/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chờ duyệt/i })).toBeInTheDocument();
    expect(await screen.findByText('Nghỉ du lịch gia đình')).toBeInTheDocument();
  });

  it('hides Approvals tab when user lacks leave:approve permission', async () => {
    state.permissions = new Set(['leave:read', 'leave:create']);
    renderLeavePage();
    expect(await screen.findByText('Quản lý nghỉ phép')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đơn của tôi/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chờ duyệt/i })).not.toBeInTheDocument();
  });

  it('opens CreateLeaveModal and submits leave request', async () => {
    renderLeavePage();
    const createBtn = await screen.findByRole('button', { name: /Tạo đơn nghỉ phép/i });
    fireEvent.click(createBtn);

    expect(await screen.findByRole('heading', { name: 'Tạo đơn nghỉ phép' })).toBeInTheDocument();
    const reasonInput = screen.getByPlaceholderText(/Nhập lý do nghỉ phép/i);
    fireEvent.change(reasonInput, { target: { value: 'Nghỉ phép cá nhân' } });

    const submitBtn = screen.getByRole('button', { name: 'Gửi đơn' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(leaveApi.createLeaveRequest).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          employeeId: 'emp-actor',
          leaveType: 'ANNUAL',
          reason: 'Nghỉ phép cá nhân',
        }),
      );
    });
  });

  it('prevents self-approval in Approvals tab', async () => {
    renderLeavePage();
    const approvalsTab = await screen.findByRole('button', { name: /Chờ duyệt/i });
    fireEvent.click(approvalsTab);

    // Other colleague's request should have "Duyệt" and "Từ chối" buttons
    expect(await screen.findByText('Other Colleague')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();

    // Actor user's own request must NOT be approvable by self
    expect(screen.getByText('Actor User')).toBeInTheDocument();
    expect(screen.getByText('Không thể tự duyệt')).toBeInTheDocument();
  });

  it('approves another colleague request with note', async () => {
    renderLeavePage();
    const approvalsTab = await screen.findByRole('button', { name: /Chờ duyệt/i });
    fireEvent.click(approvalsTab);

    const approveBtn = await screen.findByRole('button', { name: 'Duyệt' });
    fireEvent.click(approveBtn);

    expect(await screen.findByRole('heading', { name: 'Phê duyệt đơn nghỉ phép' })).toBeInTheDocument();
    const confirmApproveBtn = screen.getByRole('button', { name: 'Xác nhận duyệt' });
    fireEvent.click(confirmApproveBtn);

    await waitFor(() => {
      expect(leaveApi.approveLeaveRequest).toHaveBeenCalledWith('org-1', 'leave-2', expect.any(Object));
    });
  });

  it('rejects another colleague request with required reason', async () => {
    renderLeavePage();
    const approvalsTab = await screen.findByRole('button', { name: /Chờ duyệt/i });
    fireEvent.click(approvalsTab);

    const rejectBtn = await screen.findByRole('button', { name: 'Từ chối' });
    fireEvent.click(rejectBtn);

    expect(await screen.findByRole('heading', { name: 'Từ chối đơn nghỉ phép' })).toBeInTheDocument();
    const reasonTextarea = screen.getByPlaceholderText(/VD: Trùng lịch release/i);
    fireEvent.change(reasonTextarea, { target: { value: 'Dự án đang gấp' } });

    const confirmRejectBtn = screen.getByRole('button', { name: 'Xác nhận từ chối' });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(leaveApi.rejectLeaveRequest).toHaveBeenCalledWith('org-1', 'leave-2', { reason: 'Dự án đang gấp' });
    });
  });

  it('cancels own leave request with confirmation', async () => {
    renderLeavePage();
    const cancelBtn = await screen.findByRole('button', { name: 'Hủy đơn' });
    fireEvent.click(cancelBtn);

    expect(await screen.findByRole('heading', { name: 'Hủy đơn nghỉ phép' })).toBeInTheDocument();
    const confirmCancelBtn = screen.getByRole('button', { name: 'Xác nhận hủy' });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(leaveApi.cancelLeaveRequest).toHaveBeenCalledWith('org-1', 'leave-1', expect.any(Object));
    });
  });

  it('shows empty state when no leave requests exist', async () => {
    vi.mocked(leaveApi.listLeaveRequests).mockResolvedValue({ items: [], nextCursor: null });
    renderLeavePage();
    expect(await screen.findByText('Bạn chưa có đơn nghỉ phép nào')).toBeInTheDocument();
  });
});

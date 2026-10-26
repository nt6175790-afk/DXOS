// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { approvalsApi } from '@/api/approvals';
import type { ApprovalRequest, ApprovalSummary } from '@/api/types';

const state = vi.hoisted(() => ({
  orgId: 'org-1',
  userId: 'user-actor',
  permissions: new Set<string>(),
}));

vi.mock('@/api/approvals', () => ({
  approvalsApi: {
    list: vi.fn(),
    getSummary: vi.fn(),
    getById: vi.fn(),
    createAttendanceAdjustment: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('@/api/shifts', () => ({
  listShifts: vi.fn().mockResolvedValue([]),
}));

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

const mockAdjustmentReq: ApprovalRequest = {
  id: 'appr-adj-1',
  organizationId: 'org-1',
  requesterId: 'emp-other',
  type: 'ATTENDANCE_ADJUSTMENT',
  status: 'PENDING',
  title: 'Yêu cầu điều chỉnh chấm công ngày 2026-09-20',
  reason: 'Máy chấm công cửa sảnh bị lỗi kết nối mạng',
  payload: {
    workDate: '2026-09-20',
    targetCheckInAt: '2026-09-20T01:30:00.000Z',
    targetCheckOutAt: '2026-09-20T11:00:00.000Z',
    reason: 'Máy chấm công cửa sảnh bị lỗi kết nối mạng',
  },
  reviewerId: null,
  reviewerNote: null,
  reviewedAt: null,
  referenceId: 'att-1',
  createdAt: '2026-09-20T02:00:00.000Z',
  updatedAt: '2026-09-20T02:00:00.000Z',
  requester: {
    id: 'emp-other',
    employeeCode: 'EMP002',
    displayName: 'Colleague Nguyen',
    jobTitle: 'Sales Specialist',
    userId: 'user-other',
    departmentId: 'dept-1',
    department: { id: 'dept-1', name: 'Sales', code: 'SALES' },
  },
  reviewer: null,
};

const mockMyLeaveReq: ApprovalRequest = {
  id: 'appr-leave-1',
  organizationId: 'org-1',
  requesterId: 'emp-actor',
  type: 'LEAVE',
  status: 'PENDING',
  title: 'Đơn xin nghỉ phép: ANNUAL (2 ngày)',
  reason: 'Về quê việc gia đình',
  payload: {
    leaveId: 'leave-100',
    leaveType: 'ANNUAL',
    startsAt: '2026-09-25T01:00:00.000Z',
    endsAt: '2026-09-26T10:00:00.000Z',
    daysCount: 2,
    reason: 'Về quê việc gia đình',
  },
  reviewerId: null,
  reviewerNote: null,
  reviewedAt: null,
  referenceId: 'leave-100',
  createdAt: '2026-09-21T03:00:00.000Z',
  updatedAt: '2026-09-21T03:00:00.000Z',
  requester: {
    id: 'emp-actor',
    employeeCode: 'EMP001',
    displayName: 'Actor User',
    jobTitle: 'Developer',
    userId: 'user-actor',
    departmentId: 'dept-1',
  },
  reviewer: null,
};

const mockSummary: ApprovalSummary = {
  pendingCount: 1,
  approvedCount: 5,
  rejectedCount: 1,
  myPendingCount: 1,
};

describe('ApprovalsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.permissions = new Set([
      'approval:read',
      'approval:create',
      'approval:approve',
      'approval:reject',
      'approval:manage',
    ]);

    vi.mocked(approvalsApi.list).mockImplementation(async (_orgId, params) => {
      if (params?.mine) {
        return { items: [mockMyLeaveReq], nextCursor: null };
      }
      if (params?.pending) {
        return { items: [mockAdjustmentReq], nextCursor: null };
      }
      return { items: [mockAdjustmentReq, mockMyLeaveReq], nextCursor: null };
    });

    vi.mocked(approvalsApi.getSummary).mockResolvedValue(mockSummary);
  });

  it('renders KPI summary cards and unified approval inbox', async () => {
    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Quản lý Phê duyệt')).toBeInTheDocument();
    });

    // KPI cards
    expect(screen.getByText('Chờ phê duyệt')).toBeInTheDocument();
    expect(screen.getByText('Đã phê duyệt')).toBeInTheDocument();
    expect(screen.getByText('Bị từ chối')).toBeInTheDocument();
    expect(screen.getByText('Đơn của tôi chờ duyệt')).toBeInTheDocument();

    // Table rows
    expect(screen.getByText('Yêu cầu điều chỉnh chấm công ngày 2026-09-20')).toBeInTheDocument();
    expect(screen.getByText('Colleague Nguyen')).toBeInTheDocument();
  });

  it('filters requests by tab and type', async () => {
    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Quản lý Phê duyệt')).toBeInTheDocument();
    });

    // Click "Đơn của tôi" tab
    const myTab = screen.getByRole('button', { name: /Đơn của tôi/i });
    fireEvent.click(myTab);

    // In "Đơn của tôi", only mockMyLeaveReq should be visible
    await waitFor(() => {
      expect(screen.getByText('Đơn xin nghỉ phép: ANNUAL (2 ngày)')).toBeInTheDocument();
      expect(screen.queryByText('Yêu cầu điều chỉnh chấm công ngày 2026-09-20')).not.toBeInTheDocument();
    });

    // Click "Cần tôi duyệt" tab
    const reviewTab = screen.getByRole('button', { name: /Cần tôi duyệt/i });
    fireEvent.click(reviewTab);

    // In "Cần tôi duyệt", requests by others should be visible
    await waitFor(() => {
      expect(screen.getByText('Yêu cầu điều chỉnh chấm công ngày 2026-09-20')).toBeInTheDocument();
      expect(screen.queryByText('Đơn xin nghỉ phép: ANNUAL (2 ngày)')).not.toBeInTheDocument();
    });
  });

  it('opens approval detail modal and approves pending request', async () => {
    vi.mocked(approvalsApi.approve).mockResolvedValue({
      ...mockAdjustmentReq,
      status: 'APPROVED',
      reviewerId: 'emp-actor',
      reviewerNote: 'Đồng ý cập nhật công',
      reviewedAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Yêu cầu điều chỉnh chấm công ngày 2026-09-20')).toBeInTheDocument();
    });

    // Click on Chi tiết button to open modal
    const detailButtons = screen.getAllByRole('button', { name: /Chi tiết/i });
    fireEvent.click(detailButtons[0]);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText('Thông tin người gửi')).toBeInTheDocument();
      expect(screen.getByText('Chi tiết yêu cầu')).toBeInTheDocument();
    });

    // Approve button should be visible
    const approveBtn = screen.getByRole('button', { name: /^Phê duyệt$/i });
    expect(approveBtn).toBeInTheDocument();

    // Click Phê duyệt to enter approve confirm mode
    fireEvent.click(approveBtn);

    const confirmApproveBtn = screen.getByRole('button', { name: /Xác nhận duyệt/i });
    expect(confirmApproveBtn).toBeInTheDocument();

    fireEvent.click(confirmApproveBtn);

    await waitFor(() => {
      expect(approvalsApi.approve).toHaveBeenCalledWith('org-1', 'appr-adj-1', {
        note: undefined,
      });
    });
  });

  it('rejects pending request with mandatory note', async () => {
    vi.mocked(approvalsApi.reject).mockResolvedValue({
      ...mockAdjustmentReq,
      status: 'REJECTED',
      reviewerId: 'emp-actor',
      reviewerNote: 'Không có dữ liệu camera xác thực',
      reviewedAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Yêu cầu điều chỉnh chấm công ngày 2026-09-20')).toBeInTheDocument();
    });

    const detailButtons = screen.getAllByRole('button', { name: /Chi tiết/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Thông tin người gửi')).toBeInTheDocument();
    });

    // Click "Từ chối" to enter reject mode
    const rejectBtn = screen.getByRole('button', { name: /^Từ chối$/i });
    fireEvent.click(rejectBtn);

    // In reject mode, clicking without reason displays error
    const confirmRejectBtn = screen.getByRole('button', { name: /Xác nhận từ chối/i });
    fireEvent.click(confirmRejectBtn);
    expect(screen.getByText('Lý do từ chối phải có ít nhất 3 ký tự')).toBeInTheDocument();

    // Type reject reason
    const reasonInput = screen.getByPlaceholderText(/Nêu rõ lý do từ chối để nhân viên nắm được.../i);
    fireEvent.change(reasonInput, { target: { value: 'Không có dữ liệu camera xác thực' } });

    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(approvalsApi.reject).toHaveBeenCalledWith('org-1', 'appr-adj-1', {
        reason: 'Không có dữ liệu camera xác thực',
      });
    });
  });

  it('blocks self-approval buttons when actor views their own request', async () => {
    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Quản lý Phê duyệt')).toBeInTheDocument();
    });

    // Switch to "Đơn của tôi" tab to view own request
    const myTab = screen.getByRole('button', { name: /Đơn của tôi/i });
    fireEvent.click(myTab);

    await waitFor(() => {
      expect(screen.getByText('Đơn xin nghỉ phép: ANNUAL (2 ngày)')).toBeInTheDocument();
    });

    // Open detail of actor's own request
    const detailButtons = screen.getAllByRole('button', { name: /Chi tiết/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Thông tin người gửi')).toBeInTheDocument();
    });

    // Phê duyệt & Từ chối buttons MUST NOT exist
    expect(screen.queryByRole('button', { name: /^Phê duyệt$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Từ chối$/i })).not.toBeInTheDocument();

    // Hủy yêu cầu button MUST exist for own pending request
    expect(screen.getByRole('button', { name: /Hủy yêu cầu/i })).toBeInTheDocument();
  });

  it('submits a new attendance adjustment request via modal', async () => {
    vi.mocked(approvalsApi.createAttendanceAdjustment).mockResolvedValue(mockAdjustmentReq);

    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Quản lý Phê duyệt')).toBeInTheDocument();
    });

    // Open creation modal via header button
    const openBtn = screen.getByRole('button', { name: /Yêu cầu điều chỉnh chấm công/i });
    fireEvent.click(openBtn);

    // Modal opens with form
    await waitFor(() => {
      expect(screen.getByText('Giờ vào thực tế')).toBeInTheDocument();
    });

    // Fill reason
    const reasonInput = screen.getByPlaceholderText(/Ví dụ: Máy chấm công không nhận vân tay/i);
    fireEvent.change(reasonInput, { target: { value: 'Quên chấm công buổi sáng' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Gửi yêu cầu/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(approvalsApi.createAttendanceAdjustment).toHaveBeenCalled();
    });
  });
});

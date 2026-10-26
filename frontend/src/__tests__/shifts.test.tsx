// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShiftsPage } from '@/features/shifts/ShiftsPage';
import * as shiftsApi from '@/api/shifts';

const state = vi.hoisted(() => ({
  orgId: 'org-1',
  userId: 'user-actor',
  permissions: new Set<string>(),
}));

vi.mock('@/api/shifts');
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
const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockShifts: shiftsApi.Shift[] = [
  {
    id: 'shift-1',
    organizationId: 'org-1',
    name: 'Ca Hành Chính',
    code: 'HC',
    startTime: '08:30',
    endTime: '17:30',
    breakStart: '12:00',
    breakEnd: '13:00',
    gracePeriodMinutes: 10,
    isOvernight: false,
    isActive: true,
    description: 'Ca tiêu chuẩn 8 tiếng',
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
  },
  {
    id: 'shift-2',
    organizationId: 'org-1',
    name: 'Ca Đêm',
    code: 'DEM',
    startTime: '22:00',
    endTime: '06:00',
    breakStart: '02:00',
    breakEnd: '03:00',
    gracePeriodMinutes: 15,
    isOvernight: true,
    isActive: true,
    description: 'Ca làm việc xuyên đêm',
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
  },
];

describe('ShiftsPage Component & User Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.permissions = new Set(['shift:read', 'shift:create', 'shift:update', 'shift:manage']);
    vi.mocked(shiftsApi.listShifts).mockResolvedValue(mockShifts);
  });

  it('1. renders permission denied state when user lacks shift:read', async () => {
    state.permissions.clear();
    render(
      <MemoryRouter>
        <ShiftsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('2. renders shift list with cards and details when authorized', async () => {
    render(
      <MemoryRouter>
        <ShiftsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Quản lý Ca làm việc')).toBeInTheDocument();
    expect(screen.getByText('Ca Hành Chính')).toBeInTheDocument();
    expect(screen.getByText('Ca Đêm')).toBeInTheDocument();
    expect(screen.getByText('Qua đêm')).toBeInTheDocument();
    expect(screen.getByText('08:30 → 17:30')).toBeInTheDocument();
  });

  it('3. filters shifts by search term', async () => {
    vi.mocked(shiftsApi.listShifts).mockImplementation(async (_orgId, params) => {
      if (params?.search === 'Đêm') {
        return [mockShifts[1]];
      }
      return mockShifts;
    });

    render(
      <MemoryRouter>
        <ShiftsPage />
      </MemoryRouter>,
    );

    await screen.findByText('Ca Hành Chính');
    const searchInput = screen.getByPlaceholderText('Tìm theo tên hoặc mã ca...');
    fireEvent.change(searchInput, { target: { value: 'Đêm' } });

    await waitFor(() => {
      expect(screen.getByText('Ca Đêm')).toBeInTheDocument();
      expect(screen.queryByText('Ca Hành Chính')).not.toBeInTheDocument();
    });
  });

  it('4. opens create shift modal and creates shift successfully', async () => {
    const newShift: shiftsApi.Shift = {
      id: 'shift-3',
      organizationId: 'org-1',
      name: 'Ca Sáng Sớm',
      code: 'SS',
      startTime: '06:00',
      endTime: '14:00',
      breakStart: '10:00',
      breakEnd: '10:30',
      gracePeriodMinutes: 5,
      isOvernight: false,
      isActive: true,
      description: null,
      createdAt: '2026-09-16T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:00.000Z',
    };

    vi.mocked(shiftsApi.createShift).mockResolvedValue(newShift);

    render(
      <MemoryRouter>
        <ShiftsPage />
      </MemoryRouter>,
    );

    await screen.findByText('Quản lý Ca làm việc');
    const createBtn = screen.getByRole('button', { name: /Thêm ca làm việc/i });
    fireEvent.click(createBtn);

    expect(screen.getByText('Tạo Ca làm việc mới')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('VD: Ca hành chính'), { target: { value: 'Ca Sáng Sớm' } });
    fireEvent.change(screen.getByPlaceholderText('VD: HC, SANG, DEM'), { target: { value: 'SS' } });

    const submitBtn = screen.getByRole('button', { name: /Tạo ca làm việc/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(shiftsApi.createShift).toHaveBeenCalledWith('org-1', expect.objectContaining({
        name: 'Ca Sáng Sớm',
        code: 'SS',
      }));
      expect(mockShowToast).toHaveBeenCalledWith('Tạo ca làm việc mới thành công!', 'success');
    });
  });

  it('5. deletes a shift successfully', async () => {
    vi.mocked(shiftsApi.deleteShift).mockResolvedValue({
      success: true,
      message: 'OK',
    });

    render(
      <MemoryRouter>
        <ShiftsPage />
      </MemoryRouter>,
    );

    await screen.findByText('Ca Hành Chính');
    const deleteBtns = screen.getAllByRole('button', { name: /Xóa/i });
    fireEvent.click(deleteBtns[0]);

    expect(screen.getByText('Xác nhận xóa ca làm việc')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /Xóa ca làm việc/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(shiftsApi.deleteShift).toHaveBeenCalledWith('org-1', 'shift-1');
      expect(mockShowToast).toHaveBeenCalledWith('Đã xóa ca làm việc thành công.', 'success');
    });
  });
});

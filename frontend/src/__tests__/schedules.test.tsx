// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SchedulesPage } from '@/features/schedules/SchedulesPage';
import * as schedulesApi from '@/api/schedules';
import * as shiftsApi from '@/api/shifts';
import * as employeesApi from '@/api/employees';
import * as departmentsApi from '@/api/departments';

const state = vi.hoisted(() => ({
  orgId: 'org-1',
  userId: 'user-actor',
  permissions: new Set<string>(),
}));

vi.mock('@/api/schedules');
vi.mock('@/api/shifts');
vi.mock('@/api/employees');
vi.mock('@/api/departments');
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

const mockShift: shiftsApi.Shift = {
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
  description: 'Ca tiêu chuẩn',
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: '2026-09-16T00:00:00.000Z',
};

const mockEmployee = {
  id: 'emp-1',
  organizationId: 'org-1',
  userId: 'user-1',
  employeeCode: 'EMP001',
  displayName: 'Nguyen Van A',
  jobTitle: 'Kỹ sư phần mềm',
  departmentId: 'dept-1',
  department: { id: 'dept-1', name: 'Phòng Kỹ Thuật', code: 'ENG' },
  phone: '0901234567',
  status: 'ACTIVE' as const,
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: '2026-09-16T00:00:00.000Z',
};

const mockDepartment = {
  id: 'dept-1',
  organizationId: 'org-1',
  code: 'ENG',
  name: 'Phòng Kỹ Thuật',
  description: 'Bộ phận phát triển',
  color: '#2563EB',
  isActive: true,
  status: 'ACTIVE' as const,
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: '2026-09-16T00:00:00.000Z',
};

const mockSchedule: schedulesApi.WorkSchedule = {
  id: 'sch-1',
  organizationId: 'org-1',
  employeeId: 'emp-1',
  shiftId: 'shift-1',
  workDate: '2026-09-16T00:00:00.000Z',
  isOff: false,
  notes: 'Lịch chuẩn',
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: '2026-09-16T00:00:00.000Z',
  employee: mockEmployee,
  shift: mockShift,
};

describe('SchedulesPage Component & User Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.permissions = new Set([
      'schedule:read',
      'schedule:create',
      'schedule:update',
      'schedule:manage',
      'shift:read',
    ]);

    vi.mocked(schedulesApi.listSchedules).mockResolvedValue([mockSchedule]);
    vi.mocked(shiftsApi.listShifts).mockResolvedValue([mockShift]);
    vi.mocked(employeesApi.listEmployees).mockResolvedValue({ items: [mockEmployee], nextCursor: null });
    vi.mocked(departmentsApi.listDepartments).mockResolvedValue({ items: [mockDepartment], nextCursor: null });
  });

  it('1. renders permission denied state when user lacks schedule:read', async () => {
    state.permissions.clear();
    render(
      <MemoryRouter>
        <SchedulesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('2. renders schedule calendar view with employee and shift details', async () => {
    render(
      <MemoryRouter>
        <SchedulesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Lịch Phân Ca Làm Việc')).toBeInTheDocument();
    expect(screen.getByText('Nguyen Van A')).toBeInTheDocument();
    expect(screen.getByText('EMP001')).toBeInTheDocument();
    expect(screen.getByText('Lịch tuần')).toBeInTheDocument();
    expect(screen.getByText('Danh sách')).toBeInTheDocument();
  });

  it('3. switches between weekly grid view and table view', async () => {
    render(
      <MemoryRouter>
        <SchedulesPage />
      </MemoryRouter>,
    );

    await screen.findByText('Lịch Phân Ca Làm Việc');
    const tableToggle = screen.getByText('Danh sách');
    fireEvent.click(tableToggle);

    expect(screen.getByText('Ngày làm việc')).toBeInTheDocument();
    expect(screen.getByText('Ca làm việc')).toBeInTheDocument();
    expect(screen.getByText('Ca Hành Chính')).toBeInTheDocument();
  });

  it('4. opens Assign Schedule modal and assigns shift successfully', async () => {
    vi.mocked(schedulesApi.assignSchedule).mockResolvedValue([mockSchedule]);

    render(
      <MemoryRouter>
        <SchedulesPage />
      </MemoryRouter>,
    );

    await screen.findByText('Lịch Phân Ca Làm Việc');
    const assignBtn = screen.getByRole('button', { name: /Phân ca làm việc/i });
    fireEvent.click(assignBtn);

    expect(screen.getByText('Phân Ca Làm Việc Cho Nhân Viên')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Xác nhận phân ca/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(schedulesApi.assignSchedule).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Phân ca làm việc thành công!', 'success');
    });
  });
});

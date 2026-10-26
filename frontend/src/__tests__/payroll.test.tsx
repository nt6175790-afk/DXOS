// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PayrollPage } from '@/features/payroll/PayrollPage';
import { payrollApi } from '@/api/payroll';
import type { PayrollPeriod, PayrollRecord } from '@/api/types';

const state = vi.hoisted(() => ({
  orgId: 'org-test-1',
  userId: 'user-manager-1',
  permissions: new Set<string>(),
}));

vi.mock('@/api/payroll', () => ({
  payrollApi: {
    listPeriods: vi.fn(),
    getPeriod: vi.fn(),
    createPeriod: vi.fn(),
    calculatePeriod: vi.fn(),
    submitApproval: vi.fn(),
    finalizePeriod: vi.fn(),
    listRecords: vi.fn(),
    getRecord: vi.fn(),
    getMyPayroll: vi.fn(),
  },
  compensationApi: {
    getEmployeeCompensation: vi.fn(),
    updateCompensation: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: state.userId, email: 'manager@dxos.test', displayName: 'Manager User' },
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

const mockPeriods: PayrollPeriod[] = [
  {
    id: 'period-1',
    organizationId: 'org-test-1',
    name: 'Kỳ lương Tháng 09/2026',
    periodStart: '2026-09-01T00:00:00.000Z',
    periodEnd: '2026-09-30T00:00:00.000Z',
    status: 'DRAFT',
    totalGross: '0',
    totalNet: '0',
    employeeCount: 0,
    calculatedAt: null,
    approvedAt: null,
    approvedById: null,
    finalizedAt: null,
    finalizedById: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'period-2',
    organizationId: 'org-test-1',
    name: 'Kỳ lương Tháng 08/2026',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-31T00:00:00.000Z',
    status: 'FINALIZED',
    totalGross: '50000000',
    totalNet: '44750000',
    employeeCount: 2,
    calculatedAt: '2026-09-01T10:00:00.000Z',
    approvedAt: '2026-09-02T09:00:00.000Z',
    approvedById: 'user-manager-1',
    finalizedAt: '2026-09-02T10:00:00.000Z',
    finalizedById: 'user-manager-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  },
];

const mockRecords: PayrollRecord[] = [
  {
    id: 'rec-1',
    organizationId: 'org-test-1',
    payrollPeriodId: 'period-2',
    employeeId: 'emp-1',
    compensationProfileId: 'comp-1',
    baseSalary: '25000000',
    workingDays: 22,
    workedDays: 21,
    absentDays: 0,
    paidLeaveDays: 1,
    unpaidLeaveDays: 0,
    overtimeMinutes: 0,
    overtimeAmount: '0',
    allowanceAmount: '2000000',
    deductionAmount: '2625000',
    grossAmount: '25000000',
    netAmount: '24375000',
    currency: 'VND',
    calculatedAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    employee: {
      id: 'emp-1',
      employeeCode: 'DX-001',
      displayName: 'Nguyễn Văn A',
      jobTitle: 'Senior Software Engineer',
      departmentId: 'dept-1',
      department: { id: 'dept-1', name: 'Engineering', code: 'ENG' },
    },
    items: [
      {
        id: 'item-1',
        payrollRecordId: 'rec-1',
        type: 'ALLOWANCE',
        name: 'Phụ cấp ăn trưa',
        amount: '1000000',
        quantity: 1,
        unit: 'tháng',
        notes: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'item-2',
        payrollRecordId: 'rec-1',
        type: 'DEDUCTION',
        name: 'BHXH bắt buộc',
        amount: '2625000',
        quantity: 1,
        unit: 'tháng',
        notes: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  },
];

describe('PayrollPage & Compensation UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.permissions.clear();
    state.permissions.add('payroll:read');
    state.permissions.add('payroll:manage');
    state.permissions.add('payroll:create');

    vi.mocked(payrollApi.listPeriods).mockResolvedValue(mockPeriods);
    vi.mocked(payrollApi.listRecords).mockResolvedValue(mockRecords);
    vi.mocked(payrollApi.getMyPayroll).mockResolvedValue(mockRecords);
  });

  it('renders payroll dashboard with summary metrics and period list', async () => {
    render(
      <MemoryRouter>
        <PayrollPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Quản lý Tiền lương & Đãi ngộ')).toBeInTheDocument();
      expect(screen.getAllByText('Kỳ lương Tháng 09/2026').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Kỳ lương Tháng 08/2026')).toBeInTheDocument();
    });

    expect(screen.getByText('Kỳ lương gần nhất')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên tính lương')).toBeInTheDocument();
    expect(screen.getByText('Tổng thu nhập Gross')).toBeInTheDocument();
    expect(screen.getByText('Tổng thực nhận Net')).toBeInTheDocument();
  });

  it('allows switching to records tab and shows employee records', async () => {
    render(
      <MemoryRouter>
        <PayrollPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Kỳ lương Tháng 08/2026')).toBeInTheDocument();
    });

    const recordsTab = screen.getByRole('button', { name: /Bảng lương chi tiết/i });
    fireEvent.click(recordsTab);

    await waitFor(() => {
      expect(payrollApi.listRecords).toHaveBeenCalled();
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
      expect(screen.getByText('DX-001')).toBeInTheDocument();
    });
  });

  it('allows switching to my-payroll tab and displays personal payslips', async () => {
    render(
      <MemoryRouter>
        <PayrollPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Quản lý Tiền lương & Đãi ngộ')).toBeInTheDocument();
    });

    const myPayrollTab = screen.getByRole('button', { name: /Lương của tôi/i });
    fireEvent.click(myPayrollTab);

    await waitFor(() => {
      expect(payrollApi.getMyPayroll).toHaveBeenCalled();
      expect(screen.getByText('24.375.000 đ')).toBeInTheDocument();
    });
  });

  it('hides create button when user lacks payroll:create permission', async () => {
    state.permissions.clear();
    state.permissions.add('payroll:read');

    render(
      <MemoryRouter>
        <PayrollPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Quản lý Tiền lương & Đãi ngộ')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Tạo kỳ lương mới/i })).not.toBeInTheDocument();
  });

  it('shows and opens create period modal when user has payroll:create permission', async () => {
    render(
      <MemoryRouter>
        <PayrollPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tạo kỳ lương mới/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Tạo kỳ lương mới/i }));

    expect(screen.getAllByText('Tạo kỳ lương mới').length).toBeGreaterThanOrEqual(2);
  });

  it('opens record detail modal when clicking Xem phiếu lương', async () => {
    render(
      <MemoryRouter>
        <PayrollPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Bảng lương chi tiết/i }));

    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    });

    const viewButton = screen.getByRole('button', { name: /Xem phiếu lương/i });
    fireEvent.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText('Phiếu lương chi tiết')).toBeInTheDocument();
      expect(screen.getByText('Phụ cấp ăn trưa')).toBeInTheDocument();
      expect(screen.getByText('BHXH bắt buộc')).toBeInTheDocument();
    });
  });
});

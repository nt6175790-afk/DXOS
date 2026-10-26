// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PeoplePage } from '@/features/people/PeoplePage';
import { ToastProvider } from '@/contexts/ToastContext';

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(() => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' },
    organizations: [],
    isLoading: false,
    setCurrentOrg: vi.fn(),
    refreshOrganizations: vi.fn(),
  })),
}));

const mockListEmployees = vi.fn();
const mockCreateEmployee = vi.fn();
const mockUpdateEmployee = vi.fn();
const mockListDepartments = vi.fn();

vi.mock('@/api/employees', () => ({
  listEmployees: (...args: unknown[]) => mockListEmployees(...args),
  createEmployee: (...args: unknown[]) => mockCreateEmployee(...args),
  updateEmployee: (...args: unknown[]) => mockUpdateEmployee(...args),
}));

const mockListTasks = vi.fn();

vi.mock('@/api/tasks', () => ({
  listTasks: (...args: unknown[]) => mockListTasks(...args),
}));

vi.mock('@/api/departments', () => ({
  listDepartments: (...args: unknown[]) => mockListDepartments(...args),
}));

vi.mock('@/api/client', () => ({
  isApiError: vi.fn((err: unknown) => typeof err === 'object' && err !== null && 'success' in err),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <PeoplePage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('PeoplePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDepartments.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('shows loading state initially', () => {
    mockListEmployees.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state when no employees', async () => {
    mockListEmployees.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/không tìm thấy nhân sự/i)).toBeInTheDocument();
    });
  });

  it('renders employee table rows', async () => {
    mockListEmployees.mockResolvedValue({
      items: [
        {
          id: 'e1', organizationId: 'org-1', userId: 'u1', departmentId: null,
          employeeCode: 'EMP-001', displayName: 'Nguyen Van A', jobTitle: 'Software Engineer',
          phone: '+84901234567', status: 'ACTIVE', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      nextCursor: null,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nguyen Van A')).toBeInTheDocument();
      expect(screen.getByText('EMP-001')).toBeInTheDocument();
      expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    });
  });

  it('opens create modal on clicking New Employee', async () => {
    mockListEmployees.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getAllByText(/thêm nhân sự/i).length).toBeGreaterThan(0);
    });
    const buttons = screen.getAllByRole('button', { name: /thêm nhân sự/i });
    await user.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByText('Thêm nhân sự mới', { selector: 'h2' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/ví dụ: a1b2c3d4/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/tên hiển thị/i)).toBeInTheDocument();
    });
  });

  it('validates E.164 phone format when saving employee', async () => {
    mockListEmployees.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: /thêm nhân sự/i });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText('Thêm nhân sự mới', { selector: 'h2' })).toBeInTheDocument();
    });

    const phoneInput = screen.getByPlaceholderText('+84901234567');
    await user.type(phoneInput, '0901234567'); // Invalid format: missing + and country code

    const modal = screen.getByRole('dialog');
    const submitBtn = within(modal).getByRole('button', { name: 'Thêm nhân sự' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/số điện thoại phải đúng định dạng quốc tế/i)).toBeInTheDocument();
    });
    expect(mockCreateEmployee).not.toHaveBeenCalled();
  });

  it('filters employees by search query and toggles to card view', async () => {
    mockListEmployees.mockResolvedValue({
      items: [
        {
          id: 'e1', organizationId: 'org-1', userId: 'u1', departmentId: null,
          employeeCode: 'EMP-001', displayName: 'Nguyen Van A', jobTitle: 'Software Engineer',
          phone: '+84901234567', status: 'ACTIVE', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'e2', organizationId: 'org-1', userId: 'u2', departmentId: null,
          employeeCode: 'EMP-002', displayName: 'Tran Thi B', jobTitle: 'Product Manager',
          phone: '+84901234568', status: 'ACTIVE', createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z',
        },
      ],
      nextCursor: null,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nguyen Van A')).toBeInTheDocument();
      expect(screen.getByText('Tran Thi B')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const searchInput = screen.getByPlaceholderText(/tìm kiếm theo tên/i);
    await user.type(searchInput, 'Tran');

    expect(screen.queryByText('Nguyen Van A')).not.toBeInTheDocument();
    expect(screen.getByText('Tran Thi B')).toBeInTheDocument();

    // Toggle card view
    const cardToggleBtn = screen.getByRole('button', { name: /xem dạng thẻ/i });
    await user.click(cardToggleBtn);

    expect(screen.getByText('Tran Thi B')).toBeInTheDocument();
    expect(screen.getByText('Product Manager')).toBeInTheDocument();
  });

  it('opens employee detail profile modal with work summary and skills', async () => {
    mockListEmployees.mockResolvedValue({
      items: [
        {
          id: 'e1', organizationId: 'org-1', userId: 'u1', departmentId: null,
          employeeCode: 'EMP-001', displayName: 'Nguyen Van A', jobTitle: 'Software Engineer',
          phone: '+84901234567', status: 'ACTIVE', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      nextCursor: null,
    });
    mockListTasks.mockResolvedValue({
      items: [
        {
          id: 't1', organizationId: 'org-1', creatorEmployeeId: 'e1', assigneeEmployeeId: 'e1',
          departmentId: null, title: 'Fix bug A', description: null, status: 'IN_PROGRESS',
          priority: 'HIGH', progressPercent: 50, dueAt: null, createdAt: '', updatedAt: '',
        },
      ],
      nextCursor: null,
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nguyen Van A')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const detailBtn = screen.getByRole('button', { name: /xem hồ sơ nguyen van a/i });
    await user.click(detailBtn);

    await waitFor(() => {
      expect(screen.getByText('Hồ sơ nhân viên')).toBeInTheDocument();
      expect(screen.getByText('Tổng quan Công việc')).toBeInTheDocument();
      expect(screen.getByText('Kỹ năng chuyên môn')).toBeInTheDocument();
      expect(screen.getByText('Fix bug A')).toBeInTheDocument();
    });
  });
});



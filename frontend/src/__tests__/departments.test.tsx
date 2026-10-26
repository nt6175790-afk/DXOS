// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DepartmentsPage } from '@/features/departments/DepartmentsPage';
import { ToastProvider } from '@/contexts/ToastContext';

// Mock contexts
vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(() => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' },
    organizations: [],
    isLoading: false,
    setCurrentOrg: vi.fn(),
    refreshOrganizations: vi.fn(),
  })),
}));

// Mock API
const mockListDepartments = vi.fn();
const mockCreateDepartment = vi.fn();
const mockUpdateDepartment = vi.fn();

vi.mock('@/api/departments', () => ({
  listDepartments: (...args: unknown[]) => mockListDepartments(...args),
  createDepartment: (...args: unknown[]) => mockCreateDepartment(...args),
  updateDepartment: (...args: unknown[]) => mockUpdateDepartment(...args),
}));

vi.mock('@/api/client', () => ({
  isApiError: vi.fn((err: unknown) => {
    return typeof err === 'object' && err !== null && 'success' in err;
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DepartmentsPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('DepartmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockListDepartments.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state when no departments', async () => {
    mockListDepartments.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/không tìm thấy phòng ban/i)).toBeInTheDocument();
    });
  });

  it('renders department list', async () => {
    mockListDepartments.mockResolvedValue({
      items: [
        { id: 'd1', organizationId: 'org-1', code: 'ENG', name: 'Engineering', description: 'Eng team', status: 'ACTIVE', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'd2', organizationId: 'org-1', code: 'HR', name: 'Human Resources', description: null, status: 'INACTIVE', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      ],
      nextCursor: null,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
      expect(screen.getByText('Human Resources')).toBeInTheDocument();
      expect(screen.getByText('ENG')).toBeInTheDocument();
      expect(screen.getByText('HR')).toBeInTheDocument();
    });
  });

  it('shows New Department button', async () => {
    mockListDepartments.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/thêm phòng ban/i).length).toBeGreaterThan(0);
    });
  });

  it('opens create modal when clicking new department', async () => {
    mockListDepartments.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getAllByText(/thêm phòng ban/i).length).toBeGreaterThan(0);
    });

    const buttons = screen.getAllByRole('button', { name: /thêm phòng ban/i });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText('Thêm phòng ban mới', { selector: 'h2' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('ENG')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Kỹ thuật công nghệ')).toBeInTheDocument();
    });
  });

  it('has status filter buttons', async () => {
    mockListDepartments.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Tất cả')).toBeInTheDocument();
      expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
      expect(screen.getByText('Ngừng hoạt động')).toBeInTheDocument();
    });
  });

  it('shows error state on API error', async () => {
    mockListDepartments.mockRejectedValue({
      success: false,
      error: { code: 'INTERNAL', message: 'Server error', requestId: 'req-1' },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/đã có lỗi xảy ra/i)).toBeInTheDocument();
    });
  });

  it('shows forbidden state on 403', async () => {
    mockListDepartments.mockRejectedValue({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'req-1' },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/truy cập bị từ chối/i)).toBeInTheDocument();
    });
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OrganizationProvider, useOrganization } from '@/contexts/OrganizationContext';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DepartmentsPage } from '@/features/departments/DepartmentsPage';
import { ToastProvider } from '@/contexts/ToastContext';
import * as orgApi from '@/api/organizations';
import * as deptsApi from '@/api/departments';
import * as employeesApi from '@/api/employees';
import * as tasksApi from '@/api/tasks';
import * as notifsApi from '@/api/notifications';
import * as dashboardApi from '@/api/dashboard';
import type { Organization, CurrentUser } from '@/api/types';

// Mock useAuth
const mockUseAuth = vi.fn<() => {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}>(() => ({
  user: { id: 'usr-1', email: 'admin@example.com', displayName: 'Admin', accountStatus: 'ACTIVE' as const },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock APIs
vi.mock('@/api/dashboard', () => ({ getDashboard: vi.fn() }));
vi.mock('@/api/organizations', () => ({
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
}));

vi.mock('@/api/departments', () => ({
  listDepartments: vi.fn(),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
}));

vi.mock('@/api/employees', () => ({
  listEmployees: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
}));

vi.mock('@/api/tasks', () => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock('@/api/notifications', () => ({
  listNotifications: vi.fn(),
  markNotificationAsRead: vi.fn(),
}));

const sampleOrg: Organization = {
  id: 'org-1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <OrganizationProvider>
          {ui}
        </OrganizationProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('DXOS-RUNTIME-001 — Organization Bootstrap & Error Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({
      user: { id: 'usr-1', email: 'admin@example.com', displayName: 'Admin', accountStatus: 'ACTIVE' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(deptsApi.listDepartments).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(employeesApi.listEmployees).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(notifsApi.listNotifications).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(dashboardApi.getDashboard).mockImplementation(async (organizationId) => ({ organizationId, generatedAt: '2026-09-15T00:00:00Z',
      tasks: null, departments: null, employees: null, workload: null, activity: null, notifications: { total: 0, unread: 0 } }));
  });

  afterEach(() => {
    localStorage.clear();
  });

  // Test 1: Org API success -> currentOrg is set, dashboard renders successfully
  it('1. Org API success: renders dashboard with organization name', async () => {
    vi.mocked(orgApi.listOrganizations).mockResolvedValue({
      items: [sampleOrg],
      nextCursor: null,
    });

    renderWithProviders(<DashboardPage />);

    // Initially shows loading
    expect(screen.getAllByText('Đang tải thông tin tổ chức...').length).toBeGreaterThan(0);

    // Eventually shows organization and dashboard content
    await waitFor(() => {
      expect(screen.getByText('Tổng quan')).toBeInTheDocument();
      expect(screen.getByText(/Acme Corp — Dữ liệu toàn tổ chức/)).toBeInTheDocument();
    });
  });

  // Test 2: Org API network error -> error alert shown, retry button visible (NO infinite loading)
  it('2. Org API network error: surfaces error state with retry button instead of hanging', async () => {
    vi.mocked(orgApi.listOrganizations).mockRejectedValue(new Error('Network Error'));

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.queryByText('Đang tải thông tin tổ chức...')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Không thể tải thông tin tổ chức')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    });
  });

  // Test 3: Org API 500 server error -> error state with message
  it('3. Org API 500 error: displays server error message with retry button', async () => {
    vi.mocked(orgApi.listOrganizations).mockRejectedValue({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Máy chủ nội bộ gặp lỗi khi xử lý.',
        requestId: 'req-500',
      },
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Máy chủ nội bộ gặp lỗi khi xử lý.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    });
  });

  // Test 4: Org API 403 Forbidden error -> error state shown
  it('4. Org API 403 Forbidden: renders error state with message', async () => {
    vi.mocked(orgApi.listOrganizations).mockRejectedValue({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền xem danh sách tổ chức.',
        requestId: 'req-403',
      },
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Bạn không có quyền xem danh sách tổ chức.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    });
  });

  // Test 5: Org API returns empty list -> empty org state shown (NOT infinite loading)
  it('5. Org API empty list: shows empty organization state instead of infinite hang', async () => {
    vi.mocked(orgApi.listOrganizations).mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.queryByText('Đang tải thông tin tổ chức...')).not.toBeInTheDocument();
      expect(screen.getByText('Chưa có tổ chức nào')).toBeInTheDocument();
      expect(screen.getByText(/bạn chưa thuộc tổ chức nào/i)).toBeInTheDocument();
    });
  });

  // Test 6: Retry button triggers re-fetch
  it('6. Retry button: clicking retry initiates a new organization fetch', async () => {
    const user = userEvent.setup();
    vi.mocked(orgApi.listOrganizations).mockRejectedValueOnce(new Error('First failure'));

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    });

    expect(orgApi.listOrganizations).toHaveBeenCalledTimes(1);

    // Click retry
    await user.click(screen.getByRole('button', { name: /thử lại/i }));

    expect(orgApi.listOrganizations).toHaveBeenCalledTimes(2);
  });

  // Test 7: Successful retry recovers from error state to full dashboard view
  it('7. Successful retry: transitions from error to healthy dashboard view', async () => {
    const user = userEvent.setup();
    vi.mocked(orgApi.listOrganizations)
      .mockRejectedValueOnce(new Error('Network glitch'))
      .mockResolvedValueOnce({ items: [sampleOrg], nextCursor: null });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /thử lại/i }));

    await waitFor(() => {
      expect(screen.getByText('Tổng quan')).toBeInTheDocument();
      expect(screen.getByText(/Acme Corp — Dữ liệu toàn tổ chức/)).toBeInTheDocument();
    });
  });

  // Test 8: Unauthenticated state clears organizations and halts loading
  it('8. Unauthenticated state: clears organizations and leaves currentOrg null without hang', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    function TestOrgConsumer() {
      const { currentOrg, organizations, isLoading, error } = useOrganization();
      return (
        <div>
          <span data-testid="is-loading">{String(isLoading)}</span>
          <span data-testid="has-org">{String(!!currentOrg)}</span>
          <span data-testid="org-count">{organizations.length}</span>
          <span data-testid="has-error">{String(!!error)}</span>
        </div>
      );
    }

    render(
      <MemoryRouter>
        <ToastProvider>
          <OrganizationProvider>
            <TestOrgConsumer />
          </OrganizationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading').textContent).toBe('false');
      expect(screen.getByTestId('has-org').textContent).toBe('false');
      expect(screen.getByTestId('org-count').textContent).toBe('0');
      expect(screen.getByTestId('has-error').textContent).toBe('false');
    });

    expect(orgApi.listOrganizations).not.toHaveBeenCalled();
  });

  // Test 9: Saved organization preference is respected from localStorage
  it('9. LocalStorage preference: restores previously selected organization if present in list', async () => {
    const org2: Organization = {
      id: 'org-2',
      name: 'Beta LLC',
      slug: 'beta-llc',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    localStorage.setItem('dx_current_org_id', 'org-2');

    vi.mocked(orgApi.listOrganizations).mockResolvedValue({
      items: [sampleOrg, org2],
      nextCursor: null,
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Beta LLC — Dữ liệu toàn tổ chức/)).toBeInTheDocument();
    });
  });

  // Test 10: Other pages using useOrgBootstrapGuard also benefit from the fix (e.g. DepartmentsPage)
  it('10. Other feature pages: DepartmentsPage also displays error state instead of infinite hang', async () => {
    vi.mocked(orgApi.listOrganizations).mockRejectedValue(new Error('Connection refused'));

    renderWithProviders(<DepartmentsPage />);

    await waitFor(() => {
      expect(screen.queryByText('Đang tải thông tin tổ chức...')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Không thể tải thông tin tổ chức')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    });
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TasksPage } from '@/features/tasks/TasksPage';
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

const mockListTasks = vi.fn();
const mockCreateTask = vi.fn();
const mockListEmployees = vi.fn();
const mockListDepartments = vi.fn();

vi.mock('@/api/tasks', () => ({
  listTasks: (...args: unknown[]) => mockListTasks(...args),
  createTask: (...args: unknown[]) => mockCreateTask(...args),
}));

vi.mock('@/api/employees', () => ({
  listEmployees: (...args: unknown[]) => mockListEmployees(...args),
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
        <TasksPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('TasksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListEmployees.mockResolvedValue({ items: [], nextCursor: null });
    mockListDepartments.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('shows loading state', () => {
    mockListTasks.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', async () => {
    mockListTasks.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/không tìm thấy công việc/i)).toBeInTheDocument();
    });
  });

  it('renders task list', async () => {
    mockListTasks.mockResolvedValue({
      items: [
        {
          id: 't1', organizationId: 'org-1', title: 'Fix bug #42', status: 'TODO', priority: 'HIGH',
          creatorEmployeeId: 'e1', assigneeEmployeeId: null, departmentId: null,
          description: null, dueAt: null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 't2', organizationId: 'org-1', title: 'Deploy v2.0', status: 'IN_PROGRESS', priority: 'URGENT',
          creatorEmployeeId: 'e1', assigneeEmployeeId: 'e2', departmentId: 'd1',
          description: 'Deploy to prod', dueAt: '2024-12-31T23:59:59Z', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      nextCursor: null,
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Fix bug #42')).toBeInTheDocument();
      expect(screen.getByText('Deploy v2.0')).toBeInTheDocument();
    });
  });

  it('shows filter dropdowns', async () => {
    mockListTasks.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/lọc theo trạng thái/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/lọc theo độ ưu tiên/i)).toBeInTheDocument();
    });
  });

  it('shows status badges', async () => {
    mockListTasks.mockResolvedValue({
      items: [
        {
          id: 't1', organizationId: 'org-1', title: 'Done task', status: 'DONE', priority: 'LOW',
          creatorEmployeeId: 'e1', assigneeEmployeeId: null, departmentId: null,
          description: null, dueAt: null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      nextCursor: null,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Hoàn thành')).toBeInTheDocument();
    });
  });

  it('has New Task button', async () => {
    mockListTasks.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/thêm công việc/i).length).toBeGreaterThan(0);
    });
  });

  it('opens create modal on button click', async () => {
    mockListTasks.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /thêm công việc/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /thêm công việc/i }));

    expect(await screen.findByText('Thêm công việc mới', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nhập tiêu đề công việc')).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Thấp' }).length).toBeGreaterThan(0);
  });

  it('shows forbidden state on 403', async () => {
    mockListTasks.mockRejectedValue({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'req-1' },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/truy cập bị từ chối/i)).toBeInTheDocument();
    });
  });
});

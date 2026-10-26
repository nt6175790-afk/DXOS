// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DepartmentsPage } from '@/features/departments/DepartmentsPage';
import { PeoplePage } from '@/features/people/PeoplePage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { AiAssistantPage } from '@/features/ai/AiAssistantPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ToastProvider } from '@/contexts/ToastContext';
import * as permissionHook from '@/hooks/usePermission';
import * as deptApi from '@/api/departments';
import * as empApi from '@/api/employees';
import * as taskApi from '@/api/tasks';

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(() => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test-org', status: 'ACTIVE', createdAt: '2024-01-01T00:00:00Z', updatedAt: '' },
    organizations: [],
    isLoading: false,
    setCurrentOrg: vi.fn(),
    refreshOrganizations: vi.fn(),
  })),
}));

describe('DXOS-FRONTEND-003: Feature-level Permission UX Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Departments Feature Permissions', () => {
    it('shows ForbiddenState when user lacks department:read', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['organization:read'],
        hasPermission: (p) => p === 'organization:read',
        hasAnyPermission: (...p) => p.includes('organization:read'),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <DepartmentsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/bạn không có quyền truy cập hoặc xem danh sách phòng ban/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /thêm phòng ban/i })).not.toBeInTheDocument();
    });

    it('hides "Thêm phòng ban" button when user lacks department:create', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['organization:read', 'department:read'],
        hasPermission: (p) => p === 'organization:read' || p === 'department:read',
        hasAnyPermission: (...p) => p.some((x) => x === 'organization:read' || x === 'department:read'),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      vi.spyOn(deptApi, 'listDepartments').mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <DepartmentsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Không tìm thấy phòng ban nào')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /thêm phòng ban/i })).not.toBeInTheDocument();
    });
  });

  describe('People Feature Permissions', () => {
    it('shows ForbiddenState when user lacks employee:read', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['organization:read'],
        hasPermission: (p) => p === 'organization:read',
        hasAnyPermission: (...p) => p.includes('organization:read'),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <PeoplePage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/bạn không có quyền truy cập hoặc xem danh sách nhân sự/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /thêm nhân sự/i })).not.toBeInTheDocument();
    });

    it('hides "Thêm nhân sự" button when user lacks employee:create', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['organization:read', 'employee:read'],
        hasPermission: (p) => p === 'organization:read' || p === 'employee:read',
        hasAnyPermission: (...p) => p.some((x) => x === 'organization:read' || x === 'employee:read'),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      vi.spyOn(empApi, 'listEmployees').mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <PeoplePage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Không tìm thấy nhân sự nào')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /thêm nhân sự/i })).not.toBeInTheDocument();
    });
  });

  describe('Tasks Feature Permissions', () => {
    it('shows ForbiddenState when user lacks task:read', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['organization:read'],
        hasPermission: (p) => p === 'organization:read',
        hasAnyPermission: (...p) => p.includes('organization:read'),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <TasksPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/bạn không có quyền truy cập hoặc xem danh sách công việc/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /thêm công việc/i })).not.toBeInTheDocument();
    });

    it('hides "Thêm công việc" button when user lacks task:create', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['organization:read', 'task:read'],
        hasPermission: (p) => p === 'organization:read' || p === 'task:read',
        hasAnyPermission: (...p) => p.some((x) => x === 'organization:read' || x === 'task:read'),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      vi.spyOn(taskApi, 'listTasks').mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <TasksPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Không tìm thấy công việc nào')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /thêm công việc/i })).not.toBeInTheDocument();
    });

    it('hides Assignee field in Create Modal when user has task:create but lacks task:assign', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['organization:read', 'task:read', 'task:create'],
        hasPermission: (p) => ['organization:read', 'task:read', 'task:create'].includes(p),
        hasAnyPermission: (...p) => p.some((x) => ['organization:read', 'task:read', 'task:create'].includes(x)),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      vi.spyOn(taskApi, 'listTasks').mockResolvedValue({
        items: [],
        nextCursor: null,
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <TasksPage />
          </ToastProvider>
        </MemoryRouter>
      );

      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /thêm công việc/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /thêm công việc/i }));

      await waitFor(() => {
        expect(screen.getByText('Thêm công việc mới', { selector: 'h2' })).toBeInTheDocument();
      });

      // Assignee field MUST NOT be in the modal
      expect(screen.queryByLabelText(/người phụ trách/i)).not.toBeInTheDocument();
    });
  });

  describe('AI Feature Permissions', () => {
    it('shows ForbiddenState when user lacks ai:use', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['organization:read'],
        hasPermission: (p) => p === 'organization:read',
        hasAnyPermission: (...p) => p.includes('organization:read'),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <AiAssistantPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/bạn không có quyền sử dụng trợ lý ai trong tổ chức này/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('textbox', { name: /khung nhập tin nhắn/i })).not.toBeInTheDocument();
    });
  });

  describe('Settings Feature Permissions', () => {
    it('shows ForbiddenState when user lacks organization:read', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['department:read'],
        hasPermission: (p) => p === 'department:read',
        hasAnyPermission: (...p) => p.includes('department:read'),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Bạn không có quyền xem cài đặt tổ chức/i)).toBeInTheDocument();
      });
    });

    it('disables name input and hides save button when user lacks organization:update', async () => {
      vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
        permissions: ['organization:read'],
        hasPermission: (p) => p === 'organization:read',
        hasAnyPermission: (...p) => p.includes('organization:read'),
        isLoading: false,
        error: null,
        refreshPermissions: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/tên tổ chức/i)).toBeInTheDocument();
      });

      // Name input must be disabled
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeDisabled();
      // Save button must not be rendered
      expect(screen.queryByRole('button', { name: /lưu thay đổi/i })).not.toBeInTheDocument();
    });
  });
});

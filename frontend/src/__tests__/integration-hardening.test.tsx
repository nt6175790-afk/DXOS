// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { normalizeError } from '@/api/client';
import { TaskDetailPage } from '@/features/tasks/TaskDetailPage';
import { FilesPage } from '@/features/files/FilesPage';
import { ToastProvider } from '@/contexts/ToastContext';
import type { AxiosError } from 'axios';
import type { ApiError } from '@/api/types';

// Mock contexts
vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(() => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test-org', status: 'ACTIVE', createdAt: '', updatedAt: '' },
    organizations: [],
    isLoading: false,
    setCurrentOrg: vi.fn(),
    refreshOrganizations: vi.fn(),
  })),
}));

// Mock APIs
const mockGetTask = vi.fn();
const mockUpdateTask = vi.fn();
const mockListEmployees = vi.fn();
const mockListDepartments = vi.fn();

vi.mock('@/api/tasks', () => ({
  getTask: (...args: unknown[]) => mockGetTask(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
}));

vi.mock('@/api/employees', () => ({
  listEmployees: (...args: unknown[]) => mockListEmployees(...args),
}));

vi.mock('@/api/departments', () => ({
  listDepartments: (...args: unknown[]) => mockListDepartments(...args),
}));

const mockListFiles = vi.fn();
const mockUploadFile = vi.fn();
const mockDownloadFile = vi.fn();
const mockDeleteFile = vi.fn();

vi.mock('@/api/files', () => ({
  listFiles: (...args: unknown[]) => mockListFiles(...args),
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
}));

describe('DXOS-FRONTEND-002 Hardening Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListEmployees.mockResolvedValue({ items: [], nextCursor: null });
    mockListDepartments.mockResolvedValue({ items: [], nextCursor: null });
    mockListFiles.mockResolvedValue({ items: [], nextCursor: null });
  });

  describe('API Client Error Normalization', () => {
    it('normalizes Blob error responses into ApiError', async () => {
      const errorJson = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Quyền truy cập bị từ chối',
          requestId: 'req-blob-123',
        },
      };
      const blob = new Blob([JSON.stringify(errorJson)], { type: 'application/json' });
      const axiosError = {
        response: {
          data: blob,
          status: 403,
        },
      } as unknown as AxiosError<ApiError>;

      const normalized = await normalizeError(axiosError);
      expect(normalized.success).toBe(false);
      expect(normalized.error.code).toBe('FORBIDDEN');
      expect(normalized.error.message).toBe('Quyền truy cập bị từ chối');
      expect(normalized.error.requestId).toBe('req-blob-123');
    });

    it('provides Vietnamese fallback message on network error', async () => {
      const axiosError = {
        message: '',
      } as unknown as AxiosError<ApiError>;

      const normalized = await normalizeError(axiosError);
      expect(normalized.success).toBe(false);
      expect(normalized.error.code).toBe('NETWORK_ERROR');
      expect(normalized.error.message).toBe('Đã xảy ra lỗi không mong muốn.');
    });
  });

  describe('TaskDetailPage Terminal Task Hardening', () => {
    it('disables edit and shows banner when task is DONE (terminal)', async () => {
      mockGetTask.mockResolvedValue({
        id: 'task-done',
        organizationId: 'org-1',
        creatorEmployeeId: 'emp-1',
        assigneeEmployeeId: null,
        departmentId: null,
        title: 'Completed Task',
        description: 'Task is finished',
        status: 'DONE',
        priority: 'HIGH',
        dueAt: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      render(
        <MemoryRouter initialEntries={['/tasks/task-done']}>
          <ToastProvider>
            <Routes>
              <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Completed Task')).toBeInTheDocument();
      });

      // Terminal banner should be visible
      expect(screen.getByText(/công việc đã kết thúc \(hoàn thành\) — không thể chỉnh sửa/i)).toBeInTheDocument();

      // Edit button should be disabled
      const editBtn = screen.getByRole('button', { name: /chỉnh sửa/i });
      expect(editBtn).toBeDisabled();
    });

    it('disables edit and shows banner when task is CANCELLED (terminal)', async () => {
      mockGetTask.mockResolvedValue({
        id: 'task-cancelled',
        organizationId: 'org-1',
        creatorEmployeeId: 'emp-1',
        assigneeEmployeeId: null,
        departmentId: null,
        title: 'Cancelled Task',
        description: null,
        status: 'CANCELLED',
        priority: 'LOW',
        dueAt: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      render(
        <MemoryRouter initialEntries={['/tasks/task-cancelled']}>
          <ToastProvider>
            <Routes>
              <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Cancelled Task')).toBeInTheDocument();
      });

      expect(screen.getByText(/công việc đã kết thúc \(đã hủy\) — không thể chỉnh sửa/i)).toBeInTheDocument();

      const editBtn = screen.getByRole('button', { name: /chỉnh sửa/i });
      expect(editBtn).toBeDisabled();
    });
  });

  describe('FilesPage Upload, Download, and Delete Actions', () => {
    it('allows uploading a file and then downloading/deleting it', async () => {
      const user = userEvent.setup();
      const fileData = {
        id: 'file-1',
        organizationId: 'org-1',
        uploadedByUserId: 'u-1',
        originalFilename: 'test-document.pdf',
        contentType: 'application/pdf',
        size: 1024,
        checksum: 'abc',
        status: 'AVAILABLE' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockUploadFile.mockImplementation(async () => {
        mockListFiles.mockResolvedValue({ items: [fileData], nextCursor: null });
        return fileData;
      });

      render(
        <MemoryRouter>
          <ToastProvider>
            <FilesPage />
          </ToastProvider>
        </MemoryRouter>
      );

      // Initially empty state
      await waitFor(() => {
        expect(screen.getByText(/không tìm thấy tài liệu nào/i)).toBeInTheDocument();
      });

      // Upload file
      const file = new File(['dummy content'], 'test-document.pdf', { type: 'application/pdf' });
      const inputs = screen.getAllByLabelText(/tải tệp lên/i, { selector: 'input' });
      await user.upload(inputs[0], file);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      // Check download button exists
      const downloadBtn = screen.getByLabelText(/tải xuống test-document\.pdf/i);
      expect(downloadBtn).toBeInTheDocument();

      // Check delete button exists and works
      mockDeleteFile.mockResolvedValue({
        id: 'file-1',
        status: 'DELETED',
      });
      const deleteBtn = screen.getByLabelText(/xóa test-document\.pdf/i);
      await user.click(deleteBtn);

      await waitFor(() => {
        expect(mockDeleteFile).toHaveBeenCalledWith('org-1', 'file-1');
      });
    });
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FilesPage } from '@/features/files/FilesPage';
import { ToastProvider } from '@/contexts/ToastContext';
import * as filesApi from '@/api/files';
import * as permissionHook from '@/hooks/usePermission';
import type { FileMetadata } from '@/api/types';

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(() => ({
    currentOrg: {
      id: 'org-test-files',
      name: 'Test File Org',
      slug: 'test-files',
      status: 'ACTIVE',
      createdAt: '',
      updatedAt: '',
    },
    organizations: [],
    isLoading: false,
    setCurrentOrg: vi.fn(),
    refreshOrganizations: vi.fn(),
  })),
}));

describe('DXOS-FRONTEND-003: Files Integration & Permission UX Tests', () => {
  const mockOrg = {
    id: 'org-test-files',
    name: 'Test File Org',
    slug: 'test-files',
    status: 'ACTIVE' as const,
    createdAt: '',
    updatedAt: '',
  };

  const sampleFiles: FileMetadata[] = [
    {
      id: 'file-111',
      organizationId: 'org-test-files',
      uploadedByUserId: 'u-1',
      originalFilename: 'financial_report_q1.pdf',
      contentType: 'application/pdf',
      size: 2048576,
      checksum: 'chk111',
      status: 'AVAILABLE',
      createdAt: '2026-03-01T10:00:00Z',
      updatedAt: '2026-03-01T10:00:00Z',
    },
    {
      id: 'file-222',
      organizationId: 'org-test-files',
      uploadedByUserId: 'u-2',
      originalFilename: 'architecture_diagram.png',
      contentType: 'image/png',
      size: 512000,
      checksum: 'chk222',
      status: 'AVAILABLE',
      createdAt: '2026-03-02T11:00:00Z',
      updatedAt: '2026-03-02T11:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['file:read', 'file:upload', 'file:delete'],
      hasPermission: (perm) => ['file:read', 'file:upload', 'file:delete'].includes(perm),
      hasAnyPermission: (...perms) => perms.some((p) => ['file:read', 'file:upload', 'file:delete'].includes(p)),
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });
  });

  function renderFilesPage() {
    return render(
      <MemoryRouter>
        <ToastProvider>
          <FilesPage />
        </ToastProvider>
      </MemoryRouter>
    );
  }

  it('renders backend file list with metadata when user has file:read', async () => {
    vi.spyOn(filesApi, 'listFiles').mockResolvedValue({
      items: sampleFiles,
      nextCursor: null,
    });

    renderFilesPage();

    await waitFor(() => {
      expect(screen.getByText('financial_report_q1.pdf')).toBeInTheDocument();
      expect(screen.getByText('architecture_diagram.png')).toBeInTheDocument();
    });

    // Check sizes formatted
    expect(screen.getByText('2000.6 KB')).toBeInTheDocument();
    expect(screen.getByText('500.0 KB')).toBeInTheDocument();
  });

  it('renders EmptyState when backend returns zero files', async () => {
    vi.spyOn(filesApi, 'listFiles').mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    renderFilesPage();

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy tài liệu nào')).toBeInTheDocument();
    });
  });

  it('renders ForbiddenState when user lacks file:read permission', async () => {
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['organization:read'],
      hasPermission: (perm) => perm === 'organization:read',
      hasAnyPermission: (...perms) => perms.includes('organization:read'),
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    renderFilesPage();

    await waitFor(() => {
      expect(screen.getByText(/bạn không có quyền truy cập hoặc xem danh sách tài liệu/i)).toBeInTheDocument();
    });

    expect(filesApi.listFiles).not.toHaveBeenCalled();
  });

  it('hides upload button when user lacks file:upload permission', async () => {
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['organization:read', 'file:read'],
      hasPermission: (perm) => perm === 'organization:read' || perm === 'file:read',
      hasAnyPermission: (...perms) => perms.some((p) => p === 'organization:read' || p === 'file:read'),
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    vi.spyOn(filesApi, 'listFiles').mockResolvedValue({
      items: sampleFiles,
      nextCursor: null,
    });

    renderFilesPage();

    await waitFor(() => {
      expect(screen.getByText('financial_report_q1.pdf')).toBeInTheDocument();
    });

    // Upload button should NOT exist
    expect(screen.queryByText(/tải tệp lên/i)).not.toBeInTheDocument();
  });

  it('hides delete button when user lacks file:delete permission', async () => {
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['organization:read', 'file:read', 'file:upload'],
      hasPermission: (perm) => ['organization:read', 'file:read', 'file:upload'].includes(perm),
      hasAnyPermission: (...perms) => perms.some((p) => ['organization:read', 'file:read', 'file:upload'].includes(p)),
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    vi.spyOn(filesApi, 'listFiles').mockResolvedValue({
      items: sampleFiles,
      nextCursor: null,
    });

    renderFilesPage();

    await waitFor(() => {
      expect(screen.getByText('financial_report_q1.pdf')).toBeInTheDocument();
    });

    // Download button should exist
    expect(screen.getByLabelText(/tải xuống financial_report_q1\.pdf/i)).toBeInTheDocument();

    // Delete button should NOT exist
    expect(screen.queryByLabelText(/xóa financial_report_q1\.pdf/i)).not.toBeInTheDocument();
  });

  it('reconciles backend file list after successful upload', async () => {
    const user = userEvent.setup();
    const listFilesSpy = vi.spyOn(filesApi, 'listFiles');

    // First call: empty list
    listFilesSpy.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });

    const newFile: FileMetadata = {
      id: 'file-new-1',
      organizationId: 'org-test-files',
      uploadedByUserId: 'u-1',
      originalFilename: 'uploaded_doc.pdf',
      contentType: 'application/pdf',
      size: 1024,
      checksum: 'chk-new',
      status: 'AVAILABLE',
      createdAt: '2026-03-03T12:00:00Z',
      updatedAt: '2026-03-03T12:00:00Z',
    };

    vi.spyOn(filesApi, 'uploadFile').mockResolvedValue(newFile);

    // Second call after upload: includes new file
    listFilesSpy.mockResolvedValueOnce({
      items: [newFile],
      nextCursor: null,
    });

    renderFilesPage();

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy tài liệu nào')).toBeInTheDocument();
    });

    // Upload a file
    const file = new File(['content'], 'uploaded_doc.pdf', { type: 'application/pdf' });
    const inputs = screen.getAllByLabelText(/tải tệp lên/i, { selector: 'input' });
    await user.upload(inputs[0], file);

    // Should reconcile from backend
    await waitFor(() => {
      expect(screen.getByText('uploaded_doc.pdf')).toBeInTheDocument();
    });

    expect(listFilesSpy).toHaveBeenCalledTimes(2);
  });

  it('reconciles backend file list after file deletion', async () => {
    const user = userEvent.setup();
    const listFilesSpy = vi.spyOn(filesApi, 'listFiles');

    listFilesSpy.mockResolvedValueOnce({
      items: [sampleFiles[0]],
      nextCursor: null,
    });

    vi.spyOn(filesApi, 'deleteFile').mockResolvedValue({
      ...sampleFiles[0],
      status: 'DELETED',
    });

    // After delete, listFiles returns empty
    listFilesSpy.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });

    renderFilesPage();

    await waitFor(() => {
      expect(screen.getByText('financial_report_q1.pdf')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByLabelText(/xóa financial_report_q1\.pdf/i);
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy tài liệu nào')).toBeInTheDocument();
    });

    expect(filesApi.deleteFile).toHaveBeenCalledWith('org-test-files', 'file-111');
    expect(listFilesSpy).toHaveBeenCalledTimes(2);
  });
});

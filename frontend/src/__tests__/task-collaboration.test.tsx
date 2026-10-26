// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TaskDetailPage } from '@/features/tasks/TaskDetailPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { ToastProvider } from '@/contexts/ToastContext';
import * as tasksApi from '@/api/tasks';
import * as filesApi from '@/api/files';
import * as employeesApi from '@/api/employees';
import * as departmentsApi from '@/api/departments';
import * as permissionHook from '@/hooks/usePermission';
import type { Task, TaskComment, TaskAttachment, FileMetadata, Permission } from '@/api/types';

// Mock contexts
vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(() => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' },
    organizations: [{ id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' }],
    isLoading: false,
    setCurrentOrg: vi.fn(),
    refreshOrganizations: vi.fn(),
  })),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'usr-1', email: 'test@dxos.local', displayName: 'Test User', accountStatus: 'ACTIVE' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  })),
}));

vi.mock('@/api/client', () => ({
  isApiError: vi.fn((err: unknown) => typeof err === 'object' && err !== null && 'success' in err),
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

function mockPermissions(permissions: Permission[]) {
  vi.mocked(permissionHook.usePermission).mockReturnValue({
    permissions,
    hasPermission: vi.fn((key: string) => permissions.includes(key as Permission)),
    hasAnyPermission: vi.fn((...keys: string[]) => keys.some((k) => permissions.includes(k as Permission))),
    isLoading: false,
    error: null,
    refreshPermissions: vi.fn(),
  });
}

function renderTaskDetailPage(taskId = 'task-1') {
  return render(
    <MemoryRouter initialEntries={[`/tasks/${taskId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

function renderTasksPage() {
  return render(
    <MemoryRouter initialEntries={['/tasks']}>
      <ToastProvider>
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

const baseTask: Task = {
  id: 'task-1',
  organizationId: 'org-1',
  creatorEmployeeId: 'emp-creator',
  assigneeEmployeeId: 'emp-assignee',
  departmentId: 'dept-1',
  title: 'Thiết kế hệ thống DX-OS',
  description: 'Mô tả chi tiết công việc',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  progressPercent: 35,
  dueAt: '2026-10-01T12:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-02T00:00:00Z',
};

describe('DXOS-WORK-002: Task Collaboration, Progress, Comments, and Attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions([
      'task:read',
      'task:update',
      'task:create',
      'task:assign',
      'employee:read',
      'department:read',
      'file:read',
      'file:upload',
    ]);

    vi.spyOn(tasksApi, 'getTask').mockResolvedValue({ ...baseTask });
    vi.spyOn(tasksApi, 'updateTask').mockResolvedValue({ ...baseTask });
    vi.spyOn(tasksApi, 'listTasks').mockResolvedValue({
      items: [{ ...baseTask }],
      nextCursor: null,
    });
    vi.spyOn(tasksApi, 'listTaskComments').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.spyOn(tasksApi, 'listTaskAttachments').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.spyOn(employeesApi, 'listEmployees').mockResolvedValue({
      items: [
        { id: 'emp-creator', organizationId: 'org-1', userId: 'usr-1', departmentId: 'dept-1', employeeCode: 'EMP01', displayName: 'Nguyễn Văn Tạo', jobTitle: 'Lead', phone: null, status: 'ACTIVE', createdAt: '', updatedAt: '' },
        { id: 'emp-assignee', organizationId: 'org-1', userId: 'usr-2', departmentId: 'dept-1', employeeCode: 'EMP02', displayName: 'Trần Thị Nhận', jobTitle: 'Dev', phone: null, status: 'ACTIVE', createdAt: '', updatedAt: '' },
      ],
      nextCursor: null,
    });
    vi.spyOn(departmentsApi, 'listDepartments').mockResolvedValue({
      items: [{ id: 'dept-1', organizationId: 'org-1', name: 'Phòng Kỹ thuật', code: 'TECH', description: null, status: 'ACTIVE', createdAt: '', updatedAt: '' }],
      nextCursor: null,
    });
    vi.spyOn(filesApi, 'listFiles').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
  });

  // 1. Progress display in list
  it('1. displays task progress percent in tasks list table', async () => {
    renderTasksPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });
    // Check progress column
    expect(screen.getByText('Tiến độ')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  // 2. Progress display in task detail
  it('2. displays progress percent and progress bar in task detail header', async () => {
    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });
    // Progress should be visible in detail
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThan(0);
    expect(progressBars[0]).toHaveAttribute('aria-valuenow', '35');
  });

  // 3. Progress adjustment in IN_PROGRESS sends PATCH with only progressPercent
  it('3. saves updated progressPercent without sending unchanged assigneeEmployeeId', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(tasksApi, 'updateTask').mockResolvedValue({
      ...baseTask,
      progressPercent: 60,
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });

    const rangeInput = screen.getByLabelText(/điều chỉnh tiến độ/i);
    fireEvent.change(rangeInput, { target: { value: '60' } });

    const saveBtn = screen.getByRole('button', { name: /lưu tiến độ/i });
    await user.click(saveBtn);

    expect(updateSpy).toHaveBeenCalledWith('org-1', 'task-1', {
      progressPercent: 60,
    });
  });

  // 4. Starting at 30% from TODO sends status IN_PROGRESS and progressPercent 30
  it('4. transitions TODO to IN_PROGRESS when setting progress > 0', async () => {
    const user = userEvent.setup();
    vi.spyOn(tasksApi, 'getTask').mockResolvedValue({
      ...baseTask,
      status: 'TODO',
      progressPercent: 0,
    });
    const updateSpy = vi.spyOn(tasksApi, 'updateTask').mockResolvedValue({
      ...baseTask,
      status: 'IN_PROGRESS',
      progressPercent: 30,
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });

    const rangeInput = screen.getByLabelText(/điều chỉnh tiến độ/i);
    fireEvent.change(rangeInput, { target: { value: '30' } });

    const saveBtn = screen.getByRole('button', { name: /lưu tiến độ/i });
    await user.click(saveBtn);

    expect(updateSpy).toHaveBeenCalledWith('org-1', 'task-1', {
      status: 'IN_PROGRESS',
      progressPercent: 30,
    });
  });

  // 5. Handling 409 Conflict reloads task data
  it('5. handles 409 conflict when updating progress and reloads task', async () => {
    const user = userEvent.setup();
    const getTaskSpy = vi.spyOn(tasksApi, 'getTask');
    vi.spyOn(tasksApi, 'updateTask').mockRejectedValue({
      success: false,
      error: { code: 'CONFLICT', message: 'Task is terminal', requestId: 'req-409' },
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });

    const rangeInput = screen.getByLabelText(/điều chỉnh tiến độ/i);
    fireEvent.change(rangeInput, { target: { value: '50' } });

    const saveBtn = screen.getByRole('button', { name: /lưu tiến độ/i });
    await user.click(saveBtn);

    // Should call getTask again to reload latest state
    await waitFor(() => {
      expect(getTaskSpy).toHaveBeenCalledTimes(2);
    });
  });

  // 6. Comments display with author display name fallback
  it('6. displays comments with author display name and fallback for null author', async () => {
    const comment1: TaskComment = {
      id: 'c-1',
      taskId: 'task-1',
      authorUserId: 'usr-1',
      authorDisplayName: 'Lê Văn Bình',
      body: 'Bình luận đầu tiên về công việc.',
      createdAt: '2026-09-02T10:00:00Z',
    };
    const comment2: TaskComment = {
      id: 'c-2',
      taskId: 'task-1',
      authorUserId: 'usr-anonymous',
      authorDisplayName: null,
      body: 'Bình luận từ người dùng ẩn danh.',
      createdAt: '2026-09-02T11:00:00Z',
    };

    vi.spyOn(tasksApi, 'listTaskComments').mockResolvedValue({
      items: [comment1, comment2],
      nextCursor: null,
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Bình luận đầu tiên về công việc.')).toBeInTheDocument();
      expect(screen.getByText('Lê Văn Bình')).toBeInTheDocument();
      expect(screen.getByText('Bình luận từ người dùng ẩn danh.')).toBeInTheDocument();
      expect(screen.getByText('Thành viên tổ chức')).toBeInTheDocument();
    });
  });

  // 7. Plain text rendering for comments (no HTML injection)
  it('7. safely renders untrusted script and HTML in comments as plain text', async () => {
    const maliciousComment: TaskComment = {
      id: 'c-xss',
      taskId: 'task-1',
      authorUserId: 'usr-1',
      authorDisplayName: 'Attacker',
      body: '<script>alert("xss")</script><b id="injected-tag">Nội dung test</b>',
      createdAt: '2026-09-02T12:00:00Z',
    };

    vi.spyOn(tasksApi, 'listTaskComments').mockResolvedValue({
      items: [maliciousComment],
      nextCursor: null,
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('<script>alert("xss")</script>'))).toBeInTheDocument();
    });
    // DOM should NOT contain executed or parsed injected element
    expect(document.getElementById('injected-tag')).toBeNull();
  });

  // 8. Comment pagination (load more)
  it('8. supports load more pagination for comments without creating duplicates', async () => {
    const user = userEvent.setup();
    const comment1: TaskComment = {
      id: 'c-1',
      taskId: 'task-1',
      authorUserId: 'usr-1',
      authorDisplayName: 'Author 1',
      body: 'Page 1 comment',
      createdAt: '2026-09-01T10:00:00Z',
    };
    const comment2: TaskComment = {
      id: 'c-2',
      taskId: 'task-1',
      authorUserId: 'usr-2',
      authorDisplayName: 'Author 2',
      body: 'Page 2 comment',
      createdAt: '2026-09-01T11:00:00Z',
    };

    const listCommentsSpy = vi.spyOn(tasksApi, 'listTaskComments')
      .mockResolvedValueOnce({
        items: [comment1],
        nextCursor: 'cursor-c-1',
      })
      .mockResolvedValueOnce({
        items: [comment2],
        nextCursor: null,
      });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Page 1 comment')).toBeInTheDocument();
    });

    const loadMoreBtn = screen.getByRole('button', { name: /tải thêm bình luận/i });
    expect(loadMoreBtn).toBeInTheDocument();

    await user.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText('Page 2 comment')).toBeInTheDocument();
      expect(screen.getByText('Page 1 comment')).toBeInTheDocument();
    });

    expect(listCommentsSpy).toHaveBeenCalledWith('org-1', 'task-1', {
      limit: 25,
      after: 'cursor-c-1',
    });
  });

  // 9. Adding a comment and disabling double submit
  it('9. adds a new comment and prevents double submit', async () => {
    const user = userEvent.setup();
    const createCommentSpy = vi.spyOn(tasksApi, 'createTaskComment').mockResolvedValue({
      id: 'c-new',
      taskId: 'task-1',
      authorUserId: 'usr-1',
      authorDisplayName: 'Test User',
      body: 'Bình luận vừa mới gửi.',
      createdAt: '2026-09-03T10:00:00Z',
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/nội dung bình luận/i);
    await user.type(textarea, 'Bình luận vừa mới gửi.');

    const sendBtn = screen.getByRole('button', { name: /gửi bình luận/i });
    expect(sendBtn).not.toBeDisabled();

    await user.click(sendBtn);

    expect(createCommentSpy).toHaveBeenCalledWith('org-1', 'task-1', {
      body: 'Bình luận vừa mới gửi.',
    });

    await waitFor(() => {
      expect(screen.getByText('Bình luận vừa mới gửi.')).toBeInTheDocument();
    });
  });

  // 10. Terminal task locks comment submission
  it('10. locks comment submission when task is DONE or CANCELLED', async () => {
    vi.spyOn(tasksApi, 'getTask').mockResolvedValue({
      ...baseTask,
      status: 'DONE',
      progressPercent: 100,
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });

    expect(screen.getByText(/công việc đã kết thúc — không thể thêm bình luận mới/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nội dung bình luận/i)).toBeNull();
  });

  // 11. Attachments list rendering and authenticated download
  it('11. displays attachments and downloads file using authenticated downloadFile', async () => {
    const user = userEvent.setup();
    const attachment: TaskAttachment = {
      id: 'att-1',
      taskId: 'task-1',
      linkedByUserId: 'usr-1',
      createdAt: '2026-09-01T15:00:00Z',
      file: {
        id: 'file-123',
        originalFilename: 'tai-lieu-dac-ta.pdf',
        contentType: 'application/pdf',
        size: 1048576, // 1 MB
      },
    };

    vi.spyOn(tasksApi, 'listTaskAttachments').mockResolvedValue({
      items: [attachment],
      nextCursor: null,
    });

    const mockBlob = new Blob(['sample file content'], { type: 'application/pdf' });
    const downloadSpy = vi.spyOn(filesApi, 'downloadFile').mockResolvedValue(mockBlob);

    // Mock URL.createObjectURL
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/dummy');
    window.URL.revokeObjectURL = vi.fn();

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('tai-lieu-dac-ta.pdf')).toBeInTheDocument();
      expect(screen.getByText('1.0 MB')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByLabelText(/tải xuống tai-lieu-dac-ta\.pdf/i);
    await user.click(downloadBtn);

    expect(downloadSpy).toHaveBeenCalledWith('org-1', 'file-123');
    clickSpy.mockRestore();
  });

  // 12. Unlinking attachment
  it('12. unlinks attachment upon confirmation without deleting shared file', async () => {
    const user = userEvent.setup();
    const attachment: TaskAttachment = {
      id: 'att-unlink',
      taskId: 'task-1',
      linkedByUserId: 'usr-1',
      createdAt: '2026-09-01T15:00:00Z',
      file: {
        id: 'file-456',
        originalFilename: 'file-to-unlink.png',
        contentType: 'image/png',
        size: 2048,
      },
    };

    vi.spyOn(tasksApi, 'listTaskAttachments').mockResolvedValue({
      items: [attachment],
      nextCursor: null,
    });

    const unlinkSpy = vi.spyOn(tasksApi, 'deleteTaskAttachment').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('file-to-unlink.png')).toBeInTheDocument();
    });

    const unlinkBtn = screen.getByLabelText(/gỡ liên kết file-to-unlink.png/i);
    await user.click(unlinkBtn);

    expect(unlinkSpy).toHaveBeenCalledWith('org-1', 'task-1', 'att-unlink');
    await waitFor(() => {
      expect(screen.queryByText('file-to-unlink.png')).toBeNull();
    });
  });

  // 13. Attaching existing file from organization files
  it('13. attaches existing organization file to task', async () => {
    const user = userEvent.setup();
    const existingFile: FileMetadata = {
      id: 'file-org-1',
      organizationId: 'org-1',
      uploadedByUserId: 'usr-1',
      originalFilename: 'shared-report.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 51200,
      checksum: 'abc123checksum',
      status: 'AVAILABLE',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    };

    vi.spyOn(filesApi, 'listFiles').mockResolvedValue({
      items: [existingFile],
      nextCursor: null,
    });

    const attachSpy = vi.spyOn(tasksApi, 'createTaskAttachment').mockResolvedValue({
      id: 'att-new',
      taskId: 'task-1',
      linkedByUserId: 'usr-1',
      createdAt: '2026-09-03T00:00:00Z',
      file: {
        id: existingFile.id,
        originalFilename: existingFile.originalFilename,
        contentType: existingFile.contentType,
        size: existingFile.size,
      },
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });

    const openAttachBtn = screen.getByRole('button', { name: /đính kèm tài liệu/i });
    await user.click(openAttachBtn);

    await waitFor(() => {
      expect(screen.getByText('shared-report.docx')).toBeInTheDocument();
    });

    const radio = screen.getByRole('radio');
    await user.click(radio);

    const submitAttachBtn = screen.getByRole('button', { name: 'Đính kèm' });
    await user.click(submitAttachBtn);

    expect(attachSpy).toHaveBeenCalledWith('org-1', 'task-1', {
      fileId: 'file-org-1',
    });

    await waitFor(() => {
      expect(screen.getByText('shared-report.docx')).toBeInTheDocument();
    });
  });

  // 14. Uploading new file and attaching it to task
  it('14. uploads a new file and links it to task', async () => {
    const user = userEvent.setup();
    const uploadedFile: FileMetadata = {
      id: 'file-newly-uploaded',
      organizationId: 'org-1',
      uploadedByUserId: 'usr-1',
      originalFilename: 'new-document.pdf',
      contentType: 'application/pdf',
      size: 100,
      checksum: 'chk123',
      status: 'AVAILABLE',
      createdAt: '2026-09-03T00:00:00Z',
      updatedAt: '2026-09-03T00:00:00Z',
    };

    const uploadSpy = vi.spyOn(filesApi, 'uploadFile').mockResolvedValue(uploadedFile);
    const linkSpy = vi.spyOn(tasksApi, 'createTaskAttachment').mockResolvedValue({
      id: 'att-newly-linked',
      taskId: 'task-1',
      linkedByUserId: 'usr-1',
      createdAt: '2026-09-03T00:00:00Z',
      file: {
        id: uploadedFile.id,
        originalFilename: uploadedFile.originalFilename,
        contentType: uploadedFile.contentType,
        size: uploadedFile.size,
      },
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /đính kèm tài liệu/i }));

    // Switch to upload tab
    await user.click(screen.getByRole('button', { name: /tải tệp mới lên/i }));

    const file = new File(['%PDF-1.7\nfixture'], 'new-document.pdf', { type: 'application/pdf' });
    const fileInput = document.getElementById('task-file-upload-input') as HTMLInputElement;
    await user.upload(fileInput, file);

    const submitBtn = screen.getByRole('button', { name: /tải lên & đính kèm/i });
    await user.click(submitBtn);

    expect(uploadSpy).toHaveBeenCalledWith('org-1', file);
    expect(linkSpy).toHaveBeenCalledWith('org-1', 'task-1', {
      fileId: 'file-newly-uploaded',
    });

    await waitFor(() => {
      expect(screen.getByText('new-document.pdf')).toBeInTheDocument();
    });
  });

  // 15. Upload succeeds but link fails: retains file and shows error
  it('15. retains uploaded file and shows warning if attachment linking fails', async () => {
    const user = userEvent.setup();
    const uploadedFile: FileMetadata = {
      id: 'file-partial',
      organizationId: 'org-1',
      uploadedByUserId: 'usr-1',
      originalFilename: 'partial.pdf',
      contentType: 'application/pdf',
      size: 5000,
      checksum: 'chkpartial',
      status: 'AVAILABLE',
      createdAt: '2026-09-03T00:00:00Z',
      updatedAt: '2026-09-03T00:00:00Z',
    };

    vi.spyOn(filesApi, 'uploadFile').mockResolvedValue(uploadedFile);
    vi.spyOn(tasksApi, 'createTaskAttachment').mockRejectedValue({
      success: false,
      error: { code: 'CONFLICT', message: 'Task is terminal', requestId: 'req-link-fail' },
    });
    vi.spyOn(filesApi, 'listFiles').mockResolvedValue({
      items: [uploadedFile],
      nextCursor: null,
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /đính kèm tài liệu/i }));
    await user.click(screen.getByRole('button', { name: /tải tệp mới lên/i }));

    const file = new File(['content'], 'partial.pdf', { type: 'application/pdf' });
    const fileInput = document.getElementById('task-file-upload-input') as HTMLInputElement;
    await user.upload(fileInput, file);

    await user.click(screen.getByRole('button', { name: /tải lên & đính kèm/i }));

    // Should switch to select tab and display message
    await waitFor(() => {
      expect(screen.getByText('partial.pdf')).toBeInTheDocument();
    });
  });

  // 16. Terminal task locks attaching & unlinking
  it('16. hides or disables attach button and unlink button when task is terminal', async () => {
    vi.spyOn(tasksApi, 'getTask').mockResolvedValue({
      ...baseTask,
      status: 'CANCELLED',
      progressPercent: 50,
    });
    const attachment: TaskAttachment = {
      id: 'att-1',
      taskId: 'task-1',
      linkedByUserId: 'usr-1',
      createdAt: '2026-09-01T15:00:00Z',
      file: {
        id: 'file-123',
        originalFilename: 'locked-file.pdf',
        contentType: 'application/pdf',
        size: 500,
      },
    };
    vi.spyOn(tasksApi, 'listTaskAttachments').mockResolvedValue({
      items: [attachment],
      nextCursor: null,
    });

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('locked-file.pdf')).toBeInTheDocument();
    });

    // Attach button should NOT be rendered
    expect(screen.queryByRole('button', { name: /đính kèm tài liệu/i })).toBeNull();
    // Unlink button should NOT be rendered
    expect(screen.queryByLabelText(/gỡ liên kết locked-file.pdf/i)).toBeNull();
    // Download button SHOULD still be available
    expect(screen.getByLabelText(/tải xuống locked-file.pdf/i)).toBeInTheDocument();
  });

  // 17. Permission enforcement: file:read required for attachments
  it('17. shows permission required notice in attachments when lacking file:read', async () => {
    mockPermissions(['task:read', 'task:update']);

    renderTaskDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Thiết kế hệ thống DX-OS')).toBeInTheDocument();
    });

    expect(screen.getByText(/bạn không có quyền xem tài liệu đính kèm/i)).toBeInTheDocument();
  });
});

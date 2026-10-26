// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Clock,
  User,
  Building2,
  MessageSquare,
  Paperclip,
  Download,
  Trash2,
  Upload,
  AlertCircle,
  FileText,
  Send,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { useToast } from '@/contexts/ToastContext';
import { usePermission } from '@/hooks/usePermission';
import {
  getTask,
  updateTask,
  listTaskComments,
  createTaskComment,
  listTaskAttachments,
  createTaskAttachment,
  deleteTaskAttachment,
} from '@/api/tasks';
import { listEmployees } from '@/api/employees';
import { listDepartments } from '@/api/departments';
import { listFiles, uploadFile, downloadFile } from '@/api/files';
import { isApiError } from '@/api/client';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { TaskStatusBadge } from '@/components/ui/TaskStatusBadge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { TaskProgressBar } from '@/components/ui/TaskProgressBar';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import type {
  Task,
  Employee,
  Department,
  TaskStatus,
  TaskPriority,
  UpdateTaskRequest,
  TaskComment,
  TaskAttachment,
  FileMetadata,
} from '@/api/types';
import { format } from 'date-fns';
import { TaskPlanningPanel } from './TaskPlanningPanel';

const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang thực hiện',
  DONE: 'Hoàn thành',
  CANCELLED: 'Hủy công việc',
};

function getAllowedStatuses(current: TaskStatus): TaskStatus[] {
  switch (current) {
    case 'TODO':
      return ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
    case 'IN_PROGRESS':
      return ['IN_PROGRESS', 'TODO', 'DONE', 'CANCELLED'];
    case 'DONE':
      return ['DONE'];
    case 'CANCELLED':
      return ['CANCELLED'];
    default:
      return ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
  }
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const { currentOrg } = useOrganization();
  return <TaskDetailContent key={`${currentOrg?.id ?? 'no-organization'}:${taskId}`} />;
}

function TaskDetailContent() {
  const { taskId } = useParams<{ taskId: string }>();
  const { currentOrg } = useOrganization();
  const { showToast } = useToast();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();

  // Safe fallback for auth context in tests
  let isAuthenticated = true;
  try {
    const auth = useAuth();
    isAuthenticated = auth.isAuthenticated;
  } catch {
    isAuthenticated = true;
  }

  const canRead = hasPermission('task:read');
  const canUpdate = hasPermission('task:update');
  const canAssign = hasPermission('task:assign');
  const canReadEmp = hasPermission('employee:read');
  const canReadDept = hasPermission('department:read');
  const canReadFile = hasPermission('file:read');
  const canUploadFile = hasPermission('file:upload');

  const orgId = currentOrg?.id;

  // Task basic state
  const [task, setTask] = useState<Task | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Task modal
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    status: 'TODO' as TaskStatus,
    priority: 'MEDIUM' as TaskPriority,
    progressPercent: 0,
    dueAt: '',
    departmentId: '',
    assigneeEmployeeId: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Quick progress update
  const [progressInput, setProgressInput] = useState<number>(0);
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);

  // Comments state
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentCursor, setAttachmentCursor] = useState<string | null>(null);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [isLoadingMoreAttachments, setIsLoadingMoreAttachments] = useState(false);

  // Attach modal state
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [attachTab, setAttachTab] = useState<'select' | 'upload'>('select');
  const [existingFiles, setExistingFiles] = useState<FileMetadata[]>([]);
  const [existingFilesCursor, setExistingFilesCursor] = useState<string | null>(null);
  const [isLoadingExistingFiles, setIsLoadingExistingFiles] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [uploadSelectedFile, setUploadSelectedFile] = useState<File | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isDownloadingId, setIsDownloadingId] = useState<string | null>(null);
  const [isUnlinkingId, setIsUnlinkingId] = useState<string | null>(null);

  const isTerminal = task?.status === 'DONE' || task?.status === 'CANCELLED';

  // Request race condition guards
  const activeTaskIdRef = useRef<string | null>(taskId ?? null);
  const activeOrgIdRef = useRef<string | null>(orgId ?? null);

  // Load Task and References
  const loadTaskData = useCallback(async () => {
    if (!orgId || !taskId) return;
    if (!canRead && !isPermissionLoading) return;

    setIsLoading(true);
    try {
      const [t, emps, depts] = await Promise.all([
        getTask(orgId, taskId),
        canReadEmp
          ? listEmployees(orgId, { limit: 100, status: 'ACTIVE' }).catch(() => ({ items: [] as Employee[] }))
          : Promise.resolve({ items: [] as Employee[] }),
        canReadDept
          ? listDepartments(orgId, { limit: 100, status: 'ACTIVE' }).catch(() => ({ items: [] as Department[] }))
          : Promise.resolve({ items: [] as Department[] }),
      ]);

      if (activeTaskIdRef.current === taskId && activeOrgIdRef.current === orgId) {
        setTask(t);
        setProgressInput(t.progressPercent ?? 0);
        setEmployees(emps.items);
        setDepartments(depts.items);
        setError(null);
      }
    } catch (err) {
      if (activeTaskIdRef.current === taskId && activeOrgIdRef.current === orgId) {
        if (isApiError(err)) setError(err.error.message);
        else setError('Không thể tải thông tin công việc.');
      }
    } finally {
      if (activeTaskIdRef.current === taskId && activeOrgIdRef.current === orgId) {
        setIsLoading(false);
      }
    }
  }, [orgId, taskId, canRead, isPermissionLoading, canReadEmp, canReadDept]);

  // Load Comments
  const loadComments = useCallback(
    async (cursor?: string) => {
      if (!orgId || !taskId || !canRead) return;
      if (cursor) {
        setIsLoadingMoreComments(true);
      } else {
        setIsLoadingComments(true);
      }

      try {
        const response = await listTaskComments(orgId, taskId, {
          limit: 25,
          after: cursor,
        });

        if (activeTaskIdRef.current === taskId && activeOrgIdRef.current === orgId) {
          if (cursor) {
            setComments((prev) => {
              const existingIds = new Set(prev.map((c) => c.id));
              const newItems = response.items.filter((c) => !existingIds.has(c.id));
              return [...prev, ...newItems];
            });
          } else {
            setComments(response.items);
          }
          setCommentCursor(response.nextCursor);
        }
      } catch (err) {
        if (activeTaskIdRef.current === taskId && activeOrgIdRef.current === orgId) {
          if (isApiError(err) && err.error.code === 'BAD_REQUEST') {
            // Cursor invalid or task mismatch -> reset pagination
            setCommentCursor(null);
          }
        }
      } finally {
        if (activeTaskIdRef.current === taskId && activeOrgIdRef.current === orgId) {
          setIsLoadingComments(false);
          setIsLoadingMoreComments(false);
        }
      }
    },
    [orgId, taskId, canRead]
  );

  // Load Attachments
  const loadAttachments = useCallback(
    async (cursor?: string) => {
      if (!orgId || !taskId || !canRead || !canReadFile) return;
      if (cursor) {
        setIsLoadingMoreAttachments(true);
      } else {
        setIsLoadingAttachments(true);
      }

      try {
        const response = await listTaskAttachments(orgId, taskId, {
          limit: 25,
          after: cursor,
        });

        if (activeTaskIdRef.current === taskId && activeOrgIdRef.current === orgId) {
          if (cursor) {
            setAttachments((prev) => {
              const existingIds = new Set(prev.map((a) => a.id));
              const newItems = response.items.filter((a) => !existingIds.has(a.id));
              return [...prev, ...newItems];
            });
          } else {
            setAttachments(response.items);
          }
          setAttachmentCursor(response.nextCursor);
        }
      } catch (err) {
        if (activeTaskIdRef.current === taskId && activeOrgIdRef.current === orgId) {
          if (isApiError(err) && err.error.code === 'BAD_REQUEST') {
            setAttachmentCursor(null);
          }
        }
      } finally {
        if (activeTaskIdRef.current === taskId && activeOrgIdRef.current === orgId) {
          setIsLoadingAttachments(false);
          setIsLoadingMoreAttachments(false);
        }
      }
    },
    [orgId, taskId, canRead, canReadFile]
  );

  // Tenant / Task / Logout lifecycle guard
  useEffect(() => {
    if (!isAuthenticated || !orgId || !taskId) {
      setTask(null);
      setComments([]);
      setAttachments([]);
      setCommentCursor(null);
      setAttachmentCursor(null);
      activeTaskIdRef.current = null;
      activeOrgIdRef.current = null;
      return;
    }

    if (activeTaskIdRef.current !== taskId || activeOrgIdRef.current !== orgId) {
      activeTaskIdRef.current = taskId;
      activeOrgIdRef.current = orgId;
      setComments([]);
      setAttachments([]);
      setCommentCursor(null);
      setAttachmentCursor(null);
    }

    loadTaskData();
    if (canRead) {
      loadComments();
    }
    if (canRead && canReadFile) {
      loadAttachments();
    }
  }, [isAuthenticated, orgId, taskId, canRead, canReadFile, loadTaskData, loadComments, loadAttachments]);

  const getEmployeeName = (id: string | null) => {
    if (!id) return 'Chưa phân công';
    return employees.find((e) => e.id === id)?.displayName || id.slice(0, 8);
  };

  const getDeptName = (id: string | null) => {
    if (!id) return 'Không có';
    return departments.find((d) => d.id === id)?.name || id.slice(0, 8);
  };

  // Status transitions
  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!orgId || !task || isTerminal || !canUpdate) return;
    try {
      const payload: UpdateTaskRequest = { status: newStatus };
      if (newStatus === 'IN_PROGRESS' && task.status === 'TODO' && progressInput > 0) {
        payload.progressPercent = progressInput;
      }
      const updated = await updateTask(orgId, task.id, payload);
      setTask(updated);
      setProgressInput(updated.progressPercent ?? 0);
      showToast(`Đã chuyển trạng thái sang "${STATUS_LABELS[newStatus]}"`, 'success');
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'CONFLICT') {
          showToast('Công việc đã kết thúc hoặc có xung đột dữ liệu. Đang tải lại dữ liệu mới nhất.', 'error');
          loadTaskData();
        } else {
          showToast(err.error.message, 'error');
        }
      }
    }
  };

  // Save Progress
  const handleSaveProgress = async () => {
    if (!orgId || !task || isTerminal || !canUpdate) return;
    setIsUpdatingProgress(true);
    try {
      const payload: UpdateTaskRequest = { progressPercent: progressInput };
      // If task is in TODO and user wants progress > 0, transition to IN_PROGRESS
      if (task.status === 'TODO' && progressInput > 0) {
        payload.status = 'IN_PROGRESS';
      }
      const updated = await updateTask(orgId, task.id, payload);
      setTask(updated);
      setProgressInput(updated.progressPercent ?? 0);
      showToast('Cập nhật tiến độ thành công', 'success');
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'CONFLICT') {
          showToast('Tiến độ không tương thích với trạng thái hiện tại hoặc công việc đã bị khóa.', 'error');
          loadTaskData();
        } else {
          showToast(err.error.message, 'error');
        }
      }
    } finally {
      setIsUpdatingProgress(false);
    }
  };

  // Submit comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !task || isTerminal || !canUpdate) return;
    const body = commentText.trim();
    if (!body || body.length > 4000) return;

    setIsSubmittingComment(true);
    try {
      const newComment = await createTaskComment(orgId, task.id, { body });
      setComments((prev) => [...prev, newComment]);
      setCommentText('');
      showToast('Đã gửi bình luận', 'success');
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'CONFLICT') {
          showToast('Công việc đã kết thúc — không thể thêm bình luận.', 'error');
          loadTaskData();
        } else {
          showToast(err.error.message, 'error');
        }
      } else {
        showToast('Không thể gửi bình luận. Vui lòng thử lại.', 'error');
      }
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Download attachment
  const handleDownloadAttachment = async (attachment: TaskAttachment) => {
    if (!orgId) return;
    setIsDownloadingId(attachment.id);
    try {
      const blob = await downloadFile(orgId, attachment.file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file.originalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      if (isApiError(err)) {
        showToast(err.error.message, 'error');
      } else {
        showToast('Không thể tải xuống tài liệu.', 'error');
      }
    } finally {
      setIsDownloadingId(null);
    }
  };

  // Unlink attachment
  const handleUnlinkAttachment = async (attachmentId: string) => {
    if (!orgId || !task || isTerminal || !canUpdate || !canReadFile) return;
    if (!window.confirm('Gỡ tài liệu khỏi công việc? Tệp vẫn còn trong kho tài liệu.')) {
      return;
    }

    setIsUnlinkingId(attachmentId);
    try {
      await deleteTaskAttachment(orgId, task.id, attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      showToast('Đã gỡ liên kết tài liệu', 'success');
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'CONFLICT') {
          showToast('Công việc đã kết thúc — không thể gỡ tài liệu.', 'error');
          loadTaskData();
        } else {
          showToast(err.error.message, 'error');
        }
      } else {
        showToast('Không thể gỡ liên kết tài liệu.', 'error');
      }
    } finally {
      setIsUnlinkingId(null);
    }
  };

  // Load existing files for selection modal
  const loadExistingFiles = useCallback(
    async (cursor?: string) => {
      if (!orgId || !canReadFile) return;
      setIsLoadingExistingFiles(true);
      try {
        const response = await listFiles(orgId, { limit: 25, after: cursor });
        const available = response.items.filter((f) => f.status === 'AVAILABLE');
        if (cursor) {
          setExistingFiles((prev) => [...prev, ...available]);
        } else {
          setExistingFiles(available);
        }
        setExistingFilesCursor(response.nextCursor);
      } catch {
        // Safe fallback
      } finally {
        setIsLoadingExistingFiles(false);
      }
    },
    [orgId, canReadFile]
  );

  const openAttachModal = () => {
    if (isTerminal) return;
    setSelectedFileId('');
    setUploadSelectedFile(null);
    setAttachTab('select');
    setAttachModalOpen(true);
    loadExistingFiles();
  };

  // Perform Attach
  const handlePerformAttach = async () => {
    if (!orgId || !task || isTerminal || !canUpdate || !canReadFile || (attachTab === 'upload' && !canUploadFile)) return;

    if (attachTab === 'select') {
      if (!selectedFileId) {
        showToast('Vui lòng chọn một tài liệu từ danh sách.', 'error');
        return;
      }
      setIsAttaching(true);
      try {
        const linked = await createTaskAttachment(orgId, task.id, { fileId: selectedFileId });
        setAttachments((prev) => {
          if (prev.some((a) => a.id === linked.id)) return prev;
          return [...prev, linked];
        });
        setAttachModalOpen(false);
        showToast('Đính kèm tài liệu thành công', 'success');
      } catch (err) {
        if (isApiError(err)) {
          if (err.error.code === 'CONFLICT') {
            showToast('Công việc đã kết thúc hoặc tài liệu không khả dụng.', 'error');
            loadTaskData();
          } else {
            showToast(err.error.message, 'error');
          }
        } else {
          showToast('Không thể đính kèm tài liệu.', 'error');
        }
      } finally {
        setIsAttaching(false);
      }
    } else {
      // Upload & Link
      if (!uploadSelectedFile) {
        showToast('Vui lòng chọn một tệp tin từ thiết bị của bạn.', 'error');
        return;
      }
      setIsAttaching(true);
      let uploadedFileRecord: FileMetadata | null = null;
      try {
        uploadedFileRecord = await uploadFile(orgId, uploadSelectedFile);
      } catch (uploadErr) {
        setIsAttaching(false);
        if (isApiError(uploadErr)) {
          showToast(uploadErr.error.message, 'error');
        } else {
          showToast('Tải tệp tin lên thất bại.', 'error');
        }
        return;
      }

      // Link uploaded file
      try {
        const linked = await createTaskAttachment(orgId, task.id, { fileId: uploadedFileRecord.id });
        setAttachments((prev) => {
          if (prev.some((a) => a.id === linked.id)) return prev;
          return [...prev, linked];
        });
        setAttachModalOpen(false);
        showToast('Tải lên và đính kèm tài liệu thành công', 'success');
      } catch (linkErr) {
        showToast(
          'Tệp đã lưu trong kho tài liệu. Chọn lại tệp để đính kèm vào công việc.',
          'error'
        );
        // Retain uploaded file and switch tab to select
        setAttachTab('select');
        loadExistingFiles();
      } finally {
        setIsAttaching(false);
      }
    }
  };

  // Edit Modal Handlers
  const openEditModal = () => {
    if (!task || isTerminal) return;
    setEditData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      progressPercent: task.progressPercent ?? 0,
      dueAt: task.dueAt ? format(new Date(task.dueAt), "yyyy-MM-dd'T'HH:mm") : '',
      departmentId: task.departmentId || '',
      assigneeEmployeeId: task.assigneeEmployeeId || '',
    });
    setEditErrors({});
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!orgId || !task || isTerminal || (!canUpdate && !canAssign) || isSaving) return;
    setIsSaving(true);
    setEditErrors({});
    try {
      const data: UpdateTaskRequest = {};
      if (canUpdate) {
      if (editData.title.trim() !== task.title) data.title = editData.title.trim();
      if ((editData.description.trim() || null) !== task.description) {
        data.description = editData.description.trim() || null;
      }
      if (editData.status !== task.status) data.status = editData.status;
      if (editData.priority !== task.priority) data.priority = editData.priority;
      if (editData.progressPercent !== (task.progressPercent ?? 0)) {
        data.progressPercent = editData.progressPercent;
      }
      if (editData.dueAt !== (task.dueAt ? format(new Date(task.dueAt), "yyyy-MM-dd'T'HH:mm") : '')) {
        data.dueAt = editData.dueAt ? new Date(editData.dueAt).toISOString() : null;
      }
      if ((editData.departmentId || null) !== task.departmentId) {
        data.departmentId = editData.departmentId || null;
      }
      }
      if (canAssign && (editData.assigneeEmployeeId || null) !== task.assigneeEmployeeId) {
        data.assigneeEmployeeId = editData.assigneeEmployeeId || null;
      }

      if (Object.keys(data).length === 0) {
        setEditOpen(false);
        return;
      }

      const updated = await updateTask(orgId, task.id, data);
      setTask(updated);
      setProgressInput(updated.progressPercent ?? 0);
      setEditOpen(false);
      showToast('Cập nhật công việc thành công', 'success');
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          showToast('Bạn không có quyền chỉnh sửa công việc này.', 'error');
        } else if (err.error.code === 'CONFLICT') {
          showToast('Công việc đã kết thúc hoặc có xung đột trạng thái/tiến độ.', 'error');
          loadTaskData();
        } else if (err.error.details?.fields) {
          const fe: Record<string, string> = {};
          err.error.details.fields.forEach((f) => {
            fe[f] = err.error.message;
          });
          setEditErrors(fe);
        } else {
          setEditErrors({ general: err.error.message });
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const orgGuard = useOrgBootstrapGuard();
  if (orgGuard) return orgGuard;
  if (isLoading || isPermissionLoading) return <LoadingState message="Đang tải thông tin chi tiết công việc..." />;
  if (!canRead) return <ForbiddenState message="Bạn không có quyền xem chi tiết công việc này." />;
  if (error || !task) return <ErrorState message={error || 'Không tìm thấy công việc'} />;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back link */}
      <Link to="/tasks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Quay lại danh sách công việc
      </Link>

      {/* Task Header & Details Card */}
      <div className="card p-6">
        {isTerminal && (
          <div className="mb-4 p-3 rounded-lg bg-slate-100 text-sm text-slate-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-slate-500 shrink-0" />
            <span>
              Công việc đã kết thúc ({task.status === 'DONE' ? 'Hoàn thành' : 'Đã hủy'}) — không thể chỉnh sửa.
            </span>
          </div>
        )}

        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-xl font-semibold text-slate-900">{task.title}</h1>
          {(canUpdate || canAssign) && (
            <button
              onClick={openEditModal}
              disabled={isTerminal}
              className={`btn-secondary text-sm shrink-0 ${isTerminal ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Pencil className="h-4 w-4 mr-1" /> Chỉnh sửa
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <div className="w-48">
            <TaskProgressBar progress={task.progressPercent ?? 0} status={task.status} size="md" />
          </div>
        </div>

        {task.description && (
          <div className="prose prose-sm text-slate-700 mb-6 whitespace-pre-wrap">{task.description}</div>
        )}

        {/* Detail grid */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-400" />
            <dt className="text-slate-500">Người phụ trách:</dt>
            <dd className="font-medium text-slate-900">{getEmployeeName(task.assigneeEmployeeId)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-400" />
            <dt className="text-slate-500">Người tạo:</dt>
            <dd className="font-medium text-slate-900">{getEmployeeName(task.creatorEmployeeId)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400" />
            <dt className="text-slate-500">Phòng ban:</dt>
            <dd className="font-medium text-slate-900">{getDeptName(task.departmentId)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <dt className="text-slate-500">Hạn chót:</dt>
            <dd className="font-medium text-slate-900">
              {task.dueAt ? format(new Date(task.dueAt), 'dd/MM/yyyy HH:mm') : 'Không có hạn'}
            </dd>
          </div>
        </dl>

        <div className="mt-4 pt-4 border-t border-slate-100 flex gap-4 text-xs text-slate-400">
          <span>Ngày tạo: {format(new Date(task.createdAt), 'dd/MM/yyyy HH:mm')}</span>
          <span>Cập nhật: {format(new Date(task.updatedAt), 'dd/MM/yyyy HH:mm')}</span>
        </div>
      </div>

      {/* Status & Progress Adjustment Card */}
      {!isTerminal && canUpdate && (
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Trạng thái & Tiến độ</h2>

          {/* Quick Progress Slider / Input */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="progress-range" className="text-xs font-semibold text-slate-700">
                Điều chỉnh tiến độ (0 - {task.status === 'IN_PROGRESS' ? '99%' : '100%'}):
              </label>
              <span className="text-sm font-bold text-brand-600 tabular-nums">{progressInput}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="progress-range"
                type="range"
                min="0"
                max="99"
                value={progressInput}
                onChange={(e) => setProgressInput(parseInt(e.target.value, 10))}
                className="flex-1 accent-brand-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
                disabled={isUpdatingProgress}
              />
              <button
                type="button"
                onClick={handleSaveProgress}
                disabled={isUpdatingProgress || progressInput === (task.progressPercent ?? 0)}
                className="btn-primary text-xs py-1.5 px-3 shrink-0"
              >
                {isUpdatingProgress ? 'Đang lưu...' : 'Lưu tiến độ'}
              </button>
            </div>
            {task.status === 'TODO' && progressInput > 0 && (
              <p className="text-xs text-brand-700 mt-1">
                Lưu tiến độ &gt; 0% sẽ tự động chuyển trạng thái công việc sang &ldquo;Đang thực hiện&rdquo;.
              </p>
            )}
          </div>

          {/* Status Transitions */}
          {STATUS_TRANSITIONS[task.status].length > 0 && (
            <div>
              <span className="text-xs text-slate-500 block mb-2 font-medium">Chuyển nhanh trạng thái:</span>
              <div className="flex flex-wrap gap-2">
                {STATUS_TRANSITIONS[task.status].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(s)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      s === 'DONE'
                        ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-white'
                        : s === 'CANCELLED'
                        ? 'border-red-300 text-red-700 hover:bg-red-50 bg-white'
                        : s === 'IN_PROGRESS'
                        ? 'border-blue-300 text-blue-700 hover:bg-blue-50 bg-white'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50 bg-white'
                    }`}
                  >
                    {STATUS_LABELS[s]} {s === 'DONE' ? '(100%)' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <TaskPlanningPanel task={task} />

      {/* Grid: Comments & Attachments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Comments Section */}
        <div className="card p-5 flex flex-col h-full">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-brand-600" />
              Bình luận ({comments.length})
            </h2>
          </div>

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[160px] max-h-[380px] pr-1">
            {isLoadingComments ? (
              <div className="py-8 text-center text-slate-400 text-sm">Đang tải bình luận...</div>
            ) : comments.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">Chưa có bình luận nào.</div>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      {comment.authorDisplayName || 'Thành viên tổ chức'}
                    </span>
                    <span className="text-slate-400">
                      {format(new Date(comment.createdAt), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  {/* Safe plain text rendering */}
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-700 leading-relaxed">
                    {comment.body}
                  </p>
                </div>
              ))
            )}

            {commentCursor && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => loadComments(commentCursor)}
                  disabled={isLoadingMoreComments}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  {isLoadingMoreComments ? 'Đang tải thêm...' : 'Tải thêm bình luận'}
                </button>
              </div>
            )}
          </div>

          {/* Add comment form */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            {isTerminal ? (
              <p className="text-xs text-slate-500 italic py-1">
                Công việc đã kết thúc — không thể thêm bình luận mới.
              </p>
            ) : canUpdate ? (
              <form onSubmit={handleAddComment} className="space-y-2">
                <div className="relative">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Nhập nội dung bình luận... (tối đa 4000 ký tự)"
                    maxLength={4000}
                    rows={3}
                    disabled={isSubmittingComment}
                    className="input-field w-full text-sm py-2 px-3 resize-none"
                    aria-label="Nội dung bình luận"
                  />
                  <div className="flex items-center justify-between mt-1 text-xs text-slate-400">
                    <span>{commentText.length}/4000 ký tự</span>
                    <button
                      type="submit"
                      disabled={isSubmittingComment || !commentText.trim()}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    >
                      {isSubmittingComment ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      <span>Gửi bình luận</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <p className="text-xs text-slate-500 italic py-1">Bạn chỉ có quyền xem bình luận.</p>
            )}
          </div>
        </div>

        {/* Attachments Section */}
        <div className="card p-5 flex flex-col h-full">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-brand-600" />
              Tài liệu đính kèm ({attachments.length})
            </h2>
            {!isTerminal && canUpdate && canReadFile && (
              <button
                type="button"
                onClick={openAttachModal}
                className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
              >
                <Upload className="h-3.5 w-3.5" />
                Đính kèm tài liệu
              </button>
            )}
          </div>

          {/* Attachment list */}
          <div className="flex-1 overflow-y-auto space-y-2.5 min-h-[160px] max-h-[380px] pr-1">
            {!canReadFile ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                Bạn không có quyền xem tài liệu đính kèm.
              </div>
            ) : isLoadingAttachments ? (
              <div className="py-8 text-center text-slate-400 text-sm">Đang tải tài liệu...</div>
            ) : attachments.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">Chưa có tài liệu nào được đính kèm.</div>
            ) : (
              attachments.map((att) => (
                <div
                  key={att.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-brand-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate" title={att.file.originalFilename}>
                        {att.file.originalFilename}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span>{formatFileSize(att.file.size)}</span>
                        <span>•</span>
                        <span>{format(new Date(att.createdAt), 'dd/MM/yyyy')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadAttachment(att)}
                      disabled={isDownloadingId === att.id}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg transition-colors"
                      title="Tải xuống tệp tin"
                      aria-label={`Tải xuống ${att.file.originalFilename}`}
                    >
                      {isDownloadingId === att.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </button>
                    {!isTerminal && canUpdate && (
                      <button
                        type="button"
                        onClick={() => handleUnlinkAttachment(att.id)}
                        disabled={isUnlinkingId === att.id}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-colors"
                        title="Gỡ liên kết khỏi công việc"
                        aria-label={`Gỡ liên kết ${att.file.originalFilename}`}
                      >
                        {isUnlinkingId === att.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            {attachmentCursor && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => loadAttachments(attachmentCursor)}
                  disabled={isLoadingMoreAttachments}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  {isLoadingMoreAttachments ? 'Đang tải thêm...' : 'Tải thêm tài liệu'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Chỉnh sửa công việc" size="lg">
        {editErrors.general && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-sm text-red-700" role="alert">
            {editErrors.general}
          </div>
        )}
        <FormField label="Tiêu đề công việc" htmlFor="edit-title" required>
          <input
            id="edit-title"
            disabled={!canUpdate}
            className="input-field"
            value={editData.title}
            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
            maxLength={200}
          />
        </FormField>
        <FormField label="Mô tả" htmlFor="edit-desc">
          <textarea
            id="edit-desc"
            disabled={!canUpdate}
            className="input-field min-h-[100px]"
            value={editData.description}
            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            maxLength={10000}
          />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="Trạng thái" htmlFor="edit-status">
            <select
              id="edit-status"
              disabled={!canUpdate}
              className="input-field"
              value={editData.status}
              onChange={(e) => {
                const nextStatus = e.target.value as TaskStatus;
                let nextProgress = editData.progressPercent;
                if (nextStatus === 'DONE') nextProgress = 100;
                if (nextStatus === 'TODO') nextProgress = 0;
                setEditData({ ...editData, status: nextStatus, progressPercent: nextProgress });
              }}
            >
              {getAllowedStatuses(task.status).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Tiến độ (%)" htmlFor="edit-progress">
            <input
              id="edit-progress"
              type="number"
              min="0"
              max={editData.status === 'IN_PROGRESS' ? '99' : '100'}
              className="input-field"
              value={editData.progressPercent}
              onChange={(e) => setEditData({ ...editData, progressPercent: parseInt(e.target.value || '0', 10) })}
              disabled={!canUpdate || editData.status === 'DONE' || editData.status === 'TODO'}
            />
          </FormField>
          <FormField label="Độ ưu tiên" htmlFor="edit-priority">
            <select
              id="edit-priority"
              disabled={!canUpdate}
              className="input-field"
              value={editData.priority}
              onChange={(e) => setEditData({ ...editData, priority: e.target.value as TaskPriority })}
            >
              <option value="LOW">Thấp</option>
              <option value="MEDIUM">Trung bình</option>
              <option value="HIGH">Cao</option>
              <option value="URGENT">Khẩn cấp</option>
            </select>
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="Hạn hoàn thành" htmlFor="edit-due">
            <input
              id="edit-due"
              disabled={!canUpdate}
              type="datetime-local"
              className="input-field"
              value={editData.dueAt}
              onChange={(e) => setEditData({ ...editData, dueAt: e.target.value })}
            />
          </FormField>
          <FormField label="Phòng ban" htmlFor="edit-dept">
            <select
              id="edit-dept"
              disabled={!canUpdate}
              className="input-field"
              value={editData.departmentId}
              onChange={(e) => setEditData({ ...editData, departmentId: e.target.value })}
            >
              <option value="">Không có</option>
              {editData.departmentId && !departments.some((department) => department.id === editData.departmentId) && <option value={editData.departmentId}>Phòng ban hiện tại</option>}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Người phụ trách" htmlFor="edit-assignee" hint={canAssign && !canReadEmp ? 'Cần quyền xem nhân sự để chọn người khác.' : undefined}>
            <select
              id="edit-assignee"
              disabled={!canAssign}
              className="input-field"
              value={editData.assigneeEmployeeId}
              onChange={(e) => setEditData({ ...editData, assigneeEmployeeId: e.target.value })}
            >
              <option value="">Chưa phân công</option>
              {editData.assigneeEmployeeId && !employees.some((employee) => employee.id === editData.assigneeEmployeeId) && <option value={editData.assigneeEmployeeId}>Người phụ trách hiện tại</option>}
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayName}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setEditOpen(false)} className="btn-secondary" disabled={isSaving}>
            Hủy
          </button>
          <button onClick={handleEditSave} className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </Modal>

      {/* Attach File Modal */}
      <Modal
        open={attachModalOpen}
        onClose={() => setAttachModalOpen(false)}
        title="Đính kèm tài liệu vào công việc"
        size="lg"
      >
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setAttachTab('select')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                attachTab === 'select'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Chọn tài liệu có sẵn
            </button>
            {canUploadFile && (
              <button
                type="button"
                onClick={() => setAttachTab('upload')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  attachTab === 'upload'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Tải tệp mới lên
              </button>
            )}
          </div>

          {attachTab === 'select' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Chọn một tài liệu dùng chung từ kho lưu trữ của tổ chức để đính kèm vào công việc này:
              </p>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-100">
                {isLoadingExistingFiles ? (
                  <div className="p-4 text-center text-xs text-slate-400">Đang tải danh sách tài liệu...</div>
                ) : existingFiles.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">Không có tài liệu nào khả dụng.</div>
                ) : (
                  existingFiles.map((f) => (
                    <label
                      key={f.id}
                      className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-slate-50 transition-colors text-sm ${
                        selectedFileId === f.id ? 'bg-brand-50/50' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="selected-file"
                        value={f.id}
                        checked={selectedFileId === f.id}
                        onChange={() => setSelectedFileId(f.id)}
                        className="accent-brand-600 h-4 w-4"
                      />
                      <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-800 font-medium truncate">{f.originalFilename}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(f.size)}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              {existingFilesCursor && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => loadExistingFiles(existingFilesCursor)}
                    disabled={isLoadingExistingFiles}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    Tải thêm tài liệu có sẵn
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Tệp được lưu vào kho tài liệu và đính kèm vào công việc.
                này. Định dạng cho phép: PDF, PNG, JPEG (tối đa 5 MB).
              </p>
              <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center">
                <input
                  type="file"
                  id="task-file-upload-input"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setUploadSelectedFile(file);
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="task-file-upload-input"
                  className="cursor-pointer inline-flex flex-col items-center gap-1.5"
                >
                  <Upload className="h-6 w-6 text-slate-400" />
                  <span className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    {uploadSelectedFile ? uploadSelectedFile.name : 'Chọn tệp từ thiết bị'}
                  </span>
                  {uploadSelectedFile && (
                    <span className="text-xs text-slate-400">{formatFileSize(uploadSelectedFile.size)}</span>
                  )}
                </label>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setAttachModalOpen(false)}
              className="btn-secondary text-sm"
              disabled={isAttaching}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handlePerformAttach}
              className="btn-primary text-sm flex items-center gap-1.5"
              disabled={isAttaching || (attachTab === 'select' ? !selectedFileId : !uploadSelectedFile)}
            >
              {isAttaching && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{attachTab === 'select' ? 'Đính kèm' : 'Tải lên & Đính kèm'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

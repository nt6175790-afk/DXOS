// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, User, AlertCircle, CheckCircle2, Circle, ArrowRightCircle, XCircle } from 'lucide-react';
import { listTasks, updateTask } from '@/api/tasks';
import { isApiError } from '@/api/client';
import type { Task, TaskListParams, TaskStatus } from '@/api/types';
import { useCursorList } from '@/hooks/useCursorList';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { TaskProgressBar } from '@/components/ui/TaskProgressBar';

const statuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

const labels: Record<TaskStatus, string> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang thực hiện',
  DONE: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

const statusIcons: Record<TaskStatus, typeof Circle> = {
  TODO: Circle,
  IN_PROGRESS: ArrowRightCircle,
  DONE: CheckCircle2,
  CANCELLED: XCircle,
};

const statusColors: Record<TaskStatus, { header: string; border: string; badge: string }> = {
  TODO: { header: 'text-slate-700', border: 'border-slate-300', badge: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { header: 'text-blue-700', border: 'border-blue-400', badge: 'bg-blue-50 text-blue-700' },
  DONE: { header: 'text-emerald-700', border: 'border-emerald-400', badge: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { header: 'text-red-700', border: 'border-red-300', badge: 'bg-red-50 text-red-700' },
};

interface Props {
  orgId: string;
  filters: TaskListParams;
  canUpdate: boolean;
  onChange: () => void;
  employeeName: (id: string | null) => string;
}

export function TaskKanban(props: Props) {
  const scope = JSON.stringify([props.orgId, props.filters]);
  return <Board key={scope} {...props} />;
}

function Board({ orgId, filters, canUpdate, onChange, employeeName }: Props) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const move = async (task: Task, status: TaskStatus) => {
    if (busy || !canUpdate || task.status === 'DONE' || task.status === 'CANCELLED' || task.status === status) return;
    setBusy(true);
    setError('');
    try {
      await updateTask(orgId, task.id, { status });
      if (!alive.current) return;
      setRevision((value) => value + 1);
      onChange();
    } catch (err) {
      if (alive.current) {
        setError(
          isApiError(err) && err.error.code === 'FORBIDDEN'
            ? 'Bạn không có quyền cập nhật công việc này.'
            : 'Không thể đổi trạng thái. Hãy tải lại để kiểm tra dữ liệu mới nhất.'
        );
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <section aria-label="Bảng Kanban" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p>Kéo thả thẻ hoặc dùng ô chuyển trạng thái để cập nhật tiến độ công việc. Mỗi cột phân trang 25 mục.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm p-3 rounded-xl bg-red-50 text-red-700 border border-red-200">
          {error}{' '}
          <button
            className="underline font-semibold ml-1"
            onClick={() => {
              setError('');
              setRevision((value) => value + 1);
            }}
          >
            Tải lại bảng
          </button>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {statuses
          .filter((status) => !filters.status || filters.status === status)
          .map((status) => (
            <Column
              key={`${status}:${revision}`}
              orgId={orgId}
              status={status}
              filters={filters}
              canUpdate={canUpdate}
              busy={busy}
              onMove={move}
              employeeName={employeeName}
              draggedTaskId={draggedTaskId}
              setDraggedTaskId={setDraggedTaskId}
            />
          ))}
      </div>
    </section>
  );
}

function Column({
  orgId,
  status,
  filters,
  canUpdate,
  busy,
  onMove,
  employeeName,
  draggedTaskId,
  setDraggedTaskId,
}: Omit<Props, 'onChange'> & {
  status: TaskStatus;
  busy: boolean;
  onMove: (task: Task, status: TaskStatus) => Promise<void>;
  draggedTaskId: string | null;
  setDraggedTaskId: (id: string | null) => void;
}) {
  const { priority, departmentId, assigneeEmployeeId } = filters;
  const load = useCallback(
    (after?: string) =>
      listTasks(orgId, { priority, departmentId, assigneeEmployeeId, status, limit: 25, after }),
    [orgId, status, priority, departmentId, assigneeEmployeeId]
  );
  const page = useCursorList(`${orgId}:${status}`, load);
  const terminal = status === 'DONE' || status === 'CANCELLED';
  const [isDragOver, setIsDragOver] = useState(false);

  const Icon = statusIcons[status];
  const color = statusColors[status];

  const handleDragOver = (e: React.DragEvent) => {
    if (!canUpdate) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!canUpdate) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.taskId && data.currentStatus !== status) {
        const found = page.items.find((t) => t.id === data.taskId);
        if (found) {
          void onMove(found, status);
        } else {
          void onMove(
            {
              id: data.taskId,
              status: data.currentStatus,
              title: data.title || '',
              progressPercent: data.progressPercent ?? 0,
              priority: data.priority || 'MEDIUM',
              description: null,
              dueAt: null,
              organizationId: orgId,
              departmentId: null,
              assigneeEmployeeId: null,
              creatorEmployeeId: '',
              createdAt: '',
              updatedAt: '',
            },
            status
          );
        }
      }
    } catch {
      // Ignored malformed drag data
    } finally {
      setDraggedTaskId(null);
    }
  };

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 bg-slate-50/70 p-3.5 min-w-0 flex flex-col min-h-[400px] ${
        isDragOver ? 'border-2 border-dashed border-brand-500 bg-brand-50/30' : 'border-slate-200/90'
      }`}
      role="region"
      aria-label={`Cột ${labels[status]}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color.header}`} />
          <h2 className="text-sm font-bold text-slate-800 tracking-tight">{labels[status]}</h2>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>
          {page.items.length}
          {page.nextCursor ? '+' : ''}
        </span>
      </div>

      {page.error ? (
        <p role="alert" className="text-sm text-red-700 mb-3 p-2.5 bg-red-50 rounded-xl border border-red-200">
          {isApiError(page.error) && page.error.error.code === 'FORBIDDEN'
            ? 'Không có quyền xem công việc.'
            : 'Không tải được cột này.'}{' '}
          <button className="underline font-semibold ml-1" onClick={page.refresh}>
            Thử lại
          </button>
        </p>
      ) : null}

      {!page.loading && !page.error && !page.items.length && (
        <div className="py-12 text-center text-slate-400 space-y-1">
          <p className="text-xs font-medium">Chưa có công việc.</p>
          {canUpdate && !terminal && <p className="text-[11px] text-slate-400">Kéo thẻ vào đây để chuyển</p>}
        </div>
      )}

      {/* Cards List */}
      <ul className="space-y-3 flex-1">
        {page.items.map((task) => {
          const overdue = !terminal && task.dueAt && new Date(task.dueAt).getTime() < Date.now();
          const isBeingDragged = draggedTaskId === task.id;

          return (
            <li
              key={task.id}
              draggable={canUpdate && !terminal}
              onDragStart={(e) => {
                setDraggedTaskId(task.id);
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({
                    taskId: task.id,
                    currentStatus: task.status,
                    title: task.title,
                    priority: task.priority,
                    progressPercent: task.progressPercent,
                  })
                );
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDraggedTaskId(null)}
              className={`card p-3.5 space-y-3 transition-all duration-150 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 ${
                canUpdate && !terminal ? 'cursor-grab active:cursor-grabbing' : ''
              } ${isBeingDragged ? 'opacity-40 scale-95 border-dashed border-brand-400' : ''}`}
            >
              {/* Header: Priority & Overdue */}
              <div className="flex items-center justify-between gap-1">
                <PriorityBadge priority={task.priority} />
                {overdue && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                    <AlertCircle className="h-3 w-3" />
                    Quá hạn
                  </span>
                )}
              </div>

              {/* Title Link */}
              <Link
                className="block text-sm font-semibold text-slate-900 hover:text-brand-600 line-clamp-2 transition-colors"
                to={`/tasks/${task.id}`}
              >
                {task.title}
              </Link>

              {/* Progress Bar */}
              <TaskProgressBar progress={task.progressPercent} status={task.status} size="sm" />

              {/* Meta: Assignee & Deadline */}
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5 text-xs text-slate-500">
                <div className="flex items-center gap-1.5 truncate">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {task.assigneeEmployeeId ? employeeName(task.assigneeEmployeeId) : 'Chưa phân công'}
                  </span>
                </div>
                {task.dueAt && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{new Date(task.dueAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                )}
              </div>

              {/* Accessible Status Transition Dropdown */}
              {canUpdate && !terminal && (
                <div className="pt-1">
                  <select
                    className="input-field text-xs py-1 px-2 h-auto rounded-lg bg-slate-50 text-slate-700 border-slate-200 hover:bg-white"
                    aria-label={`Chuyển trạng thái ${task.title}`}
                    value={status}
                    disabled={busy}
                    onChange={(event) => void onMove(task, event.target.value as TaskStatus)}
                  >
                    {statuses.map((value) => (
                      <option key={value} value={value}>
                        {labels[value]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {page.loading && <p role="status" className="text-xs text-slate-400 py-3 text-center">Đang tải công việc...</p>}

      {page.nextCursor && (
        <button
          className="btn-secondary w-full text-xs py-2 mt-3 font-medium rounded-xl"
          disabled={page.loading}
          onClick={page.loadMore}
        >
          Tải thêm {labels[status].toLowerCase()}
        </button>
      )}
    </div>
  );
}

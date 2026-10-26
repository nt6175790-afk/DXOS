// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { clsx } from 'clsx';
import type { TaskStatus } from '@/api/types';

const statusConfig: Record<TaskStatus, { label: string; classes: string }> = {
  TODO: { label: 'Cần làm', classes: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  IN_PROGRESS: { label: 'Đang thực hiện', classes: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  DONE: { label: 'Hoàn thành', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  CANCELLED: { label: 'Đã hủy', classes: 'bg-red-50 text-red-700 ring-red-600/20' },
};

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1',
        config.classes
      )}
    >
      <span className="sr-only">Trạng thái: </span>
      {config.label}
    </span>
  );
}

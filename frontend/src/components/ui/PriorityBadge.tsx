// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { clsx } from 'clsx';
import type { TaskPriority } from '@/api/types';

const priorityConfig: Record<TaskPriority, { label: string; classes: string }> = {
  LOW: { label: 'Thấp', classes: 'bg-slate-100 text-slate-600' },
  MEDIUM: { label: 'Trung bình', classes: 'bg-blue-50 text-blue-700' },
  HIGH: { label: 'Cao', classes: 'bg-orange-50 text-orange-700' },
  URGENT: { label: 'Khẩn cấp', classes: 'bg-red-50 text-red-700' },
};

interface PriorityBadgeProps {
  priority: TaskPriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', config.classes)}>
      <span className="sr-only">Độ ưu tiên: </span>
      {config.label}
    </span>
  );
}

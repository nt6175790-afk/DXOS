// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { TaskStatus } from '@/api/types';

interface TaskProgressBarProps {
  progress?: number | null;
  status?: TaskStatus;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

export function TaskProgressBar({
  progress = 0,
  status,
  size = 'md',
  showLabel = true,
  className = '',
}: TaskProgressBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round(progress ?? 0)));

  const getBarColor = () => {
    if (status === 'DONE' || percent === 100) return 'bg-emerald-500';
    if (status === 'CANCELLED') return 'bg-slate-400';
    if (percent > 0) return 'bg-brand-600';
    return 'bg-slate-300';
  };

  const heightClass = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`flex-1 bg-slate-200 rounded-full overflow-hidden ${heightClass}`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Tiến độ ${percent}%`}
      >
        <div
          className={`${heightClass} rounded-full transition-all duration-300 ${getBarColor()}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-slate-600 tabular-nums shrink-0 min-w-[2.5rem] text-right">
          {percent}%
        </span>
      )}
    </div>
  );
}

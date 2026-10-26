// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { clsx } from 'clsx';

interface StatusBadgeProps {
  status: 'ACTIVE' | 'INACTIVE';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        status === 'ACTIVE'
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
          : 'bg-slate-100 text-slate-600 ring-1 ring-slate-500/20'
      )}
    >
      <span
        className={clsx(
          'mr-1.5 h-1.5 w-1.5 rounded-full',
          status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'
        )}
        aria-hidden="true"
      />
      <span className="sr-only">Trạng thái: </span>
      {status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng hoạt động'}
    </span>
  );
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200/80 ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-5 space-y-4 animate-pulse" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="h-4 bg-slate-200 rounded w-1/3" />
        <div className="h-6 w-16 bg-slate-200 rounded-full" />
      </div>
      <div className="h-3 bg-slate-200 rounded w-2/3" />
      <div className="h-2 bg-slate-200 rounded w-full" />
      <div className="flex items-center justify-between pt-2">
        <div className="h-4 bg-slate-200 rounded w-1/4" />
        <div className="h-8 w-20 bg-slate-200 rounded" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden animate-pulse" aria-hidden="true">
      <div className="border-b border-slate-200 bg-slate-50 p-4 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 bg-slate-200 rounded flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="p-4 flex gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="h-4 bg-slate-200/60 rounded flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

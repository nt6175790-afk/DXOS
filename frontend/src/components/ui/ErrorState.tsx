// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { AlertTriangle } from 'lucide-react';
import type { ApiError } from '@/api/types';

interface ErrorStateProps {
  error?: ApiError | null;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, message, onRetry }: ErrorStateProps) {
  const displayMessage = message || error?.error?.message || 'Đã xảy ra lỗi không xác định.';
  const requestId = error?.error?.requestId;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-red-50 p-4 mb-4">
        <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Đã có lỗi xảy ra</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-4">{displayMessage}</p>
      {error?.error?.requestId && (
        <p className="text-xs text-slate-400 mt-2 font-mono">Mã yêu cầu: {error.error.requestId}</p>
      )}
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary text-sm">
          Thử lại
        </button>
      )}
    </div>
  );
}

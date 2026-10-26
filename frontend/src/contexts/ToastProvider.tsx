// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ToastContext, ToastType, Toast, ToastContextValue, useToast } from './toast-context';
import React, { useState, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

const typeStyles: Record<ToastType, string> = {
  success: 'border-l-emerald-500 bg-emerald-50 text-emerald-800',
  error: 'border-l-red-500 bg-red-50 text-red-800',
  info: 'border-l-blue-500 bg-blue-50 text-blue-800',
  warning: 'border-l-amber-500 bg-amber-50 text-amber-800',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
        aria-live="polite"
        aria-label="Thông báo hệ thống"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={clsx(
              'flex items-start gap-3 px-4 py-3 border-l-4 rounded-lg shadow-lg text-sm animate-in slide-in-from-right',
              typeStyles[toast.type]
            )}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-current opacity-60 hover:opacity-100 shrink-0"
              aria-label="Đóng thông báo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

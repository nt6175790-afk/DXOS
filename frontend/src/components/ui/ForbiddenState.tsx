// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ShieldX } from 'lucide-react';

interface ForbiddenStateProps {
  message?: string;
}

export function ForbiddenState({ message = 'Bạn không có quyền truy cập vào tài nguyên này.' }: ForbiddenStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center py-16 px-6 text-center" role="status">
      <div className="rounded-full bg-amber-50 p-4 mb-4">
        <ShieldX className="h-8 w-8 text-amber-500" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Truy cập bị từ chối</h3>
      <p className="text-sm text-slate-500 max-w-sm">{message}</p>
      <p className="text-xs text-slate-500 max-w-sm mt-3">Kiểm tra tổ chức đang chọn hoặc liên hệ quản trị viên để được cấp quyền phù hợp.</p>
    </div>
  );
}

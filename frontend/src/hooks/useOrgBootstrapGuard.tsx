// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { AlertTriangle, Building2, RefreshCw } from 'lucide-react';

/**
 * Hook that handles the organization bootstrap guard logic.
 *
 * Returns `null` when currentOrg is available (page can render normally).
 * Returns a ReactElement when the page should show a loading/error/empty state.
 *
 * Replaces the broken `if (!currentOrg) return <LoadingState .../>` pattern
 * that could not distinguish between loading, error, and empty-org states.
 */
export function useOrgBootstrapGuard(): ReactElement | null {
  const { currentOrg, organizations, isLoading, error, refreshOrganizations } = useOrganization();

  // 1. Still loading organizations
  if (isLoading) {
    return <LoadingState message="Đang tải thông tin tổ chức..." />;
  }

  // 2. Loading failed — show error with retry
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4" role="alert">
        <div className="rounded-full bg-red-50 p-3">
          <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-900">
            Không thể tải thông tin tổ chức
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {error.error?.message || 'Đã xảy ra lỗi không mong muốn.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refreshOrganizations()}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Thử lại
        </button>
      </div>
    );
  }

  // 3. No organizations — user has no orgs
  if (organizations.length === 0 && !currentOrg) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4" role="status">
        <div className="rounded-full bg-slate-100 p-3">
          <Building2 className="h-8 w-8 text-slate-400" aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-900">
            Chưa có tổ chức nào
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Bạn chưa thuộc tổ chức nào. Hãy liên hệ quản trị viên để được mời vào tổ chức.
          </p>
        </div>
      </div>
    );
  }

  // 4. currentOrg is available — page can render normally
  if (currentOrg) {
    return null;
  }

  // 5. Edge case: organizations exist but currentOrg not yet selected
  // This shouldn't happen normally but guard defensively
  return <LoadingState message="Đang tải thông tin tổ chức..." />;
}

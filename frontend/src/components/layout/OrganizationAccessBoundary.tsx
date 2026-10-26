// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { LoadingState } from '@/components/ui/LoadingState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { ErrorState } from '@/components/ui/ErrorState';
import { canOpenRoute } from './navigation';

export function OrganizationAccessBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const permission = usePermission();
  const guard = useOrgBootstrapGuard();
  if (guard) return guard;
  if (permission.isLoading) return <LoadingState message="Đang kiểm tra quyền truy cập…" />;
  if (permission.error?.error.code === 'FORBIDDEN') return <ForbiddenState />;
  if (permission.error) return <ErrorState error={permission.error} onRetry={permission.refreshPermissions} />;
  if (!canOpenRoute(pathname, permission.hasPermission)) return <ForbiddenState />;
  return <>{children}</>;
}

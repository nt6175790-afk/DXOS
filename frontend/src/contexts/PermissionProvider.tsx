// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PermissionContext } from './permission-context';
import type { Permission, ApiError } from '@/api/types';
import { getPermissions } from '@/api/permissions';
import { useOrganization } from './OrganizationContext';
import { useAuth } from './AuthContext';
import { isApiError } from '@/api/client';

const EMPTY: Permission[] = [];
type Snapshot = { scope: string | null; permissions: Permission[]; loading: boolean; error: ApiError | null };

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const { currentOrg } = useOrganization();
  const { isAuthenticated, user } = useAuth();
  const orgId = currentOrg?.id;
  const scope = isAuthenticated && orgId ? JSON.stringify([user?.id, orgId]) : null;
  const [snapshot, setSnapshot] = useState<Snapshot>({ scope: null, permissions: EMPTY, loading: false, error: null });
  const request = useRef(0);

  const loadPermissions = useCallback(async (organizationId: string, requestedScope: string) => {
    const id = ++request.current;
    setSnapshot({ scope: requestedScope, permissions: EMPTY, loading: true, error: null });
    try {
      const response = await getPermissions(organizationId);
      if (id !== request.current) return;
      if (response.organizationId !== organizationId) {
        setSnapshot({ scope: requestedScope, permissions: EMPTY, loading: false, error: {
          success: false, error: { code: 'FORBIDDEN', message: 'Quyền truy cập không khớp tổ chức hiện tại.', requestId: '' },
        } });
        return;
      }
      setSnapshot({ scope: requestedScope, permissions: response.permissions, loading: false, error: null });
    } catch (err) {
      if (id !== request.current) return;
      setSnapshot({ scope: requestedScope, permissions: EMPTY, loading: false, error: isApiError(err) ? err : {
        success: false, error: { code: 'NETWORK_ERROR', message: 'Không thể tải quyền truy cập. Vui lòng thử lại.', requestId: '' },
      } });
    }
  }, []);

  useEffect(() => {
    if (scope && orgId) void loadPermissions(orgId, scope);
    // Each request has its own generation, including A -> B -> A and logout/login.
    return () => { request.current += 1; };
  }, [scope, orgId, loadPermissions]);

  // Scope during render so another actor/tenant cannot inherit the previous frame.
  const matches = scope !== null && snapshot.scope === scope;
  const permissions = matches && !snapshot.loading ? snapshot.permissions : EMPTY;
  const hasPermission = useCallback((permission: Permission) => permissions.includes(permission), [permissions]);
  const hasAnyPermission = useCallback((...perms: Permission[]) => perms.some(p => permissions.includes(p)), [permissions]);
  const refreshPermissions = useCallback(async () => {
    if (scope && orgId) await loadPermissions(orgId, scope);
  }, [scope, orgId, loadPermissions]);

  return <PermissionContext.Provider value={{ permissions, hasPermission, hasAnyPermission,
    isLoading: scope !== null && (!matches || snapshot.loading), error: matches ? snapshot.error : null, refreshPermissions }}>
    {children}
  </PermissionContext.Provider>;
}

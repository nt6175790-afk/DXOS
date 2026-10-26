// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { OrganizationContext, OrganizationContextValue, useOrganization } from './organization-context';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Organization, ApiError } from '@/api/types';
import { listOrganizations } from '@/api/organizations';
import { useAuth } from './AuthContext';
import { clearPermissionCache } from '@/hooks/usePermission';
import { isApiError } from '@/api/client';

const ORG_STORAGE_KEY = 'dx_current_org_id';

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const actor = isAuthenticated ? user?.id ?? 'authenticated' : null;
  const [owner, setOwner] = useState<string | null>(null);
  const request = useRef(0);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const loadOrganizations = useCallback(async () => {
    if (!actor) return;
    const id = ++request.current;
    setOwner(actor);
    setOrganizations([]);
    setCurrentOrgState(null);
    setIsLoading(true);
    setError(null);
    try {
      const response = await listOrganizations({ limit: 100 });
      if (id !== request.current) return;
      setOrganizations(response.items);

      // Restore previously selected org or auto-select first
      const savedOrgId = localStorage.getItem(ORG_STORAGE_KEY);
      const savedOrg = response.items.find((o) => o.id === savedOrgId);
      if (savedOrg) {
        setCurrentOrgState(savedOrg);
      } else if (response.items.length > 0) {
        setCurrentOrgState(response.items[0]);
        localStorage.setItem(ORG_STORAGE_KEY, response.items[0].id);
      } else {
        setCurrentOrgState(null);
        localStorage.removeItem(ORG_STORAGE_KEY);
      }
    } catch (err) {
      if (id !== request.current) return;
      if (isApiError(err)) {
        setError(err);
      } else {
        setError({
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Không thể tải danh sách tổ chức. Vui lòng kiểm tra kết nối.',
            requestId: '',
          },
        });
      }
    } finally {
      if (id === request.current) setIsLoading(false);
    }
  }, [actor]);

  useEffect(() => {
    if (isAuthenticated) {
      loadOrganizations();
    } else {
      setOwner(null);
      setOrganizations([]);
      setCurrentOrgState(null);
      setError(null);
      setIsLoading(false);
    }
    return () => { request.current += 1; };
  }, [isAuthenticated, loadOrganizations]);

  const setCurrentOrg = useCallback((org: Organization) => {
    if (!organizations.some(item => item.id === org.id)) return;
    clearPermissionCache();
    setCurrentOrgState(org);
    localStorage.setItem(ORG_STORAGE_KEY, org.id);
  }, [organizations]);

  return (
    <OrganizationContext.Provider
      value={{
        currentOrg: actor && owner === actor ? currentOrg : null,
        organizations: actor && owner === actor ? organizations : [],
        isLoading: !!actor && (owner !== actor || isLoading),
        error: owner === actor ? error : null,
        setCurrentOrg,
        refreshOrganizations: loadOrganizations,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

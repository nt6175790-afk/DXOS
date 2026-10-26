// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { isApiError } from '@/api/client';
import type { ApiError } from '@/api/types';

/** A response belongs to its initiating organization, including during the render before an effect runs. */
export function useOrganizationResource<T>(load: (organizationId: string) => Promise<T>) {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ orgId: string; revision: number; data: T | null; error: ApiError | null } | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    load(orgId).then((data) => {
      if (active) setState({ orgId, revision, data, error: null });
    }).catch((error: unknown) => {
      if (active) setState({ orgId, revision, data: null, error: isApiError(error) ? error : {
        success: false, error: { code: 'NETWORK_ERROR', message: 'Không thể tải dữ liệu. Vui lòng thử lại.', requestId: '' },
      } });
    });
    return () => { active = false; };
  }, [orgId, revision, load]);
  const current = state?.orgId === orgId && state?.revision === revision ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? null, isLoading: !!orgId && !current, refresh };
}

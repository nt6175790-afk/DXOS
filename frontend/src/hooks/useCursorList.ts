// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaginatedResponse } from '@/api/types';

/** Pages are bound to a caller-defined organization/query scope. Stale requests cannot replace newer pages. */
export function useCursorList<T extends { id: string }>(scope: string, load: (after?: string) => Promise<PaginatedResponse<T>>) {
  const request = useRef(0);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ scope: string; items: T[]; nextCursor: string | null; loading: boolean; error: unknown }>({
    scope, items: [], nextCursor: null, loading: true, error: null,
  });
  const fetchPage = useCallback(async (after?: string) => {
    const id = ++request.current;
    setState((previous) => ({ scope, items: after && previous.scope === scope ? previous.items : [],
      nextCursor: after ?? null, loading: true, error: null }));
    try {
      const result = await load(after);
      if (id !== request.current) return;
      setState((previous) => ({ scope, items: after ? [...previous.items, ...result.items.filter((item) => !previous.items.some((old) => old.id === item.id))] : result.items,
        nextCursor: result.nextCursor, loading: false, error: null }));
    } catch (error: unknown) {
      if (id === request.current) setState((previous) => ({ ...previous, loading: false, error }));
    }
  }, [scope, load]);
  useEffect(() => { const generation = request; void fetchPage(); return () => { generation.current++; }; }, [fetchPage, revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const current = state.scope === scope ? state : { items: [], nextCursor: null, loading: true, error: null };
  return { ...current, refresh, loadMore: () => { if (current.nextCursor && !current.loading) void fetchPage(current.nextCursor); } };
}

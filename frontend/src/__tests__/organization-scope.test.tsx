// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationProvider } from '@/contexts/OrganizationProvider';
import { useOrganization } from '@/contexts/organization-context';
import type { Organization } from '@/api/types';

const state = vi.hoisted(() => ({ actor: 'u1', authenticated: true, list: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, isAuthenticated: state.authenticated }) }));
vi.mock('@/api/organizations', () => ({ listOrganizations: state.list }));
const org = (id: string): Organization => ({ id, name: id, slug: id, status: 'ACTIVE', createdAt: '', updatedAt: '' });
function deferred() { let resolve!: (v: { items: Organization[]; nextCursor: null }) => void; const promise = new Promise<{items: Organization[]; nextCursor:null}>(r => { resolve = r; }); return { promise, resolve }; }

describe('Organization actor isolation', () => {
  beforeEach(() => { state.actor = 'u1'; state.authenticated = true; state.list.mockReset(); localStorage.clear(); });
  it('ignores a previous actor organization list that arrives late', async () => {
    const first = deferred(), next = deferred(); state.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    const view = renderHook(() => useOrganization(), { wrapper: OrganizationProvider });
    state.actor = 'u2'; view.rerender(); expect(view.result.current.currentOrg).toBeNull();
    await act(async () => { next.resolve({ items: [org('new')], nextCursor: null }); first.resolve({items:[org('private-old')],nextCursor:null}); });
    expect(view.result.current.currentOrg?.id).toBe('new'); expect(view.result.current.organizations.map(x => x.id)).toEqual(['new']);
  });
  it('does not restore an organization when its request resolves after logout', async () => {
    const first = deferred(); state.list.mockReturnValue(first.promise);
    const view = renderHook(() => useOrganization(), { wrapper: OrganizationProvider });
    state.authenticated = false; view.rerender();
    await act(async () => { first.resolve({items:[org('private')],nextCursor:null}); });
    expect(view.result.current.organizations).toEqual([]); expect(view.result.current.currentOrg).toBeNull();
  });
  it('does not accept a selection outside the actor organization list', async () => {
    state.list.mockResolvedValue({items:[org('mine')],nextCursor:null});
    const view = renderHook(() => useOrganization(), { wrapper: OrganizationProvider });
    await waitFor(() => expect(view.result.current.currentOrg?.id).toBe('mine'));
    act(() => view.result.current.setCurrentOrg(org('foreign')));
    expect(view.result.current.currentOrg?.id).toBe('mine');
  });
});

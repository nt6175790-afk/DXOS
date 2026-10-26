// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionProvider } from '@/contexts/PermissionProvider';
import { usePermissionContext } from '@/contexts/permission-context';
import type { PermissionsResponse } from '@/api/types';

const state = vi.hoisted(() => ({ org: 'a', actor: 'u1', authenticated: true, get: vi.fn() }));
vi.mock('@/api/permissions', () => ({ getPermissions: state.get }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: state.authenticated, user: { id: state.actor } }) }));
vi.mock('@/contexts/OrganizationContext', () => ({ useOrganization: () => ({ currentOrg: { id: state.org } }) }));
function deferred() { let resolve!: (value: PermissionsResponse) => void; const promise = new Promise<PermissionsResponse>(r => { resolve = r; }); return { promise, resolve }; }
const grant = (organizationId: string, privileged = false): PermissionsResponse => ({ organizationId, permissions: privileged ? ['role:assign', 'task:create'] : ['task:read'] });
const mount = () => renderHook(() => usePermissionContext(), { wrapper: PermissionProvider });

describe('Permission scope request isolation', () => {
  beforeEach(() => { state.org = 'a'; state.actor = 'u1'; state.authenticated = true; state.get.mockReset(); });
  it('rejects permission responses for a different organization', async () => {
    state.get.mockResolvedValue(grant('foreign', true)); const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.permissions).toEqual([]); expect(result.current.error?.error.code).toBe('FORBIDDEN');
  });
  it('does not accept the first A response after switching A -> B -> A', async () => {
    const first = deferred(), b = deferred(), latest = deferred();
    state.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(latest.promise);
    const view = mount(); state.org = 'b'; view.rerender(); state.org = 'a'; view.rerender();
    await act(async () => { latest.resolve(grant('a')); });
    expect(view.result.current.permissions).toEqual(['task:read']);
    await act(async () => { first.resolve(grant('a', true)); b.resolve(grant('b', true)); });
    expect(view.result.current.permissions).toEqual(['task:read']); expect(view.result.current.hasPermission('role:assign')).toBe(false);
  });
  it('clears grants immediately when the actor changes in the same organization', async () => {
    const next = deferred(); state.get.mockResolvedValueOnce(grant('a', true)).mockReturnValueOnce(next.promise);
    const view = mount(); await waitFor(() => expect(view.result.current.hasPermission('role:assign')).toBe(true));
    state.actor = 'u2'; view.rerender(); expect(view.result.current.permissions).toEqual([]);
    await act(async () => { next.resolve(grant('a')); }); expect(view.result.current.permissions).toEqual(['task:read']);
  });
  it('ignores a request that resolves after logout', async () => {
    const response = deferred(); state.get.mockReturnValue(response.promise); const view = mount();
    state.authenticated = false; view.rerender();
    await act(async () => { response.resolve(grant('a', true)); });
    expect(view.result.current.permissions).toEqual([]); expect(view.result.current.isLoading).toBe(false);
  });
  it('uses the latest refresh and fails closed while loading', async () => {
    const old = deferred(), latest = deferred(); state.get.mockResolvedValueOnce(grant('a', true)).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const view = mount(); await waitFor(() => expect(view.result.current.hasPermission('role:assign')).toBe(true));
    act(() => { void view.result.current.refreshPermissions(); }); expect(view.result.current.permissions).toEqual([]);
    act(() => { void view.result.current.refreshPermissions(); });
    await act(async () => { latest.resolve(grant('a')); old.resolve(grant('a', true)); });
    expect(view.result.current.permissions).toEqual(['task:read']);
  });
});

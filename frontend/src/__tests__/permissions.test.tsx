// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React, { useState } from 'react';
import { PermissionProvider, usePermissionContext } from '@/contexts/PermissionContext';
import * as permissionsApi from '@/api/permissions';
import * as authContextModule from '@/contexts/AuthContext';
import * as orgContextModule from '@/contexts/OrganizationContext';
import type { Organization, CurrentUser } from '@/api/types';

// Unmock @/hooks/usePermission so we test the REAL PermissionContext implementation
vi.unmock('@/hooks/usePermission');

describe('DXOS-FRONTEND-003: Permission Discovery Integration', () => {
  const mockOrgA: Organization = {
    id: 'org-aaa',
    name: 'Organization Alpha',
    slug: 'org-alpha',
    status: 'ACTIVE',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockOrgB: Organization = {
    id: 'org-bbb',
    name: 'Organization Beta',
    slug: 'org-beta',
    status: 'ACTIVE',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockUser: CurrentUser = {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    accountStatus: 'ACTIVE',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully loads effective permissions for the selected organization', async () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      loginSso: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(orgContextModule, 'useOrganization').mockReturnValue({
      currentOrg: mockOrgA,
      organizations: [mockOrgA],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    });

    vi.spyOn(permissionsApi, 'getPermissions').mockResolvedValue({
      organizationId: 'org-aaa',
      permissions: ['organization:read', 'task:read', 'task:create'],
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PermissionProvider>{children}</PermissionProvider>
    );

    const { result } = renderHook(() => usePermissionContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.permissions).toEqual([
        'organization:read',
        'task:read',
        'task:create',
      ]);
    });

    expect(result.current.hasPermission('task:read')).toBe(true);
    expect(result.current.hasPermission('task:create')).toBe(true);
    expect(result.current.hasPermission('task:update')).toBe(false);
    expect(result.current.hasPermission('department:read')).toBe(false);
  });

  it('resets permissions immediately on organization switch and prevents permission leakage', async () => {
    const getPermissionsSpy = vi.spyOn(permissionsApi, 'getPermissions');

    // Org A has task:create; Org B has ONLY organization:read
    getPermissionsSpy.mockImplementation(async (orgId: string) => {
      if (orgId === 'org-aaa') {
        return {
          organizationId: 'org-aaa',
          permissions: ['organization:read', 'task:read', 'task:create', 'task:update'],
        };
      }
      if (orgId === 'org-bbb') {
        return {
          organizationId: 'org-bbb',
          permissions: ['organization:read'],
        };
      }
      return { organizationId: orgId, permissions: [] };
    });

    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      loginSso: vi.fn(),
      logout: vi.fn(),
    });

    let switchOrg: (org: Organization) => void = () => {};

    // Dynamic Org Context hook spy to allow switching
    const orgSpy = vi.spyOn(orgContextModule, 'useOrganization');
    let currentActiveOrg: Organization | null = mockOrgA;

    orgSpy.mockImplementation(() => ({
      currentOrg: currentActiveOrg,
      organizations: [mockOrgA, mockOrgB],
      isLoading: false,
      setCurrentOrg: (org: Organization) => {
        currentActiveOrg = org;
      },
      refreshOrganizations: vi.fn(),
    }));

    function DynamicOrgWrapper({ children }: { children: React.ReactNode }) {
      const [org, setOrg] = useState<Organization | null>(mockOrgA);
      switchOrg = (newOrg) => {
        currentActiveOrg = newOrg;
        setOrg(newOrg);
      };

      orgSpy.mockImplementation(() => ({
        currentOrg: org,
        organizations: [mockOrgA, mockOrgB],
        isLoading: false,
        setCurrentOrg: switchOrg,
        refreshOrganizations: vi.fn(),
      }));

      return <PermissionProvider>{children}</PermissionProvider>;
    }

    const { result } = renderHook(() => usePermissionContext(), { wrapper: DynamicOrgWrapper });

    // Wait for Org A permissions
    await waitFor(() => {
      expect(result.current.hasPermission('task:create')).toBe(true);
    });

    // Switch to Org B
    act(() => {
      switchOrg(mockOrgB);
    });

    // Verify Org B permissions: task:create MUST NOT leak!
    await waitFor(() => {
      expect(result.current.permissions).toEqual(['organization:read']);
      expect(result.current.hasPermission('task:create')).toBe(false);
      expect(result.current.hasPermission('task:update')).toBe(false);
      expect(result.current.hasPermission('organization:read')).toBe(true);
    });
  });

  it('handles 403 Forbidden safely without granting permissions', async () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      loginSso: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(orgContextModule, 'useOrganization').mockReturnValue({
      currentOrg: mockOrgA,
      organizations: [mockOrgA],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    });

    vi.spyOn(permissionsApi, 'getPermissions').mockRejectedValue({
      response: { status: 403, data: { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } } },
      success: false,
      error: { code: 'FORBIDDEN', message: 'Không có quyền truy cập tổ chức này.', requestId: 'req-403' },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PermissionProvider>{children}</PermissionProvider>
    );

    const { result } = renderHook(() => usePermissionContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error?.error?.code).toBe('FORBIDDEN');
      expect(result.current.permissions).toEqual([]);
    });

    expect(result.current.hasPermission('organization:read')).toBe(false);
    expect(result.current.hasPermission('task:read')).toBe(false);
  });

  it('handles network failure safely without inventing permissions', async () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      loginSso: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(orgContextModule, 'useOrganization').mockReturnValue({
      currentOrg: mockOrgA,
      organizations: [mockOrgA],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    });

    vi.spyOn(permissionsApi, 'getPermissions').mockRejectedValue(new Error('Network error'));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PermissionProvider>{children}</PermissionProvider>
    );

    const { result } = renderHook(() => usePermissionContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error?.error?.code).toBe('NETWORK_ERROR');
      expect(result.current.permissions).toEqual([]);
    });

    expect(result.current.hasPermission('organization:read')).toBe(false);
  });

  it('clears permissions completely when user logs out', async () => {
    vi.spyOn(permissionsApi, 'getPermissions').mockResolvedValue({
      organizationId: 'org-aaa',
      permissions: ['organization:read', 'task:read'],
    });

    let triggerLogout: () => void = () => {};

    const authSpy = vi.spyOn(authContextModule, 'useAuth');
    const orgSpy = vi.spyOn(orgContextModule, 'useOrganization');

    function DynamicAuthWrapper({ children }: { children: React.ReactNode }) {
      const [isAuth, setIsAuth] = useState(true);
      triggerLogout = () => setIsAuth(false);

      authSpy.mockImplementation(() => ({
        user: isAuth ? mockUser : null,
        isAuthenticated: isAuth,
        isLoading: false,
        login: vi.fn(),
        loginSso: vi.fn(),
        logout: vi.fn(),
      }));

      orgSpy.mockImplementation(() => ({
        currentOrg: mockOrgA,
        organizations: [mockOrgA],
        isLoading: false,
        setCurrentOrg: vi.fn(),
        refreshOrganizations: vi.fn(),
      }));

      return <PermissionProvider>{children}</PermissionProvider>;
    }

    const { result } = renderHook(() => usePermissionContext(), { wrapper: DynamicAuthWrapper });

    await waitFor(() => {
      expect(result.current.hasPermission('task:read')).toBe(true);
    });

    // Simulate logout
    act(() => {
      triggerLogout();
    });

    await waitFor(() => {
      expect(result.current.permissions).toEqual([]);
      expect(result.current.hasPermission('task:read')).toBe(false);
    });
  });
});

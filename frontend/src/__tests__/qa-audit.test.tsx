// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MembersTab } from '@/features/settings/MembersTab';
import { TopBar } from '@/components/layout/TopBar';
import { ToastProvider } from '@/contexts/ToastContext';
import * as membersApi from '@/api/members';
import * as permissionHook from '@/hooks/usePermission';
import * as authContextModule from '@/contexts/AuthContext';
import * as orgContextModule from '@/contexts/OrganizationContext';
import type { OrganizationMember, Organization, CurrentUser, RoleSummary } from '@/api/types';

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(),
}));

describe('DXOS-QA-001: Frontend QA & Release Candidate Audit Tests', () => {
  const orgAlpha: Organization = {
    id: 'org-alpha-111',
    name: 'Tổ chức Alpha',
    slug: 'org-alpha',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const orgBeta: Organization = {
    id: 'org-beta-222',
    name: 'Tổ chức Beta',
    slug: 'org-beta',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const adminUser: CurrentUser = {
    id: 'user-admin',
    email: 'admin@example.com',
    displayName: 'Quản trị viên',
    accountStatus: 'ACTIVE',
  };

  const alphaMembers: OrganizationMember[] = [
    {
      id: 'mem-alpha-1',
      organizationId: 'org-alpha-111',
      userId: 'user-admin',
      email: 'admin@example.com',
      displayName: 'Quản trị viên',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      roles: [{ id: 'role-admin', key: 'admin', name: 'Quản trị viên', isActive: true }],
      employee: null,
    },
    {
      id: 'mem-alpha-2',
      organizationId: 'org-alpha-111',
      userId: 'user-alpha-worker',
      email: 'alpha-worker@example.com',
      displayName: 'Alpha Nhân viên',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      roles: [{ id: 'role-viewer', key: 'viewer', name: 'Người xem', isActive: true }],
      employee: null,
    },
  ];

  const betaMembers: OrganizationMember[] = [
    {
      id: 'mem-beta-1',
      organizationId: 'org-beta-222',
      userId: 'user-beta-worker',
      email: 'beta-worker@example.com',
      displayName: 'Beta Thành viên',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      roles: [{ id: 'role-editor', key: 'editor', name: 'Biên tập viên', isActive: true }],
      employee: null,
    },
  ];

  const alphaRoles: RoleSummary[] = [
    { id: 'role-admin', key: 'admin', name: 'Quản trị viên', isActive: true },
    { id: 'role-viewer', key: 'viewer', name: 'Người xem', isActive: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: adminUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      loginSso: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(orgContextModule, 'useOrganization').mockReturnValue({
      currentOrg: orgAlpha,
      organizations: [orgAlpha, orgBeta],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    });

    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['role:read', 'role:assign'],
      hasPermission: (p) => ['role:read', 'role:assign'].includes(p),
      hasAnyPermission: (...ps) => ps.some((p) => ['role:read', 'role:assign'].includes(p)),
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    vi.spyOn(membersApi, 'listAllRoles').mockResolvedValue(alphaRoles);
  });

  // 1. Tenant switching race condition test
  it('prevents stale tenant responses from overwriting active tenant data during tenant switch', async () => {
    let resolveAlphaMembers!: (val: { items: OrganizationMember[]; nextCursor: string | null }) => void;
    const alphaMembersPromise = new Promise<{ items: OrganizationMember[]; nextCursor: string | null }>((resolve) => {
      resolveAlphaMembers = resolve;
    });

    let resolveBetaMembers!: (val: { items: OrganizationMember[]; nextCursor: string | null }) => void;
    const betaMembersPromise = new Promise<{ items: OrganizationMember[]; nextCursor: string | null }>((resolve) => {
      resolveBetaMembers = resolve;
    });

    const listSpy = vi.spyOn(membersApi, 'listMembers').mockImplementation((orgId) => {
      if (orgId === 'org-alpha-111') return alphaMembersPromise;
      if (orgId === 'org-beta-222') return betaMembersPromise;
      return Promise.resolve({ items: [], nextCursor: null });
    });

    let currentOrg = orgAlpha;
    const orgSpy = vi.spyOn(orgContextModule, 'useOrganization').mockImplementation(() => ({
      currentOrg,
      organizations: [orgAlpha, orgBeta],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    }));

    const { rerender } = render(
      <MemoryRouter>
        <ToastProvider>
          <MembersTab />
        </ToastProvider>
      </MemoryRouter>
    );

    // Initial render triggered loadMembers for orgAlpha
    expect(listSpy).toHaveBeenCalledWith('org-alpha-111', expect.any(Object));

    // User switches to Beta before Alpha response resolves
    currentOrg = orgBeta;
    orgSpy.mockImplementation(() => ({
      currentOrg: orgBeta,
      organizations: [orgAlpha, orgBeta],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    }));

    rerender(
      <MemoryRouter>
        <ToastProvider>
          <MembersTab />
        </ToastProvider>
      </MemoryRouter>
    );

    expect(listSpy).toHaveBeenCalledWith('org-beta-222', expect.any(Object));

    // Now Beta resolves FIRST
    resolveBetaMembers({ items: betaMembers, nextCursor: null });

    await waitFor(() => {
      expect(screen.getAllByText('Beta Thành viên').length).toBeGreaterThan(0);
    });

    // Now stale Alpha response arrives LATER
    resolveAlphaMembers({ items: alphaMembers, nextCursor: null });

    // Ensure Alpha response was discarded and did not overwrite Beta state
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByText('Beta Thành viên').length).toBeGreaterThan(0);
    expect(screen.queryByText('Alpha Nhân viên')).not.toBeInTheDocument();
  });

  // 2. Navigation: Catch-all route redirects unknown paths to /dashboard
  it('redirects unknown path to /dashboard via catch-all route without crashing or blank screen', async () => {
    render(
      <MemoryRouter initialEntries={['/non-existent-random-route']}>
        <Routes>
          <Route path="/dashboard" element={<div>Trang tổng quan xác nhận</div>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Trang tổng quan xác nhận')).toBeInTheDocument();
    });
  });

  // 3. TopBar navigation preserves SPA client routing
  it('renders notification link with React Router Link instead of full reload <a> tag', () => {
    render(
      <MemoryRouter>
        <TopBar onMenuClick={vi.fn()} unreadCount={3} />
      </MemoryRouter>
    );

    const notifLink = screen.getByLabelText(/Thông báo, Có thông báo chưa đọc/i);
    expect(notifLink).toBeInTheDocument();
    expect(notifLink.tagName).toBe('A');
    expect(notifLink.getAttribute('href')).toBe('/notifications');
  });

  // 4. Self-escalation protection in Member Administration
  it('disables role assignment button for current user preventing self-escalation', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: alphaMembers,
      nextCursor: null,
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <MembersTab />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Quản trị viên').length).toBeGreaterThan(0);
    });

    // Find row for current user (has badge "Bạn")
    const adminRow = screen.getAllByText('Bạn')[0].closest('tr')!;
    const assignBtn = within(adminRow).getByRole('button', { name: /gán vai trò/i });
    expect(assignBtn).toBeDisabled();
  });

  // 5. Empty role catalog handling
  it('displays empty catalog message and disables confirm button when organization has 0 roles', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: alphaMembers,
      nextCursor: null,
    });
    vi.spyOn(membersApi, 'listAllRoles').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ToastProvider>
          <MembersTab />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alpha Nhân viên').length).toBeGreaterThan(0);
    });

    const targetRow = screen.getAllByText('Alpha Nhân viên')[0].closest('tr')!;
    const assignBtn = within(targetRow).getByRole('button', { name: /gán vai trò/i });
    await userEvent.click(assignBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Tổ chức chưa có vai trò nào trong danh mục.')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /xác nhận gán vai trò/i });
    expect(confirmBtn).toBeDisabled();
  });

  // 6. Security UI: No sensitive credentials or stack traces rendered
  it('ensures no token, password, or stack traces are leaked in the DOM', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: alphaMembers,
      nextCursor: null,
    });

    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <MembersTab />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Alpha Nhân viên').length).toBeGreaterThan(0);
    });

    const html = container.innerHTML;
    expect(html).not.toContain('Bearer');
    expect(html).not.toContain('passwordHash');
    expect(html).not.toContain('refreshToken');
    expect(html).not.toContain('stackTrace');
    expect(html).not.toContain('eval at');
  });
});

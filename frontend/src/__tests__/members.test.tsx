// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MembersTab } from '@/features/settings/MembersTab';
import { ToastProvider } from '@/contexts/ToastContext';
import * as membersApi from '@/api/members';
import * as rolesApi from '@/api/roles';
import * as permissionHook from '@/hooks/usePermission';
import * as authContextModule from '@/contexts/AuthContext';
import * as orgContextModule from '@/contexts/OrganizationContext';
import type { OrganizationMember, Organization, CurrentUser, RoleSummary } from '@/api/types';

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(),
}));

describe('DXOS-FRONTEND-004: Members & Role Administration Tests', () => {
  const mockOrgA: Organization = {
    id: 'org-aaa',
    name: 'Organization Alpha',
    slug: 'org-alpha',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockOrgB: Organization = {
    id: 'org-bbb',
    name: 'Organization Beta',
    slug: 'org-beta',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockCurrentUser: CurrentUser = {
    id: 'user-actor',
    email: 'actor@example.com',
    displayName: 'Admin Actor',
    accountStatus: 'ACTIVE',
  };

  const sampleMembers: OrganizationMember[] = [
    {
      id: 'mem-1',
      organizationId: 'org-aaa',
      userId: 'user-actor', // Self
      email: 'actor@example.com',
      displayName: 'Admin Actor',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      roles: [
        { id: 'role-admin', key: 'admin', name: 'Quản trị viên', isActive: true },
      ],
      employee: null,
    },
    {
      id: 'mem-2',
      organizationId: 'org-aaa',
      userId: 'user-target',
      email: 'target@example.com',
      displayName: 'Target User',
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      roles: [
        { id: 'role-viewer', key: 'viewer', name: 'Người xem', isActive: true },
      ],
      employee: {
        id: 'emp-1',
        employeeCode: 'EMP-001',
        displayName: 'Target User',
        status: 'ACTIVE',
      },
    },
  ];

  const sampleRoles: RoleSummary[] = [
    { id: 'role-admin', key: 'admin', name: 'Quản trị viên', isActive: true },
    { id: 'role-viewer', key: 'viewer', name: 'Người xem', isActive: true },
    { id: 'role-editor', key: 'editor', name: 'Biên tập viên', isActive: true },
    { id: 'role-archived', key: 'archived', name: 'Lưu trữ', isActive: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(rolesApi, 'listAllRoles').mockResolvedValue(sampleRoles);
    vi.spyOn(membersApi, 'listAllRoles').mockResolvedValue(sampleRoles);

    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: mockCurrentUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      loginSso: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(orgContextModule, 'useOrganization').mockReturnValue({
      currentOrg: mockOrgA,
      organizations: [mockOrgA, mockOrgB],
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
  });

  const renderComponent = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <MembersTab />
        </ToastProvider>
      </MemoryRouter>
    );

  // 1. Member page loads real backend members
  it('loads and displays members from real backend API', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Thành viên tổ chức (2)')).toBeInTheDocument();
      expect(screen.getAllByText('Admin Actor').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
      expect(screen.getAllByText('actor@example.com').length).toBeGreaterThan(0);
      expect(screen.getAllByText('target@example.com').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Quản trị viên').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Người xem').length).toBeGreaterThan(0);
    });
  });

  // 2. Loading state
  it('shows loading state while fetching members', () => {
    vi.spyOn(membersApi, 'listMembers').mockReturnValue(new Promise(() => {}));

    renderComponent();

    expect(screen.getAllByText('Đang tải danh sách thành viên...').length).toBeGreaterThan(0);
  });

  // 3. Empty state
  it('renders empty state when organization has no members', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Chưa có thành viên nào')).toBeInTheDocument();
    });
  });

  // 4. Network/server error state
  it('renders error state on server failure and supports retry', async () => {
    const listSpy = vi.spyOn(membersApi, 'listMembers')
      .mockRejectedValueOnce({
        response: { status: 500 },
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Lỗi máy chủ', requestId: 'req-err' },
      })
      .mockResolvedValueOnce({
        items: sampleMembers,
        nextCursor: null,
      });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Không thể tải danh sách thành viên.')).toBeInTheDocument();
    });

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /thử lại/i });
    await userEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Admin Actor').length).toBeGreaterThan(0);
    });
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  // 5. User without role:assign cannot mutate roles
  it('hides role assignment and revoke controls when user lacks role:assign', async () => {
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['role:read'],
      hasPermission: (p) => p === 'role:read',
      hasAnyPermission: (...ps) => ps.includes('role:read'),
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    // Role assignment buttons and revoke buttons should not exist
    expect(screen.queryByRole('button', { name: /gán vai trò/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /thu hồi/i })).not.toBeInTheDocument();
  });

  // 6. User with role:assign sees role controls for active non-self members
  it('shows role controls when user has role:assign and prevents self-mutation', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    // Check that assign button for Target User is enabled
    const assignButtons = screen.getAllByRole('button', { name: /gán vai trò/i });
    expect(assignButtons.length).toBeGreaterThan(0);

    // Self member should have disabled buttons in desktop table
    const selfNameEl = screen.getAllByText('Admin Actor')[0];
    const selfRow = selfNameEl.closest('tr');
    expect(selfRow).not.toBeNull();
    if (selfRow) {
      const selfAssignBtn = within(selfRow).getByRole('button', { name: /gán vai trò/i });
      expect(selfAssignBtn).toBeDisabled();

      const selfRevokeBtn = within(selfRow).getByRole('button', { name: /thu hồi/i });
      expect(selfRevokeBtn).toBeDisabled();
    }
  });

  // 7. Permission still loading -> controls and table unavailable
  it('shows loading message when permission check is in progress', () => {
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: [],
      hasPermission: () => false,
      hasAnyPermission: () => false,
      isLoading: true,
      error: null,
      refreshPermissions: vi.fn(),
    });

    renderComponent();

    expect(
      screen.getAllByText('Đang kiểm tra quyền hạn và thông tin tổ chức...').length
    ).toBeGreaterThan(0);
  });

  // 8. Assign role success
  it('submits role assignment and refreshes member list on success', async () => {
    const listSpy = vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    const assignSpy = vi.spyOn(membersApi, 'assignRole').mockResolvedValue({
      membershipId: 'mem-2',
      roleId: 'role-admin',
      assigned: true,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    // Find Target User in desktop table row and click "Gán vai trò"
    const targetRow = screen.getAllByText('Target User')[0].closest('tr')!;
    const assignBtn = within(targetRow).getByRole('button', { name: /gán vai trò/i });
    await userEvent.click(assignBtn);

    // Modal opens
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Gán vai trò cho thành viên')).toBeInTheDocument();

    // Select role "Quản trị viên"
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'role-admin');

    // Click confirm
    const submitBtn = screen.getByRole('button', { name: /xác nhận gán vai trò/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('org-aaa', 'mem-2', 'role-admin');
      expect(listSpy).toHaveBeenCalledTimes(2); // Reloaded
    });
  });

  // 9. Assign role 403 Forbidden
  it('displays safe error message when assignRole returns 403 Forbidden', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    vi.spyOn(membersApi, 'assignRole').mockRejectedValue({
      response: { status: 403 },
      success: false,
      error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'req-403' },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    const targetRow = screen.getAllByText('Target User')[0].closest('tr')!;
    const assignBtn = within(targetRow).getByRole('button', { name: /gán vai trò/i });
    await userEvent.click(assignBtn);

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'role-admin');

    const submitBtn = screen.getByRole('button', { name: /xác nhận gán vai trò/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Bạn không có quyền gán vai trò này/i)).toBeInTheDocument();
    });
  });

  // 10. Role catalog discovery and removal of manual Role UUID input
  it('loads role catalog from backend, displays role options, and does not provide manual UUID input', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });
    const rolesSpy = vi.spyOn(membersApi, 'listAllRoles').mockResolvedValue(sampleRoles);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    const targetRow = screen.getAllByText('Target User')[0].closest('tr')!;
    const assignBtn = within(targetRow).getByRole('button', { name: /gán vai trò/i });
    await userEvent.click(assignBtn);

    // Modal opens
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Gán vai trò cho thành viên')).toBeInTheDocument();

    // Verify catalog was requested for active tenant
    expect(rolesSpy).toHaveBeenCalledWith('org-aaa');

    // Verify manual Role UUID button and input are completely removed
    expect(screen.queryByRole('button', { name: /nhập Role ID thủ công/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('00000000-0000-0000-0000-000000000000')).not.toBeInTheDocument();

    // Verify role options in dropdown
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select).toBeInTheDocument();

    const options = Array.from(select.options);
    const viewerOption = options.find((opt) => opt.value === 'role-viewer');
    expect(viewerOption).toBeDisabled();
    expect(viewerOption?.textContent).toContain('Đã gán');

    const archivedOption = options.find((opt) => opt.value === 'role-archived');
    expect(archivedOption).toBeDisabled();
    expect(archivedOption?.textContent).toContain('Không hoạt động');

    const adminOption = options.find((opt) => opt.value === 'role-admin');
    expect(adminOption).not.toBeDisabled();
  });

  // 10b. Empty role catalog state
  it('displays clear message and disables submit when organization has no roles defined', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });
    vi.spyOn(rolesApi, 'listAllRoles').mockResolvedValue([]);
    vi.spyOn(membersApi, 'listAllRoles').mockResolvedValue([]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    const targetRow = screen.getAllByText('Target User')[0].closest('tr')!;
    const assignBtn = within(targetRow).getByRole('button', { name: /gán vai trò/i });
    await userEvent.click(assignBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Tổ chức chưa có vai trò nào trong danh mục.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nhập Role ID thủ công/i })).not.toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /xác nhận gán vai trò/i });
    expect(submitBtn).toBeDisabled();
  });

  // 10c. Role catalog error handling and retry
  it('displays error message when role catalog fetch fails and supports retry', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });
    const rolesSpy = vi.spyOn(membersApi, 'listAllRoles')
      .mockRejectedValueOnce({
        response: { status: 500 },
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Lỗi nạp danh mục vai trò', requestId: 'req-err' },
      })
      .mockResolvedValueOnce(sampleRoles);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    const targetRow = screen.getAllByText('Target User')[0].closest('tr')!;
    const assignBtn = within(targetRow).getByRole('button', { name: /gán vai trò/i });
    await userEvent.click(assignBtn);

    await waitFor(() => {
      expect(screen.getByText('Lỗi nạp danh mục vai trò')).toBeInTheDocument();
    });

    // Retry button inside modal
    const retryBtn = screen.getByRole('button', { name: /thử lại/i });
    await userEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
    expect(rolesSpy).toHaveBeenCalledTimes(2);
  });

  // 11. Revoke role success
  it('confirms and revokes role successfully and refreshes member list', async () => {
    const listSpy = vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    const revokeSpy = vi.spyOn(membersApi, 'revokeRole').mockResolvedValue({
      membershipId: 'mem-2',
      roleId: 'role-viewer',
      assigned: false,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    // Click revoke button for "Người xem" on Target User
    const targetRow = screen.getAllByText('Target User')[0].closest('tr')!;
    const revokeBtn = within(targetRow).getByRole('button', { name: /thu hồi vai trò người xem/i });
    await userEvent.click(revokeBtn);

    // Confirmation dialog appears
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Xác nhận thu hồi vai trò')).toBeInTheDocument();
    expect(within(dialog).getByText(/Bạn có chắc chắn muốn thu hồi vai trò/i)).toBeInTheDocument();

    // Confirm revocation
    const confirmBtn = within(dialog).getByRole('button', { name: /thu hồi vai trò/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(revokeSpy).toHaveBeenCalledWith('org-aaa', 'mem-2', 'role-viewer');
      expect(listSpy).toHaveBeenCalledTimes(2);
    });
  });

  // 12. Revoke role 403
  it('displays error message when revokeRole returns 403', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    vi.spyOn(membersApi, 'revokeRole').mockRejectedValue({
      response: { status: 403 },
      success: false,
      error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'req-403' },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    const targetRow = screen.getAllByText('Target User')[0].closest('tr')!;
    const revokeBtn = within(targetRow).getByRole('button', { name: /thu hồi vai trò người xem/i });
    await userEvent.click(revokeBtn);

    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: /thu hồi vai trò/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Bạn không có quyền thu hồi vai trò này/i)).toBeInTheDocument();
    });
  });

  // 13. Sensitive backend fields are not rendered
  it('does not render sensitive backend credentials or hash fields', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    const { container } = renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    const html = container.innerHTML;
    expect(html).not.toContain('passwordHash');
    expect(html).not.toContain('refreshTokenHash');
    expect(html).not.toContain('jwt');
    expect(html).not.toContain('secret');
  });

  // 14. Keyset pagination
  it('loads more members when clicking pagination button', async () => {
    const listSpy = vi.spyOn(membersApi, 'listMembers')
      .mockResolvedValueOnce({
        items: [sampleMembers[0]],
        nextCursor: 'mem-1',
      })
      .mockResolvedValueOnce({
        items: [sampleMembers[1]],
        nextCursor: null,
      });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Admin Actor').length).toBeGreaterThan(0);
    });

    const loadMoreBtn = screen.getByRole('button', { name: /tải thêm/i });
    await userEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith('org-aaa', { limit: 25, after: 'mem-1' });
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });
  });

  // 15. User lacking role:read gets ForbiddenState
  it('displays ForbiddenState when user lacks role:read', async () => {
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['organization:read'],
      hasPermission: () => false,
      hasAnyPermission: () => false,
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    renderComponent();

    expect(
      screen.getByText(/Bạn không có quyền xem thành viên tổ chức/i)
    ).toBeInTheDocument();
  });

  // 16. Organization switch clears old member state
  it('clears old member state immediately when organization switches', async () => {
    let currentOrg = mockOrgA;
    const orgSpy = vi.spyOn(orgContextModule, 'useOrganization').mockImplementation(() => ({
      currentOrg,
      organizations: [mockOrgA, mockOrgB],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    }));

    const listSpy = vi.spyOn(membersApi, 'listMembers').mockImplementation(async (orgId) => {
      if (orgId === 'org-aaa') {
        return { items: sampleMembers, nextCursor: null };
      }
      return {
        items: [
          {
            id: 'mem-b-1',
            organizationId: 'org-bbb',
            userId: 'user-beta',
            email: 'beta@example.com',
            displayName: 'Beta Member',
            accountStatus: 'ACTIVE',
            status: 'ACTIVE',
            roles: [],
            employee: null,
          },
        ],
        nextCursor: null,
      };
    });

    const { rerender } = renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    // Switch org to Org B
    currentOrg = mockOrgB;
    orgSpy.mockImplementation(() => ({
      currentOrg: mockOrgB,
      organizations: [mockOrgA, mockOrgB],
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

    await waitFor(() => {
      expect(screen.getAllByText('Beta Member').length).toBeGreaterThan(0);
      expect(screen.queryByText('Target User')).not.toBeInTheDocument();
    });

    expect(listSpy).toHaveBeenCalledWith('org-bbb', expect.any(Object));
  });

  // 17. Prevents double-submission when assigning role
  it('disables submit button and prevents double-submission while request is in progress', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    let resolveAssign!: (val: { membershipId: string; roleId: string; assigned: boolean }) => void;
    const assignPromise = new Promise<{ membershipId: string; roleId: string; assigned: boolean }>((resolve) => {
      resolveAssign = resolve;
    });

    const assignSpy = vi.spyOn(membersApi, 'assignRole').mockImplementation(() => assignPromise);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    const targetRow = screen.getAllByText('Target User')[0].closest('tr')!;
    const assignBtn = within(targetRow).getByRole('button', { name: /gán vai trò/i });
    await userEvent.click(assignBtn);

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'role-admin');

    const submitBtn = screen.getByRole('button', { name: /xác nhận gán vai trò/i });
    expect(submitBtn).not.toBeDisabled();

    // Click submit once
    await userEvent.click(submitBtn);

    // Button should now be disabled and show loading text
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText('Đang gán...')).toBeInTheDocument();

    // Verify assignRole was called once, not twice
    expect(assignSpy).toHaveBeenCalledTimes(1);

    // Resolve
    resolveAssign({ membershipId: 'mem-2', roleId: 'role-admin', assigned: true });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // 18. Accessibility: modal has proper dialog role and title labelling
  it('renders accessible modal dialog with aria-labelledby and escape key support', async () => {
    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: sampleMembers,
      nextCursor: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Target User').length).toBeGreaterThan(0);
    });

    const targetRow = screen.getAllByText('Target User')[0].closest('tr')!;
    const assignBtn = within(targetRow).getByRole('button', { name: /gán vai trò/i });
    await userEvent.click(assignBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');

    // Close on Escape
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
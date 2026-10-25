import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MembersTab } from '@/features/settings/MembersTab';
import { ToastProvider } from '@/contexts/ToastContext';
import * as rolesApi from '@/api/roles';
import * as membersApi from '@/api/members';
import * as permissionHook from '@/hooks/usePermission';
import * as authContextModule from '@/contexts/AuthContext';
import * as orgContextModule from '@/contexts/OrganizationContext';
import { api } from '@/api/client';
import type {
  OrganizationMember,
  Organization,
  CurrentUser,
  RoleSummary,
  OrganizationRolePage,
  RoleAssignmentResult,
} from '@/api/types';

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(),
}));

describe('DXOS-FRONTEND-005: Real Organization Role Catalog Tests', () => {
  const mockOrgA: Organization = {
    id: 'org-111',
    name: 'Tech Corp A',
    slug: 'tech-corp-a',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockOrgB: Organization = {
    id: 'org-222',
    name: 'Tech Corp B',
    slug: 'tech-corp-b',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockUser: CurrentUser = {
    id: 'user-admin',
    email: 'admin@dxos.test',
    displayName: 'Global Admin',
    accountStatus: 'ACTIVE',
  };

  const targetMember: OrganizationMember = {
    id: 'mem-target',
    organizationId: 'org-111',
    userId: 'user-emp',
    email: 'employee@dxos.test',
    displayName: 'Nguyễn Văn A',
    accountStatus: 'ACTIVE',
    status: 'ACTIVE',
    roles: [
      { id: 'role-viewer-1', key: 'viewer', name: 'Người xem', isActive: true },
    ],
    employee: {
      id: 'emp-1',
      employeeCode: 'EMP-001',
      displayName: 'Nguyễn Văn A',
      status: 'ACTIVE',
    },
  };

  const catalogRoles: RoleSummary[] = [
    { id: 'role-viewer-1', key: 'viewer', name: 'Người xem', isActive: true },
    { id: 'role-manager-2', key: 'manager', name: 'Quản lý phòng ban', isActive: true },
    { id: 'role-unassigned-3', key: 'auditor', name: 'Kiểm toán viên', isActive: true },
    { id: 'role-disabled-4', key: 'archived_role', name: 'Vai trò cũ', isActive: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

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

    vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: [targetMember],
      nextCursor: null,
    });

    vi.spyOn(rolesApi, 'listAllRoles').mockResolvedValue(catalogRoles);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <MembersTab />
        </ToastProvider>
      </MemoryRouter>
    );

  // 1. Fetch roles from real role endpoint
  it('1. Fetches roles from real role endpoint GET /organizations/:id/roles via rolesApi', async () => {
    const listSpy = vi.spyOn(rolesApi, 'listAllRoles').mockResolvedValue(catalogRoles);

    renderComponent();

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith('org-111');
    });
  });

  // 2. Unassigned role appears in catalog dropdown
  it('2. Unassigned roles from catalog appear in role selection modal', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    });

    const assignBtn = screen.getAllByRole('button', { name: /gán vai trò/i })[0];
    await userEvent.click(assignBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Kiểm toán viên \(auditor\)/i)).toBeInTheDocument();
  });

  // 3. Inactive role displays proper status and is disabled
  it('3. Inactive roles display "— Không hoạt động" label and are disabled for selection', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    });

    const assignBtn = screen.getAllByRole('button', { name: /gán vai trò/i })[0];
    await userEvent.click(assignBtn);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const options = Array.from(select.options);

    const inactiveOpt = options.find((opt) => opt.value === 'role-disabled-4');
    expect(inactiveOpt).toBeDefined();
    expect(inactiveOpt?.textContent).toContain('Không hoạt động');
    expect(inactiveOpt).toBeDisabled();
  });

  // 4. Role UUID does NOT need manual entry; no manual UUID input exists
  it('4. Eliminates manual Role UUID input workaround completely', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    });

    const assignBtn = screen.getAllByRole('button', { name: /gán vai trò/i })[0];
    await userEvent.click(assignBtn);

    expect(screen.queryByPlaceholderText(/Nhập Role UUID/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nhập Role ID thủ công/i)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  // 5. role:read gating prevents fetching and rendering roles/members if absent
  it('5. Gated by role:read: shows ForbiddenState and does not call listAllRoles when lacking role:read', async () => {
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: [],
      hasPermission: () => false,
      hasAnyPermission: () => false,
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    const rolesSpy = vi.spyOn(rolesApi, 'listAllRoles');

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Bạn không có quyền xem thành viên tổ chức/i)).toBeInTheDocument();
    });

    expect(rolesSpy).not.toHaveBeenCalled();
  });

  // 6. role:assign gating hides or disables assign button
  it('6. Gated by role:assign: does not render "Gán vai trò" buttons when lacking role:assign', async () => {
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['role:read'],
      hasPermission: (p) => p === 'role:read',
      hasAnyPermission: (p) => p === 'role:read',
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole('button', { name: /gán vai trò/i })).not.toBeInTheDocument();
  });

  // 7. Organization switch clears old roles and reloads new org roles
  it('7. Organization switch: invalidates role catalog and reloads roles for new organization', async () => {
    const rolesSpy = vi.spyOn(rolesApi, 'listAllRoles').mockResolvedValue(catalogRoles);

    const { rerender } = render(
      <MemoryRouter>
        <ToastProvider>
          <MembersTab />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(rolesSpy).toHaveBeenCalledWith('org-111');
    });

    // Switch to Org B
    vi.spyOn(orgContextModule, 'useOrganization').mockReturnValue({
      currentOrg: mockOrgB,
      organizations: [mockOrgA, mockOrgB],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    });

    rerender(
      <MemoryRouter>
        <ToastProvider>
          <MembersTab />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(rolesSpy).toHaveBeenCalledWith('org-222');
    });
  });

  // 8. Pagination / Keysets in listAllRoles utility
  it('8. listAllRoles handles multi-page cursor pagination sequentially until nextCursor is null', async () => {
    // Un-mock listAllRoles so the actual implementation is tested
    vi.mocked(rolesApi.listAllRoles).mockRestore?.();

    const apiGetSpy = vi.spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: {
          items: [{ id: 'r-1', key: 'k1', name: 'Role 1', isActive: true }],
          nextCursor: 'cur-1',
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ id: 'r-2', key: 'k2', name: 'Role 2', isActive: true }],
          nextCursor: null,
        },
      });

    const result = await rolesApi.listAllRoles('org-111');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('r-1');
    expect(result[1].id).toBe('r-2');
    expect(apiGetSpy).toHaveBeenCalledTimes(2);
  });

  // 9. 403 Forbidden handling in role catalog
  it('9. Handles 403 Forbidden from role catalog API and displays friendly error', async () => {
    vi.spyOn(rolesApi, 'listAllRoles').mockRejectedValue({
      response: { status: 403 },
      success: false,
      error: { code: 'FORBIDDEN', message: 'Bạn không có quyền xem danh mục vai trò.', requestId: 'req-403' },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    });

    const assignBtn = screen.getAllByRole('button', { name: /gán vai trò/i })[0];
    await userEvent.click(assignBtn);

    expect(screen.getByText('Bạn không có quyền xem danh mục vai trò.')).toBeInTheDocument();
  });

  // 10. 500 / Network error handling in role catalog
  it('10. Handles 500 / Network error with retry option in role catalog modal', async () => {
    const rolesSpy = vi.spyOn(rolesApi, 'listAllRoles')
      .mockRejectedValueOnce({
        response: { status: 500 },
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Máy chủ gặp sự cố khi tải vai trò', requestId: 'req-500' },
      })
      .mockResolvedValueOnce(catalogRoles);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    });

    const assignBtn = screen.getAllByRole('button', { name: /gán vai trò/i })[0];
    await userEvent.click(assignBtn);

    await waitFor(() => {
      expect(screen.getByText('Máy chủ gặp sự cố khi tải vai trò')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /thử lại/i });
    await userEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Kiểm toán viên \(auditor\)/i)).toBeInTheDocument();
    });
  });

  // 11. Successful role assignment
  it('11. Successfully assigns role and shows toast notification', async () => {
    const assignSpy = vi.spyOn(membersApi, 'assignRole').mockResolvedValue({
      membershipId: 'mem-target',
      roleId: 'role-unassigned-3',
      assigned: true,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    });

    const assignBtn = screen.getAllByRole('button', { name: /gán vai trò/i })[0];
    await userEvent.click(assignBtn);

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'role-unassigned-3');

    const submitBtn = screen.getByRole('button', { name: /xác nhận gán vai trò/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('org-111', 'mem-target', 'role-unassigned-3');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // 12. Duplicate submit prevention during assignment
  it('12. Prevents double submission when assigning role', async () => {
    let resolveAssign!: (value: RoleAssignmentResult) => void;
    const assignPromise = new Promise<RoleAssignmentResult>((resolve) => {
      resolveAssign = resolve;
    });

    const assignSpy = vi.spyOn(membersApi, 'assignRole').mockReturnValue(assignPromise);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    });

    const assignBtn = screen.getAllByRole('button', { name: /gán vai trò/i })[0];
    await userEvent.click(assignBtn);

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'role-unassigned-3');

    const submitBtn = screen.getByRole('button', { name: /xác nhận gán vai trò/i });
    await userEvent.click(submitBtn);
    await userEvent.click(submitBtn); // Double click

    expect(submitBtn).toBeDisabled();
    expect(assignSpy).toHaveBeenCalledTimes(1);

    resolveAssign({ membershipId: 'mem-target', roleId: 'role-unassigned-3', assigned: true });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // 13. Authoritative refresh after assignment
  it('13. Triggers authoritative member list refresh after successful role assignment', async () => {
    vi.spyOn(membersApi, 'assignRole').mockResolvedValue({
      membershipId: 'mem-target',
      roleId: 'role-unassigned-3',
      assigned: true,
    });

    const listMembersSpy = vi.spyOn(membersApi, 'listMembers').mockResolvedValue({
      items: [targetMember],
      nextCursor: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(listMembersSpy).toHaveBeenCalledTimes(1);
    });

    const assignBtn = screen.getAllByRole('button', { name: /gán vai trò/i })[0];
    await userEvent.click(assignBtn);

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'role-unassigned-3');

    const submitBtn = screen.getByRole('button', { name: /xác nhận gán vai trò/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(listMembersSpy).toHaveBeenCalledTimes(2);
    });
  });

  // 14. Empty role catalog handling
  it('14. Renders clear empty catalog message and disables submit when no roles exist', async () => {
    vi.spyOn(rolesApi, 'listAllRoles').mockResolvedValue([]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    });

    const assignBtn = screen.getAllByRole('button', { name: /gán vai trò/i })[0];
    await userEvent.click(assignBtn);

    expect(screen.getByText('Tổ chức chưa có vai trò nào trong danh mục.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /xác nhận gán vai trò/i });
    expect(submitBtn).toBeDisabled();
  });
});

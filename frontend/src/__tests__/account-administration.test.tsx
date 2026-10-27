// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ org: { id: 'org-a' }, permissions: new Set<string>(),
  api: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), role: vi.fn(), catalog: vi.fn(), createRole: vi.fn(), updateRole: vi.fn(), deleteRole: vi.fn() }, roles: vi.fn() }));
vi.mock('@/contexts/OrganizationContext', () => ({ useOrganization: () => ({ currentOrg: state.org }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'self' } }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: (p: string) => state.permissions.has(p) }) }));
vi.mock('@/api/accounts', () => ({ accountsApi: state.api }));
vi.mock('@/api/roles', () => ({ listAllRoles: state.roles }));
import { AccountAdministration } from '@/features/settings/AccountAdministration';
const user = { id: 'other', email: 'fixture@example.test', displayName: 'Fixture member', membershipId: 'member', membershipStatus: 'ACTIVE', accountStatus: 'ACTIVE' };
describe('organization account administration', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.org = { id: 'org-a' };
    state.permissions = new Set(['user:read', 'user:create', 'user:update', 'user:delete', 'role:read', 'role:create', 'role:update', 'role:delete', 'role:assign', 'task:read']);
    state.api.list.mockResolvedValue({ items: [user, { ...user, id: 'self', displayName: 'Own account' }], nextCursor: null });
    state.roles.mockResolvedValue([{ id: 'role-a', key: 'reader', name: 'Reader', isActive: true }]);
    state.api.catalog.mockResolvedValue({ items: [{ key: 'task:read' }, { key: 'payroll:read' }] });
    state.api.role.mockResolvedValue({ id: 'role-a', key: 'reader', name: 'Reader', isActive: true, permissionKeys: ['task:read'] });
    state.api.create.mockResolvedValue(user); state.api.remove.mockResolvedValue({ removed: true }); state.api.createRole.mockResolvedValue({ id: 'created-role' });
  });
  it('loads only authorized data and hides ungranted operations', async () => {
    state.permissions = new Set(['role:read']); render(<AccountAdministration />);
    await screen.findByText('Reader');
    expect(state.api.list).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Tạo tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạo vai trò' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa vai trò' })).not.toBeInTheDocument();
  });
  it('creates an account with a write-only password and does not automatically assign a role', async () => {
    render(<AccountAdministration />); await screen.findByText('Fixture member');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    fireEvent.change(screen.getByLabelText('Họ tên'), { target: { value: 'New member' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText(/Mật khẩu ban đầu/), { target: { value: 'x'.repeat(20) } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tài khoản' }));
    await waitFor(() => expect(state.api.create).toHaveBeenCalledWith('org-a', { email: 'new@example.test', displayName: 'New member', password: 'x'.repeat(20) }));
    expect(screen.queryByText('x'.repeat(20))).not.toBeInTheDocument();
    await screen.findByText(/Đã tạo tài khoản. Tiếp theo/);
  });
  it('does not offer editing or removing the current actor', async () => {
    render(<AccountAdministration />); await screen.findByText('Own account');
    expect(screen.getAllByRole('button', { name: 'Sửa tài khoản' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Gỡ khỏi tổ chức' })).toHaveLength(1);
  });
  it('requires explicit confirmation before membership removal', async () => {
    render(<AccountAdministration />); await screen.findByText('Fixture member');
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi tổ chức' }));
    expect(state.api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(state.api.remove).toHaveBeenCalledWith('org-a', 'other'));
  });
  it('disables grants the actor does not hold and persists only the selected allowed permission', async () => {
    render(<AccountAdministration />); await screen.findByText('Reader');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo vai trò' }));
    fireEvent.change(screen.getByLabelText('Mã vai trò'), { target: { value: 'new-reader' } });
    fireEvent.change(screen.getByLabelText('Tên vai trò'), { target: { value: 'New reader' } });
    expect(screen.getByLabelText('payroll:read')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('task:read'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu vai trò' }));
    await waitFor(() => expect(state.api.createRole).toHaveBeenCalledWith('org-a', { key: 'new-reader', name: 'New reader', permissionKeys: ['task:read'] }));
  });
  it('shows a retryable error without leaking a failed response or password', async () => {
    state.api.list.mockRejectedValue(new Error('private-server-detail'));
    render(<AccountAdministration />);
    await screen.findByRole('alert'); expect(screen.queryByText('private-server-detail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeEnabled();
  });
  it('ignores a response from the previous organization', async () => {
    let resolve!: (data: unknown) => void;
    state.api.list.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const view = render(<AccountAdministration />);
    state.org = { id: 'org-b' }; state.api.list.mockResolvedValue({ items: [], nextCursor: null });
    view.rerender(<AccountAdministration />);
    await screen.findByText('Chưa có tài khoản.');
    await act(async () => resolve({ items: [user], nextCursor: null }));
    expect(screen.queryByText('Fixture member')).not.toBeInTheDocument();
  });
});

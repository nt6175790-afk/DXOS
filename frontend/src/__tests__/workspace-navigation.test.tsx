// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/Sidebar';
import { OrganizationAccessBoundary } from '@/components/layout/OrganizationAccessBoundary';
import { usePermission } from '@/hooks/usePermission';
import type { Permission } from '@/api/types';

vi.mock('@/hooks/useOrgBootstrapGuard', () => ({ useOrgBootstrapGuard: () => null }));
function permission(grants: Permission[], loading = false) {
  vi.mocked(usePermission).mockReturnValue({ permissions: grants, hasPermission: p => grants.includes(p), hasAnyPermission: (...p) => p.some(x => grants.includes(x)), isLoading: loading, error: null, refreshPermissions: vi.fn() });
}
const shell = (child: React.ReactNode, path = '/') => <MemoryRouter initialEntries={[path]}>{child}</MemoryRouter>;

describe('Permission-aware workspace navigation', () => {
  beforeEach(() => { vi.clearAllMocks(); permission([]); });
  it('hides unavailable modules without inventing administrator access', () => {
    permission(['task:read']); render(shell(<Sidebar open onClose={vi.fn()} />));
    expect(screen.getByRole('link', { name: 'Công việc' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tiền lương' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cài đặt' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toBeInTheDocument();
  });
  it('prevents a protected page from mounting when entered by direct URL', () => {
    render(shell(<OrganizationAccessBoundary><div>Private payroll</div></OrganizationAccessBoundary>, '/payroll'));
    expect(screen.getByText('Truy cập bị từ chối')).toBeInTheDocument(); expect(screen.queryByText('Private payroll')).not.toBeInTheDocument();
  });
  it('does not mount protected content while permissions load', () => {
    permission([], true); render(shell(<OrganizationAccessBoundary><div>Private payroll</div></OrganizationAccessBoundary>, '/payroll'));
    expect(screen.queryByText('Private payroll')).not.toBeInTheDocument(); expect(screen.queryByText('Truy cập bị từ chối')).not.toBeInTheDocument();
  });
  it('allows read-only role administration without granting assignment permission', () => {
    permission(['role:read']); render(shell(<OrganizationAccessBoundary><div>Role catalog</div></OrganizationAccessBoundary>, '/settings'));
    expect(screen.getByText('Role catalog')).toBeInTheDocument(); expect(usePermission().hasPermission('role:assign')).toBe(false);
  });
  it('applies the parent permission to a task detail URL', () => {
    render(shell(<OrganizationAccessBoundary><div>Task detail</div></OrganizationAccessBoundary>, '/tasks/foreign-id'));
    expect(screen.queryByText('Task detail')).not.toBeInTheDocument();
  });
});

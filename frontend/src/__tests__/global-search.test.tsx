// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalSearch } from '@/features/search/GlobalSearch';
import { searchOrganization, type SearchResult } from '@/api/search';
const state = vi.hoisted(() => ({ orgId: 'org-a', permissions: new Set(['task:read', 'employee:read', 'file:read', 'department:read']) }));
vi.mock('@/api/search');
vi.mock('@/contexts/OrganizationContext', () => ({ useOrganization: () => ({ currentOrg: state.orgId ? { id: state.orgId } : null }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: (key: string) => state.permissions.has(key) }) }));
const empty: SearchResult = { groups: { tasks: { items: [], nextCursor: null }, employees: null, documents: null, departments: null, notifications: null } };
const found: SearchResult = { groups: { ...empty.groups, tasks: { items: [{ id: 'task-a', title: 'Báo cáo doanh nghiệp', subtitle: null }], nextCursor: null } } };
function view() { return render(<MemoryRouter><GlobalSearch /></MemoryRouter>); }
function query(value = 'Báo cáo') { fireEvent.change(screen.getByLabelText('Từ khóa tìm kiếm'), { target: { value } }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
beforeEach(() => { vi.resetAllMocks(); state.orgId = 'org-a'; state.permissions = new Set(['task:read', 'employee:read', 'file:read', 'department:read']); vi.mocked(searchOrganization).mockResolvedValue(empty); });
describe('Global search', () => {
  it('opens with Ctrl+K, focuses input and closes with Escape restoring trigger focus', async () => {
    view(); fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByLabelText('Từ khóa tìm kiếm')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('Từ khóa tìm kiếm'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: /Tìm kiếm toàn/ })).toHaveFocus();
  });
  it('waits for at least two characters and debounces queries', async () => {
    view(); fireEvent.click(screen.getByRole('button', { name: /Tìm kiếm toàn/ })); query('a');
    expect(screen.getByText('Nhập ít nhất 2 ký tự để tìm kiếm.')).toBeInTheDocument(); expect(searchOrganization).not.toHaveBeenCalled();
    query('ba'); query('bao'); query('  báo cáo  ');
    await waitFor(() => expect(searchOrganization).toHaveBeenCalledTimes(1)); expect(searchOrganization).toHaveBeenCalledWith('org-a', 'báo cáo', 'all', undefined);
  });
  it('shows authorized results and supports arrow navigation', async () => {
    vi.mocked(searchOrganization).mockResolvedValue(found); view(); fireEvent.keyDown(window, { key: 'k', metaKey: true }); query();
    const link = await screen.findByRole('link', { name: 'Báo cáo doanh nghiệp' }); expect(link).toHaveAttribute('href', '/tasks/task-a');
    fireEvent.keyDown(screen.getByLabelText('Từ khóa tìm kiếm'), { key: 'ArrowDown' }); expect(link).toHaveFocus(); fireEvent.click(link); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('supports category drill-down and pagination', async () => {
    vi.mocked(searchOrganization).mockResolvedValueOnce({ groups: { ...found.groups, tasks: { ...found.groups.tasks!, nextCursor: 'task-a' } } })
      .mockResolvedValueOnce({ groups: { ...found.groups, tasks: { ...found.groups.tasks!, nextCursor: 'task-a' } } })
      .mockResolvedValueOnce({ groups: { ...empty.groups, tasks: { items: [{ id: 'task-b', title: 'Kết quả trang sau', subtitle: null }], nextCursor: null } } });
    view(); fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); query(); fireEvent.click(await screen.findByText('Xem thêm kết quả'));
    fireEvent.click(await screen.findByText('Tải thêm kết quả')); expect(await screen.findByText('Kết quả trang sau')).toBeInTheDocument();
    expect(screen.getByText('Báo cáo doanh nghiệp')).toBeInTheDocument(); expect(searchOrganization).toHaveBeenLastCalledWith('org-a', 'Báo cáo', 'tasks', 'task-a');
  });
  it('shows empty and denied states with retry', async () => {
    vi.mocked(searchOrganization).mockRejectedValueOnce({ success: false, error: { code: 'FORBIDDEN' } }).mockResolvedValueOnce(empty);
    view(); fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); query(); expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền');
    fireEvent.click(screen.getByText('Thử lại')); expect(await screen.findByText('Không tìm thấy kết quả phù hợp.')).toBeInTheDocument();
  });
  it('does not render stale query results', async () => {
    const pending = deferred<SearchResult>(); vi.mocked(searchOrganization).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(empty);
    view(); fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); query('cũ'); await waitFor(() => expect(searchOrganization).toHaveBeenCalledTimes(1)); query('mới');
    await screen.findByText('Không tìm thấy kết quả phù hợp.'); await act(async () => pending.resolve(found)); expect(screen.queryByText('Báo cáo doanh nghiệp')).not.toBeInTheDocument();
  });
  it('closes and discards results when switching organization', async () => {
    const pending = deferred<SearchResult>(); vi.mocked(searchOrganization).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(empty);
    const result = view(); fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); query(); await waitFor(() => expect(searchOrganization).toHaveBeenCalledTimes(1));
    state.orgId = 'org-b'; result.rerender(<MemoryRouter><GlobalSearch /></MemoryRouter>); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => pending.resolve(found)); fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); query(); await screen.findByText('Không tìm thấy kết quả phù hợp.');
    expect(searchOrganization).toHaveBeenLastCalledWith('org-b', 'Báo cáo', 'all', undefined); expect(screen.queryByText('Báo cáo doanh nghiệp')).not.toBeInTheDocument();
  });
  it('hides categories without permission and does not open without an organization', () => {
    state.permissions.clear(); const result = view(); fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('option', { name: 'Nhân sự' })).not.toBeInTheDocument(); expect(screen.getByRole('option', { name: 'Thông báo' })).toBeInTheDocument();
    state.orgId = ''; result.rerender(<MemoryRouter><GlobalSearch /></MemoryRouter>); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(searchOrganization).not.toHaveBeenCalled();
  });
});

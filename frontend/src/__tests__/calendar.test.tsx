// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import * as api from '@/api/calendar';
const state = vi.hoisted(() => ({ orgId: 'org-a', permissions: new Set<string>() }));
vi.mock('@/api/calendar');
vi.mock('@/contexts/OrganizationContext', () => ({ useOrganization: () => ({ currentOrg: { id: state.orgId } }) }));
vi.mock('@/hooks/useOrgBootstrapGuard', () => ({ useOrgBootstrapGuard: () => null }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: (key: string) => state.permissions.has(key), isLoading: false }) }));
function view() { return render(<MemoryRouter><CalendarPage /></MemoryRouter>); }
const today = new Date();
const at = (hour: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, 0, 14, 123).toISOString();
const event: api.CalendarEvent = { id: 'event-a', title: 'Họp kế hoạch', kind: 'MEETING', startsAt: at(9), endsAt: at(10), description: 'Nội dung', location: 'Phòng A', status: 'SCHEDULED', createdAt: at(8), updatedAt: at(8) };
beforeEach(() => {
  vi.resetAllMocks(); state.orgId = 'org-a'; state.permissions = new Set(['task:read', 'calendar:read', 'calendar:create', 'calendar:update']);
  vi.mocked(api.listCalendarTasks).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(api.listCalendarEvents).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(api.createCalendarEvent).mockResolvedValue(event); vi.mocked(api.updateCalendarEvent).mockResolvedValue(event);
});
describe('Calendar UI', () => {
  it('displays task deadlines and real event data with timezone and safe links', async () => {
    vi.mocked(api.listCalendarEvents).mockResolvedValue({ items: [event], nextCursor: null });
    vi.mocked(api.listCalendarTasks).mockResolvedValue({ items: [{ id: 'task-a', title: 'Chốt báo cáo', dueAt: at(15), status: 'TODO', priority: 'HIGH', progressPercent: 0 }], nextCursor: null });
    view(); expect(await screen.findByRole('link', { name: 'Chốt báo cáo' })).toHaveAttribute('href', '/tasks/task-a');
    expect(screen.getByRole('button', { name: event.title })).toBeInTheDocument(); expect(screen.getByText(/Múi giờ:/)).toBeInTheDocument();
  });
  it('validates event duration and sends server persistence fields only', async () => {
    view(); fireEvent.click(screen.getByText('Thêm sự kiện')); fireEvent.click(screen.getByText('Lưu sự kiện'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập tiêu đề');
    fireEvent.change(screen.getByLabelText(/Tiêu đề sự kiện/), { target: { value: 'Lịch họp mới' } }); fireEvent.click(screen.getByText('Lưu sự kiện'));
    await waitFor(() => expect(api.createCalendarEvent).toHaveBeenCalledWith('org-a', expect.objectContaining({ title: 'Lịch họp mới', kind: 'MEETING' })));
    expect(Object.keys(vi.mocked(api.createCalendarEvent).mock.calls[0][1]).sort()).toEqual(['description', 'endsAt', 'kind', 'location', 'startsAt', 'title']);
  });
  it('preserves seconds and milliseconds while saving an unchanged event', async () => {
    vi.mocked(api.listCalendarEvents).mockResolvedValue({ items: [event], nextCursor: null }); view(); fireEvent.click(await screen.findByRole('button', { name: event.title }));
    fireEvent.click(screen.getByText('Lưu sự kiện')); await waitFor(() => expect(api.updateCalendarEvent).toHaveBeenCalledWith('org-a', event.id, expect.objectContaining({ startsAt: event.startsAt, endsAt: event.endsAt })));
  });
  it('requires explicit confirmation to cancel and sends only status', async () => {
    vi.mocked(api.listCalendarEvents).mockResolvedValue({ items: [event], nextCursor: null }); view(); fireEvent.click(await screen.findByRole('button', { name: event.title }));
    fireEvent.click(screen.getByText('Hủy sự kiện')); expect(api.updateCalendarEvent).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Xác nhận hủy sự kiện'));
    await waitFor(() => expect(api.updateCalendarEvent).toHaveBeenCalledWith('org-a', event.id, { status: 'CANCELLED' }));
  });
  it('keeps cancelled events and viewers read-only', async () => {
    state.permissions.delete('calendar:update'); state.permissions.delete('calendar:create'); vi.mocked(api.listCalendarEvents).mockResolvedValue({ items: [{ ...event, status: 'CANCELLED' }], nextCursor: null });
    view(); expect(screen.queryByText('Thêm sự kiện')).not.toBeInTheDocument(); fireEvent.click(await screen.findByRole('button', { name: event.title }));
    expect(screen.getByLabelText(/Tiêu đề sự kiện/)).toBeDisabled(); expect(screen.queryByText('Lưu sự kiện')).not.toBeInTheDocument();
  });
  it('does not fetch event data without its read permission', async () => {
    state.permissions = new Set(['task:read']); view(); await screen.findByText('Chưa có lịch trong dữ liệu đã tải của ngày này.');
    expect(api.listCalendarEvents).not.toHaveBeenCalled(); expect(screen.getByText(/Bạn chưa có quyền xem/)).toBeInTheDocument();
  });
  it('handles permission denied, retry and pagination', async () => {
    vi.mocked(api.listCalendarEvents).mockRejectedValueOnce({ success: false, error: { code: 'FORBIDDEN' } })
      .mockResolvedValueOnce({ items: [event], nextCursor: event.id }).mockResolvedValueOnce({ items: [{ ...event, id: 'event-b', title: 'Trang sau' }], nextCursor: null });
    view(); expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền'); fireEvent.click(screen.getByText('Thử lại'));
    fireEvent.click(await screen.findByText('Tải thêm sự kiện')); await screen.findByRole('button', { name: 'Trang sau' });
    expect(api.listCalendarEvents).toHaveBeenLastCalledWith('org-a', expect.any(Object), event.id);
  });
  it('ignores late calendar results after changing organization', async () => {
    let resolve!: (value: { items: api.CalendarEvent[]; nextCursor: null }) => void;
    vi.mocked(api.listCalendarEvents).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ items: [], nextCursor: null });
    const result = view(); state.orgId = 'org-b'; result.rerender(<MemoryRouter><CalendarPage /></MemoryRouter>); await screen.findByText('Chưa có lịch trong dữ liệu đã tải của ngày này.');
    await act(async () => resolve({ items: [event], nextCursor: null })); expect(screen.queryByRole('button', { name: event.title })).not.toBeInTheDocument();
  });
  it('changes the month query and shows denied state when no source is permitted', async () => {
    const result = view(); await screen.findByText('Chưa có lịch trong dữ liệu đã tải của ngày này.'); const first = vi.mocked(api.listCalendarTasks).mock.calls[0][1];
    fireEvent.click(screen.getByLabelText('Tháng sau')); await waitFor(() => expect(api.listCalendarTasks).toHaveBeenCalledTimes(2)); expect(vi.mocked(api.listCalendarTasks).mock.calls[1][1].from).not.toBe(first.from);
    state.permissions.clear(); result.rerender(<MemoryRouter><CalendarPage /></MemoryRouter>); expect(screen.getByText('Bạn cần quyền xem công việc hoặc lịch tổ chức.')).toBeInTheDocument();
  });
});

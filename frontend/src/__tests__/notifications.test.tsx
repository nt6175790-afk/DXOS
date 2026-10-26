// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { ToastProvider } from '@/contexts/ToastContext';

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(() => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' },
    organizations: [],
    isLoading: false,
    setCurrentOrg: vi.fn(),
    refreshOrganizations: vi.fn(),
  })),
}));

const mockListNotifications = vi.fn();
const mockMarkRead = vi.fn();
const mockGetSummary = vi.fn();
const mockMarkAllRead = vi.fn();

vi.mock('@/api/notifications', () => ({
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  markNotificationAsRead: (...args: unknown[]) => mockMarkRead(...args),
  getNotificationSummary: (...args: unknown[]) => mockGetSummary(...args),
  markAllNotificationsAsRead: (...args: unknown[]) => mockMarkAllRead(...args),
}));

vi.mock('@/api/client', () => ({
  isApiError: vi.fn((err: unknown) => typeof err === 'object' && err !== null && 'success' in err),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <NotificationsPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockListNotifications.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', async () => {
    mockListNotifications.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/không có thông báo/i)).toBeInTheDocument();
    });
  });

  it('renders notifications list and marks as read', async () => {
    mockListNotifications.mockResolvedValue({
      items: [
        {
          id: 'n1', organizationId: 'org-1', recipientUserId: 'u1', type: 'task.assigned',
          title: 'Task Assigned', body: 'You have been assigned to task 1', metadata: { taskId: 't1' },
          createdAt: '2024-01-01T00:00:00Z', readAt: null, isRead: false,
        },
      ],
      nextCursor: null,
    });
    mockMarkRead.mockResolvedValue({
      id: 'n1', organizationId: 'org-1', recipientUserId: 'u1', type: 'task.assigned',
      title: 'Task Assigned', body: 'You have been assigned to task 1', metadata: { taskId: 't1' },
      createdAt: '2024-01-01T00:00:00Z', readAt: '2024-01-01T01:00:00Z', isRead: true,
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Task Assigned')).toBeInTheDocument();
      expect(screen.getByText(/you have been assigned/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const readBtn = screen.getByRole('button', { name: /đánh dấu đã đọc/i });
    await user.click(readBtn);
    expect(mockMarkRead).toHaveBeenCalledWith('org-1', 'n1');
  });

  it('renders summary counters and triggers mark all as read', async () => {
    mockGetSummary.mockResolvedValue({
      total: 5,
      unread: 2,
      read: 3,
      categories: {
        work: { total: 3, unread: 2 },
        organization: { total: 2, unread: 0 },
        other: { total: 0, unread: 0 },
      },
    });
    mockListNotifications.mockResolvedValue({
      items: [
        {
          id: 'n1', organizationId: 'org-1', recipientUserId: 'u1', type: 'task.assigned',
          title: 'Task Assigned', body: 'New task assigned', metadata: { taskId: 't1' },
          createdAt: '2024-01-01T00:00:00Z', readAt: null, isRead: false,
        },
      ],
      nextCursor: null,
    });
    mockMarkAllRead.mockResolvedValue({ updatedCount: 2 });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Tổng thông báo')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const markAllBtn = screen.getByRole('button', { name: /đánh dấu tất cả đã đọc/i });
    await user.click(markAllBtn);
    expect(mockMarkAllRead).toHaveBeenCalledWith('org-1');
  });

  it('filters notifications by category', async () => {
    mockListNotifications.mockResolvedValue({ items: [], nextCursor: null });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Công việc')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const workFilterBtn = screen.getByText('Công việc');
    await user.click(workFilterBtn);

    expect(mockListNotifications).toHaveBeenCalledWith('org-1', expect.objectContaining({
      category: 'work',
    }));
  });
});


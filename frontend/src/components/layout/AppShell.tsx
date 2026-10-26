// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useOrganization } from '@/contexts/OrganizationContext';
import { listNotifications } from '@/api/notifications';
import { OrganizationAccessBoundary } from './OrganizationAccessBoundary';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unread, setUnread] = useState<{ orgId: string; count: number } | null>(null);
  const { currentOrg } = useOrganization();

  // Load unread notification count
  useEffect(() => {
    if (!currentOrg) {
      return;
    }
    let isCancelled = false;
    const orgId = currentOrg.id;

    const loadUnread = async () => {
      try {
        const response = await listNotifications(orgId, { state: 'unread', limit: 1 });
        if (!isCancelled) {
          // This page indicates unread presence; it does not provide an exact total.
          setUnread({ orgId, count: response.items.length });
        }
      } catch {
        if (!isCancelled) setUnread(null);
      }
    };
    loadUnread();
    const interval = setInterval(loadUnread, 60000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [currentOrg]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  return (
    <div className="workspace-shell fixed inset-0 flex overflow-hidden">
      <a href="#workspace-content" className="workspace-skip-link">Đến nội dung chính</a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} sidebarOpen={sidebarOpen} unreadCount={unread?.orgId === currentOrg?.id ? unread?.count ?? 0 : 0} />
        <main id="workspace-content" tabIndex={-1} className="workspace-content flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1560px]">
            <OrganizationAccessBoundary><Outlet /></OrganizationAccessBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

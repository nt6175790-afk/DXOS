// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Link } from 'react-router-dom';
import { Menu, Bell } from 'lucide-react';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { UserMenu } from './UserMenu';
import { GlobalSearch } from '@/features/search/GlobalSearch';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';

interface TopBarProps {
  onMenuClick: () => void;
  unreadCount: number;
  sidebarOpen?: boolean;
}

export function TopBar({ onMenuClick, unreadCount, sidebarOpen = false }: TopBarProps) {
  return (
    <header className="workspace-topbar sticky top-0 z-30 border-b h-20 shrink-0 flex items-center px-3 sm:px-6 gap-2 sm:gap-4">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600"
        aria-label="Mở menu điều hướng"
        aria-expanded={sidebarOpen}
        aria-controls="workspace-navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1 flex items-center gap-4">
        <OrganizationSwitcher />
      </div>

      <div className="flex shrink-0 items-center gap-0 sm:gap-2">
        <GlobalSearch />
        <Link
          to="/notifications"
          className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          aria-label={`Thông báo${unreadCount > 0 ? ', Có thông báo chưa đọc' : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 min-w-[1rem] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-medium px-1">
              <span className="sr-only">Có thông báo chưa đọc</span><span aria-hidden="true">•</span>
            </span>
          )}
        </Link>
        <ThemeSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}

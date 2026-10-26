// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { LayoutDashboard, Building2, Users, CheckSquare, CalendarDays, CalendarOff, Clock,
  ClipboardCheck, Bell, FolderOpen, Bot, Settings, X, Banknote, BarChart3, Award,
  FileCheck, GitMerge, Zap } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { canOpenRoute } from './navigation';

const groups = [
  { title: 'Không gian làm việc', items: [
    { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { to: '/tasks', label: 'Công việc', icon: CheckSquare },
    { to: '/calendar', label: 'Lịch sự kiện', icon: CalendarDays },
    { to: '/notifications', label: 'Thông báo', icon: Bell },
    { to: '/reports', label: 'Báo cáo & Phân tích', icon: BarChart3 },
  ] },
  { title: 'Nhân sự & tổ chức', items: [
    { to: '/my-schedule', label: 'Lịch đi làm', icon: CalendarDays },
    { to: '/departments', label: 'Phòng ban', icon: Building2 },
    { to: '/people', label: 'Nhân sự', icon: Users },
    { to: '/attendance', label: 'Chấm công', icon: Clock },
    { to: '/leave', label: 'Nghỉ phép', icon: CalendarOff },
    { to: '/shifts', label: 'Ca làm việc', icon: Clock },
    { to: '/schedules', label: 'Phân ca', icon: CalendarDays },
    { to: '/payroll', label: 'Tiền lương', icon: Banknote },
    { to: '/performance', label: 'Hiệu suất', icon: Award },
  ] },
  { title: 'Vận hành & tài liệu', items: [
    { to: '/approvals', label: 'Phê duyệt', icon: ClipboardCheck },
    { to: '/documents', label: 'Hồ sơ & Tuân thủ', icon: FileCheck },
    { to: '/files', label: 'Tài liệu', icon: FolderOpen },
    { to: '/workflows', label: 'Quy trình', icon: GitMerge },
    { to: '/automation', label: 'Tự động hóa', icon: Zap },
    { to: '/ai', label: 'Trợ lý AI', icon: Bot },
  ] },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { hasPermission } = usePermission();
  return <>
    {open && <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} aria-hidden="true" />}
    <aside id="workspace-navigation" data-open={open} className={clsx(
      'workspace-sidebar fixed inset-y-0 left-0 z-50 w-64 h-full flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
      open ? 'translate-x-0' : '-translate-x-full',
    )} aria-label="Điều hướng chính">
      <div className="flex shrink-0 items-center justify-between h-20 px-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="workspace-logo h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold">DX</div>
          <div><span className="text-lg font-bold tracking-tight">DX-OS</span><p className="text-[11px] text-slate-400 mt-0.5">Quản trị doanh nghiệp</p></div>
        </div>
        <button onClick={onClose} className="lg:hidden p-2 rounded-lg hover:bg-white/10" aria-label="Đóng menu điều hướng"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-6" aria-label="Các phân hệ">
        {groups.map(group => {
          const visible = group.items.filter(item => canOpenRoute(item.to, hasPermission));
          if (!visible.length) return null;
          return <section key={group.title}>
            <h2 className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{group.title}</h2>
            <ul className="space-y-1" role="list">{visible.map(item => <li key={item.to}>
              <NavLink to={item.to} onClick={onClose} className={({isActive}) => clsx('workspace-nav-link', isActive && 'is-active')}>
                <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>{item.label}</span>
              </NavLink>
            </li>)}</ul>
          </section>;
        })}
      </nav>
      <div className="shrink-0 p-3 border-t border-white/10">
        {canOpenRoute('/settings', hasPermission) && <NavLink to="/settings" onClick={onClose} className={({isActive}) => clsx('workspace-nav-link', isActive && 'is-active')}><Settings className="h-[18px] w-[18px]" aria-hidden="true" />Cài đặt</NavLink>}
      </div>
    </aside>
  </>;
}

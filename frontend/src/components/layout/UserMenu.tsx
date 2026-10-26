// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useRef, useEffect } from 'react';
import { User, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { resolvedTheme, resolvedSeason } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu người dùng"
      >
        <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center">
          <User className="h-4 w-4 text-brand-600" aria-hidden="true" />
        </div>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50"
          role="menu"
        >
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-900">{user.displayName || 'Người dùng'}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-100/80">
              <span>Chủ đề:</span>
              <span className="font-semibold text-brand-700">
                {resolvedSeason === 'spring' ? '🌱 Xuân' : resolvedSeason === 'summer' ? '☀️ Hạ' : resolvedSeason === 'autumn' ? '🍂 Thu' : '❄️ Đông'} · {resolvedTheme === 'dark' ? 'Tối' : 'Sáng'}
              </span>
            </div>
          </div>
          <button
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

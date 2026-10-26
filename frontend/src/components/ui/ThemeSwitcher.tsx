// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Laptop, Sparkles, Check } from 'lucide-react';
import { useTheme, type ThemeMode, type SeasonMode } from '@/contexts/ThemeContext';

export function ThemeSwitcher() {
  const {
    themeMode,
    resolvedTheme,
    seasonMode,
    resolvedSeason,
    setThemeMode,
    setSeasonMode,
  } = useTheme();

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

  const seasonIcons: Record<string, string> = {
    spring: '🌱',
    summer: '☀️',
    autumn: '🍂',
    winter: '❄️',
  };

  const seasonNamesVi: Record<string, string> = {
    spring: 'Mùa Xuân',
    summer: 'Mùa Hạ',
    autumn: 'Mùa Thu',
    winter: 'Mùa Đông',
  };

  const themeOptions: Array<{ mode: ThemeMode; label: string; icon: typeof Sun }> = [
    { mode: 'light', label: 'Giao diện Sáng', icon: Sun },
    { mode: 'dark', label: 'Giao diện Tối', icon: Moon },
    { mode: 'system', label: 'Theo hệ thống', icon: Laptop },
  ];

  const seasonOptions: Array<{ mode: SeasonMode; label: string; icon: string }> = [
    { mode: 'auto', label: 'Tự động theo ngày', icon: '🔄' },
    { mode: 'spring', label: 'Mùa Xuân (Tháng 3 - 5)', icon: '🌱' },
    { mode: 'summer', label: 'Mùa Hạ (Tháng 6 - 8)', icon: '☀️' },
    { mode: 'autumn', label: 'Mùa Thu (Tháng 9 - 11)', icon: '🍂' },
    { mode: 'winter', label: 'Mùa Đông (Tháng 12 - 2)', icon: '❄️' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
        aria-label="Tùy chỉnh giao diện và mùa"
        aria-expanded={open}
        title={`Giao diện: ${resolvedTheme === 'dark' ? 'Tối' : 'Sáng'} · ${seasonNamesVi[resolvedSeason]}`}
      >
        <span className="text-sm select-none" aria-hidden="true">
          {seasonIcons[resolvedSeason]}
        </span>
        {resolvedTheme === 'dark' ? (
          <Moon className="h-4 w-4 text-amber-400" />
        ) : (
          <Sun className="h-4 w-4 text-amber-500" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
          role="menu"
        >
          {/* Section 1: Chế độ Sáng / Tối */}
          <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              Chế độ hiển thị
            </span>
            <div className="mt-1 space-y-0.5">
              {themeOptions.map((opt) => {
                const isSelected = themeMode === opt.mode;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.mode}
                    onClick={() => {
                      setThemeMode(opt.mode);
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-brand-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Chủ đề theo Mùa */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                Chủ đề theo mùa
              </span>
              <Sparkles className="h-3 w-3 text-amber-500" />
            </div>
            <div className="space-y-0.5">
              {seasonOptions.map((opt) => {
                const isSelected = seasonMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    onClick={() => {
                      setSeasonMode(opt.mode);
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{opt.icon}</span>
                      <span className="truncate">{opt.label}</span>
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-brand-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Status Summary */}
          <div className="px-3 pt-2 pb-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Đang áp dụng:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {seasonIcons[resolvedSeason]} {seasonNamesVi[resolvedSeason]} ·{' '}
              {resolvedTheme === 'dark' ? 'Tối' : 'Sáng'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
export default ThemeSwitcher;

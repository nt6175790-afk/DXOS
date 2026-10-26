// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ThemeContext, ThemeMode, SeasonMode, ResolvedSeason, ResolvedTheme, getAutoSeason } from './theme-context';
import React, { useEffect, useState, useMemo } from 'react';

const THEME_STORAGE_KEY = 'dxos-theme-mode';
const SEASON_STORAGE_KEY = 'dxos-season-mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {
      // ignore
    }
    return 'system';
  });

  const [seasonMode, setSeasonModeState] = useState<SeasonMode>(() => {
    try {
      const saved = localStorage.getItem(SEASON_STORAGE_KEY);
      if (
        saved === 'auto' ||
        saved === 'spring' ||
        saved === 'summer' ||
        saved === 'autumn' ||
        saved === 'winter'
      ) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'auto';
  });

  // Track system dark mode preference via matchMedia
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);

  // Determine resolved theme
  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (themeMode === 'light') return 'light';
    if (themeMode === 'dark') return 'dark';
    return systemPrefersDark ? 'dark' : 'light';
  }, [themeMode, systemPrefersDark]);

  // Determine resolved season
  const resolvedSeason: ResolvedSeason = useMemo(() => {
    if (seasonMode !== 'auto') return seasonMode;
    return getAutoSeason();
  }, [seasonMode]);

  // Setters with localStorage persistence
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const setSeasonMode = (season: SeasonMode) => {
    setSeasonModeState(season);
    try {
      localStorage.setItem(SEASON_STORAGE_KEY, season);
    } catch {
      // ignore
    }
  };

  const toggleTheme = () => {
    setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  // Synchronize with document element attributes and classes
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    root.setAttribute('data-season', resolvedSeason);

    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme, resolvedSeason]);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        resolvedTheme,
        seasonMode,
        resolvedSeason,
        setThemeMode,
        setSeasonMode,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}


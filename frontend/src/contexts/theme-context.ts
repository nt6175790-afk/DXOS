// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type SeasonMode = 'auto' | 'spring' | 'summer' | 'autumn' | 'winter';
export type ResolvedSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextType {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  seasonMode: SeasonMode;
  resolvedSeason: ResolvedSeason;
  setThemeMode: (mode: ThemeMode) => void;
  setSeasonMode: (season: SeasonMode) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);


export function getAutoSeason(date = new Date()): ResolvedSeason {
  // Spring: Mar 1 - May 31 (month 2, 3, 4 0-indexed)
  // Summer: Jun 1 - Aug 31 (month 5, 6, 7 0-indexed)
  // Autumn: Sep 1 - Nov 30 (month 8, 9, 10 0-indexed)
  // Winter: Dec 1 - Feb 28/29 (month 11, 0, 1 0-indexed)
  const month = date.getMonth(); // 0 = Jan, 8 = Sep
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

const defaultThemeContext: ThemeContextType = {
  themeMode: 'system',
  resolvedTheme: 'light',
  seasonMode: 'auto',
  resolvedSeason: 'autumn',
  setThemeMode: () => {},
  setSeasonMode: () => {},
  toggleTheme: () => {},
};

export function useTheme() {
  const context = useContext(ThemeContext);
  return context || defaultThemeContext;
}

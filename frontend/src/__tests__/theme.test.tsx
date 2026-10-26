// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme, getAutoSeason } from '@/contexts/ThemeContext';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';

function TestConsumer() {
  const {
    themeMode,
    resolvedTheme,
    seasonMode,
    resolvedSeason,
    setThemeMode,
    setSeasonMode,
    toggleTheme,
  } = useTheme();

  return (
    <div>
      <span data-testid="theme-mode">{themeMode}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <span data-testid="season-mode">{seasonMode}</span>
      <span data-testid="resolved-season">{resolvedSeason}</span>
      <button onClick={() => setThemeMode('dark')}>Set Dark</button>
      <button onClick={() => setThemeMode('light')}>Set Light</button>
      <button onClick={() => setThemeMode('system')}>Set System</button>
      <button onClick={() => setSeasonMode('spring')}>Set Spring</button>
      <button onClick={() => setSeasonMode('summer')}>Set Summer</button>
      <button onClick={() => setSeasonMode('autumn')}>Set Autumn</button>
      <button onClick={() => setSeasonMode('winter')}>Set Winter</button>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
}

describe('Seasonal Theme & Light/Dark System', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-season');
  });

  it('determines season correctly based on calendar month', () => {
    // Mar = Spring (month 2 in 0-index)
    expect(getAutoSeason(new Date('2026-03-15T00:00:00Z'))).toBe('spring');
    // Jul = Summer (month 6)
    expect(getAutoSeason(new Date('2026-07-15T00:00:00Z'))).toBe('summer');
    // Sep = Autumn (month 8)
    expect(getAutoSeason(new Date('2026-09-19T00:00:00Z'))).toBe('autumn');
    // Jan = Winter (month 0)
    expect(getAutoSeason(new Date('2026-01-15T00:00:00Z'))).toBe('winter');
    // Dec = Winter (month 11)
    expect(getAutoSeason(new Date('2026-12-15T00:00:00Z'))).toBe('winter');
  });

  it('defaults to system mode and auto season, synchronizing documentElement attributes', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-mode').textContent).toBe('system');
    expect(screen.getByTestId('season-mode').textContent).toBe('auto');

    expect(document.documentElement.getAttribute('data-theme')).toMatch(/light|dark/);
    expect(document.documentElement.getAttribute('data-season')).toMatch(/spring|summer|autumn|winter/);
  });

  it('updates theme mode to light and dark, reflecting in DOM and localStorage', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Set Dark' }));
    expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('dxos-theme-mode')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Set Light' }));
    expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('dxos-theme-mode')).toBe('light');
  });

  it('updates manual season override and persists to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Set Spring' }));
    expect(screen.getByTestId('resolved-season').textContent).toBe('spring');
    expect(document.documentElement.getAttribute('data-season')).toBe('spring');

    await user.click(screen.getByRole('button', { name: 'Set Winter' }));
    expect(screen.getByTestId('resolved-season').textContent).toBe('winter');
    expect(document.documentElement.getAttribute('data-season')).toBe('winter');
    expect(localStorage.getItem('dxos-season-mode')).toBe('winter');
  });

  it('renders ThemeSwitcher and allows toggling theme and seasons via dropdown', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    );

    const switcherBtn = screen.getByRole('button', { name: /Tùy chỉnh giao diện và mùa/i });
    expect(switcherBtn).toBeInTheDocument();

    await user.click(switcherBtn);
    expect(screen.getByText('Chế độ hiển thị')).toBeInTheDocument();
    expect(screen.getByText('Chủ đề theo mùa')).toBeInTheDocument();

    // Click Giao diện Tối
    await user.click(screen.getByText('Giao diện Tối'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Click Mùa Hạ
    await user.click(screen.getByText(/Mùa Hạ/));
    expect(document.documentElement.getAttribute('data-season')).toBe('summer');
  });
});

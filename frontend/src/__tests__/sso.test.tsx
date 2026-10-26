// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completeSso, getSsoLogoutUrl, clearSsoSession } from '@/api/sso';
import { api, setTokens } from '@/api/client';
vi.mock('@/api/client', () => ({ api: { get: vi.fn(), post: vi.fn() }, setTokens: vi.fn(), clearTokens: vi.fn() }));

describe('SSO callback isolation and cleanup', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); window.history.replaceState(null, '', '/auth/sso/callback'); });
  const prepare = (state = 'expected') => {
    sessionStorage.setItem('dxos_sso_attempt', JSON.stringify({ state: 'expected', challenge: 'sealed', created: Date.now() }));
    window.history.replaceState(null, '', '/auth/sso/callback?code=private-code&state=' + state);
  };
  it('rejects login CSRF without a tab-bound attempt', async () => {
    window.history.replaceState(null, '', '/auth/sso/callback?code=foreign&state=foreign');
    await expect(completeSso()).rejects.toThrow(); expect(api.post).not.toHaveBeenCalled(); expect(window.location.search).toBe('');
  });
  it('rejects a mismatched state before contacting backend', async () => {
    prepare('foreign'); await expect(completeSso()).rejects.toThrow(); expect(api.post).not.toHaveBeenCalled();
  });
  it('clears callback URL and attempt, then uses existing DX-OS token storage', async () => {
    prepare(); vi.mocked(api.post).mockResolvedValue({ data: { accessToken: 'local-access', refreshToken: 'local-refresh' } });
    await completeSso(); expect(api.post).toHaveBeenCalledWith('/auth/sso/complete', { code: 'private-code', state: 'expected', challenge: 'sealed' });
    expect(setTokens).toHaveBeenCalledOnce(); expect(window.location.search).toBe(''); expect(sessionStorage.getItem('dxos_sso_attempt')).toBeNull();
    await expect(completeSso()).rejects.toThrow(); expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('rejects expired attempts', async () => {
    prepare(); sessionStorage.setItem('dxos_sso_attempt', JSON.stringify({ state: 'expected', challenge: 'sealed', created: Date.now() - 300001 }));
    await expect(completeSso()).rejects.toThrow(); expect(api.post).not.toHaveBeenCalled();
  });
  it('does not call the IdP logout flow for a password-only tab', async () => {
    await expect(getSsoLogoutUrl()).resolves.toBeNull(); expect(api.get).not.toHaveBeenCalled();
  });
  it('discovers logout once for a completed SSO tab and clears the marker', async () => {
    sessionStorage.setItem('dxos_sso_session', 'true');
    vi.mocked(api.get).mockResolvedValue({ data: { logoutUrl: 'http://localhost:8180/logout' } });
    await expect(getSsoLogoutUrl()).resolves.toBe('http://localhost:8180/logout');
    await expect(getSsoLogoutUrl()).resolves.toBeNull(); expect(api.get).toHaveBeenCalledOnce();
  });
  it('allows local revocation when IdP discovery fails', async () => {
    sessionStorage.setItem('dxos_sso_session', 'true'); vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    await expect(getSsoLogoutUrl()).resolves.toBeNull(); expect(sessionStorage.getItem('dxos_sso_session')).toBeNull();
  });
  it('clears SSO identity when switching to password authentication', () => {
    sessionStorage.setItem('dxos_sso_session', 'true'); clearSsoSession(); expect(sessionStorage.getItem('dxos_sso_session')).toBeNull();
  });
});

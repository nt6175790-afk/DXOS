// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api, clearTokens, setTokens } from './client';
import type { AuthResponse } from './types';

const STORAGE_KEY = 'dxos_sso_attempt';
const SESSION_KEY = 'dxos_sso_session';
export function clearSsoSession(): void { sessionStorage.removeItem(SESSION_KEY); }
export async function getSsoLogoutUrl(): Promise<string | null> {
  if (sessionStorage.getItem(SESSION_KEY) !== 'true') return null;
  clearSsoSession();
  try { return (await api.get<{ logoutUrl: string }>('/auth/sso/logout-url')).data.logoutUrl; }
  catch { return null; } // Local DX-OS revocation still runs if the IdP is unavailable.
}
export async function getSsoConfig(): Promise<{ enabled: boolean }> {
  return (await api.get<{ enabled: boolean }>('/auth/sso/config')).data;
}

export async function startSso(): Promise<void> {
  clearSsoSession();
  const { data } = await api.post<{ authorizationUrl: string; state: string; challenge: string }>('/auth/sso/start');
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ state: data.state, challenge: data.challenge, created: Date.now() }));
  // Prevent a previous account's refresh/bootstrap from racing the new SSO callback.
  clearTokens();
  window.location.assign(data.authorizationUrl);
}

export async function completeSso(): Promise<void> {
  const query = new URLSearchParams(window.location.search);
  const raw = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  // Remove the authorization code before any follow-up navigation or API request.
  window.history.replaceState(null, '', window.location.pathname);
  if (!raw || query.has('error') || !query.get('code')) throw new Error('SSO_FAILED');
  const attempt = JSON.parse(raw) as { state: string; challenge: string; created: number };
  if (query.get('state') !== attempt.state || Date.now() - attempt.created > 300_000) throw new Error('SSO_FAILED');
  const { data } = await api.post<AuthResponse>('/auth/sso/complete', {
    code: query.get('code'), state: attempt.state, challenge: attempt.challenge,
    ...(query.has('iss') ? { iss: query.get('iss') } : {}),
  });
  setTokens(data);
  sessionStorage.setItem(SESSION_KEY, 'true');
}

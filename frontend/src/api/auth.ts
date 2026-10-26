// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api, setTokens, clearTokens, getAccessToken, getRefreshToken } from './client';
import type { LoginRequest, AuthResponse, CurrentUser } from './types';
import axios from 'axios';
import { clearSsoSession } from './sso';

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/login', data);
  clearSsoSession();
  setTokens(response.data);
  return response.data;
}

export async function logout(): Promise<void> {
  try {
    if (getAccessToken()) {
      await api.post('/auth/logout');
    } else {
      // After page refresh, accessToken is null but refreshToken may exist.
      // Try to restore session just to revoke it on the server.
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          const response = await axios.post<AuthResponse>('/api/v1/auth/refresh', { refreshToken });
          setTokens(response.data);
          await api.post('/auth/logout');
        } catch {
          // Refresh failed — session may already be expired/revoked. Continue cleanup.
        }
      }
    }
  } finally {
    clearTokens();
  }
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await api.get<CurrentUser>('/auth/me');
  return response.data;
}

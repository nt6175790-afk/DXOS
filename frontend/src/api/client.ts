// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiError, AuthResponse } from './types';

const API_BASE = '/api/v1';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setTokens(auth: AuthResponse): void {
  accessToken = auth.accessToken;
  localStorage.setItem('dx_refresh_token', auth.refreshToken);
}

export function clearTokens(): void {
  accessToken = null;
  localStorage.removeItem('dx_refresh_token');
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('dx_refresh_token');
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Request interceptor: attach Bearer token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// URLs that should never trigger token refresh (to avoid infinite loops)
const NO_REFRESH_URLS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/sso/start', '/auth/sso/complete', '/auth/sso/config'];

function isNoRefreshUrl(url?: string): boolean {
  if (!url) return false;
  return NO_REFRESH_URLS.some((path) => url.includes(path));
}

// Response interceptor: handle 401 with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !isNoRefreshUrl(originalRequest.url) &&
      !(originalRequest as unknown as Record<string, unknown>)._retry
    ) {
      (originalRequest as unknown as Record<string, unknown>)._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken && originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }
    }
    return Promise.reject(await normalizeError(error));
  }
);

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await axios.post<AuthResponse>(`${API_BASE}/auth/refresh`, {
        refreshToken,
      });
      setTokens(response.data);
      return response.data.accessToken;
    } catch {
      clearTokens();
      window.location.href = '/login';
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function normalizeError(error: AxiosError<ApiError>): Promise<ApiError> {
  // Handle Blob responses (e.g., file download errors)
  const data = error.response?.data as unknown;
  if (data && typeof (data as Blob).text === 'function') {
    try {
      const text = await (data as Blob).text();
      const parsed = JSON.parse(text) as ApiError;
      if (parsed?.error) return parsed;
    } catch {
      // Fall through to default
    }
  } else if (data && typeof Blob !== 'undefined' && (data instanceof Blob || (data as { size?: number; type?: string }).type !== undefined)) {
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(data as Blob);
      });
      const parsed = JSON.parse(text) as ApiError;
      if (parsed?.error) return parsed;
    } catch {
      // Fall through to default
    }
  }
  if (error.response?.data?.error) {
    return error.response.data;
  }
  return {
    success: false,
    error: {
      code: 'NETWORK_ERROR',
      message: error.message || 'Đã xảy ra lỗi không mong muốn.',
      requestId: '',
    },
  };
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    (value as ApiError).success === false &&
    'error' in value
  );
}

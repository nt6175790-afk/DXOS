// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { AuthContext, AuthContextValue, useAuth } from './auth-context';
import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { CurrentUser, LoginRequest, AuthResponse } from '@/api/types';
import { login as apiLogin, logout as apiLogout, getCurrentUser } from '@/api/auth';
import { setTokens, clearTokens, getRefreshToken, refreshAccessToken } from '@/api/client';
import axios from 'axios';
import { completeSso, getSsoLogoutUrl } from '@/api/sso';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Bootstrap: try to restore session from refresh token
  useEffect(() => {
    const bootstrap = async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        setIsLoading(false);
        return;
      }
      try {
        const token = await refreshAccessToken();
        if (token) {
          const currentUser = await getCurrentUser();
          setUser(currentUser);
        } else {
          setUser(null);
        }
      } catch (err) {
        // Only clear tokens on auth errors (401/403). Transient network/server errors
        // should not force re-login.
        if (
          axios.isAxiosError(err) &&
          (err.response?.status === 401 || err.response?.status === 403)
        ) {
          clearTokens();
        }
        // On transient errors, user stays unauthenticated for this session
        // but tokens are preserved for next page load
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    await apiLogin(data);
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  }, []);

  const logout = useCallback(async () => {
    const logoutUrl = await getSsoLogoutUrl();
    try {
      await apiLogout();
    } finally {
      setUser(null);
      if (logoutUrl) window.location.assign(logoutUrl);
    }
  }, []);

  const loginSso = useCallback(async () => {
    await completeSso();
    setUser(await getCurrentUser());
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginSso,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

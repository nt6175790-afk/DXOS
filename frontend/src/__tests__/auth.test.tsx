// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';

// Mock the API modules
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  getRefreshToken: vi.fn(() => null),
  getAccessToken: vi.fn(() => null),
  isApiError: vi.fn((err: unknown) => {
    return typeof err === 'object' && err !== null && 'success' in err && (err as { success: boolean }).success === false;
  }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form with email and password fields', () => {
    renderLogin();
    expect(screen.getByLabelText(/địa chỉ email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mật khẩu/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /đăng nhập/i })).toBeInTheDocument();
  });

  it('shows DX-OS branding', () => {
    renderLogin();
    expect(screen.getByText(/đăng nhập vào dx-os/i)).toBeInTheDocument();
    expect(screen.getByText(/hệ điều hành doanh nghiệp số/i)).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));
    await waitFor(() => {
      expect(screen.getByText(/vui lòng nhập địa chỉ email hợp lệ/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for invalid email', async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/địa chỉ email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/mật khẩu/i), 'password123');
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));
    await waitFor(() => {
      expect(screen.getByText(/vui lòng nhập địa chỉ email hợp lệ/i)).toBeInTheDocument();
    });
  });

  it('shows server error for invalid credentials', async () => {
    const { login } = await import('@/api/auth');
    (login as ReturnType<typeof vi.fn>).mockRejectedValue({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', requestId: 'test-123' },
    });

    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/địa chỉ email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/mật khẩu/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));

    await waitFor(() => {
      expect(screen.getByText(/email hoặc mật khẩu không chính xác/i)).toBeInTheDocument();
    });
  });

  it('displays accessible error messages', async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /đăng nhập/i }));
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  it('has accessible labels for inputs', () => {
    renderLogin();
    const emailInput = screen.getByLabelText(/địa chỉ email/i);
    const passwordInput = screen.getByLabelText(/mật khẩu/i);
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

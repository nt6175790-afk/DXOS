// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react';
import { getSsoConfig, startSso } from '@/api/sso';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { isApiError } from '@/api/client';
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Vui lòng nhập địa chỉ email hợp lệ').min(3).max(320),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu').max(1024),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoPending, setSsoPending] = useState(false);
  useEffect(() => {
    let active = true;
    void getSsoConfig().then((config) => { if (active) setSsoEnabled(config.enabled); }, () => undefined);
    return () => { active = false; };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      await login(data);
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (isApiError(err)) {
        const code = err.error.code;
        if (code === 'INVALID_CREDENTIALS') {
          setServerError('Email hoặc mật khẩu không chính xác.');
        } else if (code === 'ACCOUNT_INACTIVE') {
          setServerError('Tài khoản chưa được kích hoạt. Vui lòng liên hệ quản trị viên.');
        } else if (code === 'ACCOUNT_SUSPENDED') {
          setServerError('Tài khoản của bạn đã bị tạm khóa. Vui lòng liên hệ quản trị viên.');
        } else if (code === 'VALIDATION_FAILED') {
          setServerError(err.error.message);
        } else {
          setServerError('Đã xảy ra lỗi. Vui lòng thử lại.');
        }
      } else {
        setServerError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng hoặc đảm bảo backend đang hoạt động.');
      }
    }
  };

  return (
    <div className="h-full min-h-screen flex items-center justify-center bg-slate-50 px-4 overflow-y-auto">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-brand-600 text-white text-lg font-bold mb-4">
            DX
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Đăng nhập vào DX-OS</h1>
          <p className="mt-1 text-sm text-slate-500">Hệ điều hành Doanh nghiệp số</p>
        </div>

        {/* Login Form */}
        <div className="card p-6">
          {serverError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="label">Địa chỉ email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input-field"
                placeholder="tenban@congty.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <p id="email-error" className="mt-1 text-xs text-red-600" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="label">Mật khẩu</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="input-field"
                placeholder="Nhập mật khẩu của bạn"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
              />
              {errors.password && (
                <p id="password-error" className="mt-1 text-xs text-red-600" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                  Đang đăng nhập...
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>
          </form>
          {ssoEnabled && <button type="button" className="btn-secondary w-full mt-4" disabled={isSubmitting || ssoPending}
            onClick={() => {
              setSsoPending(true); setServerError(null);
              void startSso().catch(() => { setSsoPending(false); setServerError('Không thể bắt đầu đăng nhập SSO. Vui lòng thử lại.'); });
            }}>{ssoPending ? 'Đang chuyển đến SSO…' : 'Đăng nhập SSO doanh nghiệp'}</button>}
        </div>
      </div>
    </div>
  );
}

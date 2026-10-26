// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function SsoCallback() {
  const { loginSso } = useAuth();
  const navigate = useNavigate();
  const pending = useRef<Promise<void> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    // React StrictMode replays effects: exchange the single-use code only once.
    pending.current ??= loginSso();
    void pending.current.then(() => { if (active) navigate('/dashboard', { replace: true }); },
      () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [loginSso, navigate]);
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
    <div className="card p-6 max-w-md text-center" role={failed ? 'alert' : 'status'}>
      <h1 className="text-xl font-semibold">{failed ? 'Đăng nhập SSO chưa thành công' : 'Đang xác thực tài khoản…'}</h1>
      {failed && <><p className="my-4">Phiên đăng nhập có thể đã hết hạn hoặc tài khoản chưa được liên kết. Vui lòng thử lại hoặc liên hệ quản trị viên.</p>
        <Link to="/login" className="btn-primary">Quay lại đăng nhập</Link></>}
    </div>
  </main>;
}

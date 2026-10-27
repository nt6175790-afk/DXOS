// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/LoadingState';
import { accountsApi, type EditableRole, type OrganizationAccount } from '@/api/accounts';
import { listAllRoles } from '@/api/roles';
import { isApiError } from '@/api/client';
import type { Permission, RoleSummary } from '@/api/types';
const field = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-slate-900';
const primary = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50';
function message(error: unknown) {
  if (isApiError(error) && error.error.code === 'FORBIDDEN') return 'Bạn không có quyền thao tác hoặc đang sửa tài khoản/vai trò của chính mình.';
  if (isApiError(error) && error.error.code === 'CONFLICT') return 'Dữ liệu đã tồn tại hoặc đang được sử dụng. Hãy tải lại; cần gỡ gán vai trò trước khi xóa/tắt.';
  return 'Không thực hiện được. Kiểm tra dữ liệu, quyền truy cập và thử tải lại.';
}
export function AccountAdministration() {
  const { currentOrg } = useOrganization(); const { user } = useAuth(); const { hasPermission: can } = usePermission();
  const org = currentOrg?.id;
  const [accounts, setAccounts] = useState<OrganizationAccount[]>([]); const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [account, setAccount] = useState<OrganizationAccount | 'new' | null>(null);
  const [role, setRole] = useState<EditableRole | 'new' | null>(null);
  const [remove, setRemove] = useState<{ kind: 'user' | 'role'; id: string; label: string } | null>(null);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [status, setStatus] = useState('ACTIVE');
  const [key, setKey] = useState(''); const [selected, setSelected] = useState<string[]>([]); const [active, setActive] = useState(true);
  const generation = useRef(0);
  const canReadUsers = can('user:read'), canReadRoles = can('role:read');
  const load = useCallback(async (after?: string) => {
    if (!org) return; const g = generation.current; setLoading(true); setError('');
    try {
      const [users, roleList, keys] = await Promise.all([
        canReadUsers ? accountsApi.list(org, after) : Promise.resolve({ items: [], nextCursor: null }),
        canReadRoles ? listAllRoles(org) : Promise.resolve([]),
        canReadRoles ? accountsApi.catalog(org) : Promise.resolve({ items: [] }),
      ]);
      if (g !== generation.current) return;
      setAccounts(previous => after ? [...previous, ...users.items] : users.items); setCursor(users.nextCursor); setRoles(roleList); setCatalog(keys.items.map(k => k.key));
    } catch (e) { if (g === generation.current) setError(message(e)); }
    finally { if (g === generation.current) setLoading(false); }
  }, [org, canReadUsers, canReadRoles]);
  useEffect(() => { const current = ++generation.current; setBusy(false); setAccounts([]); setRoles([]); setAccount(null); setRole(null); setRemove(null); setPassword(''); setSuccess(''); void load(); return () => { generation.current = current + 1; }; }, [load]);
  const mutate = async (work: () => Promise<unknown>, done: string) => {
    if (busy) return; const g = generation.current; setBusy(true); setError(''); setSuccess('');
    try { await work(); if (g !== generation.current) return; setAccount(null); setRole(null); setRemove(null); setSuccess(done); await load(); }
    catch (e) { if (g === generation.current) setError(message(e)); }
    finally { if (g === generation.current) setBusy(false); }
  };
  const openUser = (value: OrganizationAccount | 'new') => { setError(''); setAccount(value); setName(value === 'new' ? '' : value.displayName ?? ''); setEmail(value === 'new' ? '' : value.email); setStatus(value === 'new' ? 'ACTIVE' : value.membershipStatus); setPassword(''); };
  const openRole = async (value?: RoleSummary) => {
    if (!org) return; const g = generation.current; setError('');
    try { const row = value ? await accountsApi.role(org, value.id) : 'new'; if (g !== generation.current) return; setRole(row); setName(row === 'new' ? '' : row.name); setKey(row === 'new' ? '' : row.key); setSelected(row === 'new' ? [] : row.permissionKeys); setActive(row === 'new' || row.isActive); }
    catch (e) { if (g === generation.current) setError(message(e)); }
  };
  if (!org) return null;
  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
    <div className="flex justify-end"><button className={button} disabled={loading || busy} onClick={() => void load()}>Tải lại</button></div>
    {loading && <LoadingState message="Đang tải tài khoản và vai trò..." />}
    {canReadUsers && <section className="card space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Tài khoản trong tổ chức</h2>{can('user:create') && <button className={primary} onClick={() => openUser('new')}>Tạo tài khoản</button>}</div>
      {!loading && !accounts.length && <p className="text-sm text-slate-500">Chưa có tài khoản.</p>}
      <div className="divide-y">{accounts.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{a.displayName || a.email}</p><p className="text-sm text-slate-500">{a.email} · {a.membershipStatus}</p></div><div className="flex gap-2">{can('user:update') && a.id !== user?.id && <button className={button} onClick={() => openUser(a)}>Sửa tài khoản</button>}{can('user:delete') && a.id !== user?.id && a.membershipStatus !== 'REMOVED' && <button className={button + ' text-red-700'} onClick={() => setRemove({ kind: 'user', id: a.id, label: a.email })}>Gỡ khỏi tổ chức</button>}</div></div>)}</div>
      {cursor && <button className={button} disabled={loading} onClick={() => void load(cursor)}>Xem thêm tài khoản</button>}
    </section>}
    {canReadRoles && <section className="card space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Danh mục vai trò</h2>{can('role:create') && <button className={primary} onClick={() => void openRole()}>Tạo vai trò</button>}</div><p className="text-sm text-slate-500">Vai trò mới chưa tự gán cho ai. Gán/gỡ tại “Thành viên & Vai trò”.</p>
      <div className="divide-y">{roles.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{r.name}</p><p className="text-sm text-slate-500">{r.key} · {r.isActive ? 'Đang hoạt động' : 'Đã tắt'}</p></div><div className="flex gap-2"><button className={button} onClick={() => void openRole(r)}>{can('role:update') ? 'Xem / sửa quyền' : 'Xem quyền'}</button>{can('role:delete') && <button className={button + ' text-red-700'} onClick={() => setRemove({ kind: 'role', id: r.id, label: r.name })}>Xóa vai trò</button>}</div></div>)}</div>
    </section>}
    <Modal open={Boolean(account)} onClose={() => { if (!busy) { setAccount(null); setPassword(''); } }} title={account === 'new' ? 'Tạo tài khoản' : 'Sửa tài khoản'}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!account) return; if (account === 'new') { const input = { email, displayName: name, password }; setPassword(''); void mutate(() => accountsApi.create(org, input), 'Đã tạo tài khoản. Tiếp theo, gán vai trò và liên kết hồ sơ nhân sự khi cần.'); } else { const id = account.id; void mutate(() => accountsApi.update(org, id, { displayName: name, membershipStatus: status }), 'Đã cập nhật tài khoản trong tổ chức.'); } }}>
        <label className="block text-sm">Họ tên<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} className={field} /></label>
        <label className="block text-sm">Email<input required type="email" disabled={account !== 'new'} value={email} onChange={e => setEmail(e.target.value)} className={field} /></label>
        {account === 'new' ? <label className="block text-sm">Mật khẩu ban đầu (ít nhất 16 ký tự)<input required type="password" autoComplete="new-password" minLength={16} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className={field} /></label> : <label className="block text-sm">Trạng thái thành viên<select value={status} onChange={e => setStatus(e.target.value)} className={field}><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option><option value="SUSPENDED">Tạm khóa</option></select></label>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button className={primary} disabled={busy}>Lưu tài khoản</button>
      </form>
    </Modal>
    <Modal open={Boolean(role)} onClose={() => { if (!busy) setRole(null); }} title={role === 'new' ? 'Tạo vai trò' : 'Thông tin vai trò'} size="lg">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!role) return; const permissionKeys = [...selected].sort(); void mutate(() => role === 'new' ? accountsApi.createRole(org, { key, name, permissionKeys }) : accountsApi.updateRole(org, role.id, { name, isActive: active, ...(can('role:assign') ? { permissionKeys } : {}) }), 'Đã lưu vai trò.'); }}>
        <label className="block text-sm">Mã vai trò<input required pattern="[a-z][a-z0-9-]{1,62}" disabled={role !== 'new'} value={key} onChange={e => setKey(e.target.value)} className={field} /></label>
        <label className="block text-sm">Tên vai trò<input required maxLength={100} disabled={role !== 'new' && !can('role:update')} value={name} onChange={e => setName(e.target.value)} className={field} /></label>
        {role !== 'new' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} disabled={!can('role:update')} onChange={e => setActive(e.target.checked)} />Vai trò đang hoạt động</label>}
        <fieldset className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3"><legend className="px-1 text-sm font-medium">Quyền được cấp</legend>{catalog.map(p => <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(p)} disabled={!can('role:assign') || !can(p as Permission) || (role !== 'new' && !can('role:update'))} onChange={e => setSelected(previous => e.target.checked ? [...previous, p] : previous.filter(x => x !== p))} />{p}</label>)}</fieldset>
        <p className="text-xs text-slate-500">Chỉ cấp quyền bạn đang có; không thể sửa vai trò đang gán cho chính mình.</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {(role === 'new' ? can('role:create') : can('role:update')) && <button className={primary} disabled={busy}>Lưu vai trò</button>}
      </form>
    </Modal>
    <Modal open={Boolean(remove)} onClose={() => { if (!busy) setRemove(null); }} title="Xác nhận thao tác">
      <p className="mb-4 text-sm">{remove?.kind === 'user' ? 'Gỡ thành viên khỏi tổ chức này, giữ nguyên lịch sử và tài khoản ở tổ chức khác:' : 'Xóa vai trò chưa được gán:'} <strong>{remove?.label}</strong></p>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}<div className="flex gap-3"><button className={button} disabled={busy} onClick={() => setRemove(null)}>Hủy</button><button className={primary} disabled={busy} onClick={() => { if (!remove) return; const target = remove; void mutate(() => target.kind === 'user' ? accountsApi.remove(org, target.id) : accountsApi.deleteRole(org, target.id), 'Đã hoàn tất thao tác.'); }}>Xác nhận</button></div>
    </Modal>
  </div>;
}

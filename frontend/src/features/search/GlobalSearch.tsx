import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, ArrowUpRight, CheckSquare, Calendar, Bell, Sparkles, Folder, Users } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { searchOrganization, type SearchCategory, type SearchResult } from '@/api/search';
import { isApiError } from '@/api/client';
import type { Permission } from '@/api/types';

const categories: SearchCategory[] = ['tasks', 'employees', 'documents', 'departments', 'notifications'];
const labels: Record<SearchCategory, string> = { tasks: 'Công việc', employees: 'Nhân sự', documents: 'Tài liệu', departments: 'Phòng ban', notifications: 'Thông báo' };
const permissions: Record<SearchCategory, Permission | null> = { tasks: 'task:read', employees: 'employee:read', documents: 'file:read', departments: 'department:read', notifications: null };
const route = (type: SearchCategory, id: string) => type === 'tasks' ? `/tasks/${id}` : ({ employees: '/people', documents: '/files', departments: '/departments', notifications: '/notifications' }[type]);
const shortcuts = [
  { to: '/tasks', label: 'Công việc', icon: CheckSquare, grants: ['task:read'] },
  { to: '/calendar', label: 'Lịch làm việc', icon: Calendar, grants: ['task:read', 'calendar:read'] },
  { to: '/people', label: 'Nhân sự', icon: Users, grants: ['employee:read'] },
  { to: '/files', label: 'Kho tài liệu', icon: Folder, grants: ['file:read'] },
  { to: '/notifications', label: 'Thông báo', icon: Bell, grants: [] },
  { to: '/ai', label: 'Trợ lý AI', icon: Sparkles, grants: ['ai:use'] },
] as const;

export function GlobalSearch() {
  const { currentOrg } = useOrganization();
  if (!currentOrg) return null;
  return <ScopedSearch key={currentOrg.id} orgId={currentOrg.id} />;
}
function ScopedSearch({ orgId }: { orgId: string }) {
  const { hasPermission, isLoading } = usePermission();
  const permissionKey = shortcuts.map((shortcut) => shortcut.grants.some((grant) => hasPermission(grant))).join(':') + ':' + hasPermission('department:read');
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen((value) => !value); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const close = useCallback(() => { setOpen(false); button.current?.focus(); }, []);
  return <>
    <button ref={button} className="flex items-center gap-2 p-2 sm:px-3 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm" onClick={() => setOpen(true)} aria-label="Tìm kiếm toàn tổ chức (Ctrl+K)">
      <Search className="h-4 w-4" /><span className="hidden md:inline">Tìm kiếm...</span><kbd className="hidden xl:inline text-xs border rounded px-1">Ctrl K</kbd>
    </button>
    {open && !isLoading && <SearchDialog key={permissionKey} orgId={orgId} onClose={close} />}
  </>;
}
function SearchDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useId();
  const { hasPermission } = usePermission();
  const [q, setQuery] = useState('');
  const [type, setType] = useState<SearchCategory | 'all'>('all');
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  const query = q.trim();
  const scope = JSON.stringify([orgId, query, type]);
  const [state, setState] = useState<{ scope: string; result: SearchResult | null; loading: boolean; error: unknown } | null>(null);
  const current = state?.scope === scope ? state : null;
  const visibleCategories = categories.filter((category) => !permissions[category] || hasPermission(permissions[category]!));
  useEffect(() => { dialog.current?.showModal(); input.current?.focus(); }, []);
  const load = useCallback(async (after?: string) => {
    const id = ++request.current;
    setState((previous) => ({ scope, result: after && previous?.scope === scope ? previous.result : null, loading: true, error: null }));
    try {
      const result = await searchOrganization(orgId, query, type, after);
      if (id !== request.current) return;
      setState((previous) => {
        if (after && type !== 'all' && result.groups[type] && previous?.scope === scope) {
          const old = previous.result?.groups[type]?.items ?? [];
          result.groups[type]!.items = [...old, ...result.groups[type]!.items.filter((item) => !old.some((row) => row.id === item.id))];
        }
        return { scope, result, loading: false, error: null };
      });
    } catch (error: unknown) {
      if (id === request.current) setState((previous) => ({ scope, result: after && previous?.scope === scope ? previous.result : null, loading: false, error }));
    }
  }, [orgId, query, type, scope]);
  useEffect(() => {
    const generation = request;
    if (query.length < 2) { generation.current++; return; }
    const timeout = window.setTimeout(() => void load(), 250);
    return () => { window.clearTimeout(timeout); generation.current++; };
  }, [query, load, retry]);
  const groups = current?.result?.groups;
  const count = visibleCategories.reduce((total, category) => total + (groups?.[category]?.items.length ?? 0), 0);
  return <dialog ref={dialog} aria-labelledby={heading} onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="m-auto w-[calc(100%_-_2rem)] max-w-2xl rounded-xl shadow-xl p-0 backdrop:bg-slate-900/50"
    onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (event.target instanceof HTMLSelectElement) return;
      const links = Array.from(dialog.current?.querySelectorAll<HTMLAnchorElement>('[data-search-result]') ?? []);
      if (!links.length) return;
      event.preventDefault(); const index = links.findIndex((link) => link === document.activeElement);
      const next = index < 0 ? event.key === 'ArrowDown' ? 0 : links.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links[next]?.focus();
    }}>
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"><h2 id={heading} className="font-semibold">Tìm kiếm trong tổ chức</h2>
      <button aria-label="Đóng tìm kiếm" className="p-1 text-slate-500" onClick={onClose}><X className="h-5 w-5" /></button></div>
    <div className="p-5">
      <label className="sr-only" htmlFor={`${heading}-query`}>Từ khóa tìm kiếm</label>
      <input id={`${heading}-query`} ref={input} className="input-field" value={q} onChange={(event) => setQuery(event.target.value)} maxLength={100} autoComplete="off" placeholder="Tìm công việc, nhân sự, tài liệu..." />
      <label className="sr-only" htmlFor={`${heading}-category`}>Loại kết quả</label>
      <select id={`${heading}-category`} className="input-field mt-3" value={type} onChange={(event) => setType(event.target.value as SearchCategory | 'all')}>
        <option value="all">Tất cả mục có quyền xem</option>{visibleCategories.map((category) => <option value={category} key={category}>{labels[category]}</option>)}
      </select>
      <div className="max-h-[55vh] overflow-y-auto mt-4" aria-live="polite">
        {query.length < 2 ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Nhập ít nhất 2 ký tự để tìm kiếm.</p>
            <div className="pt-2 border-t border-slate-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Truy cập nhanh</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {shortcuts.filter((shortcut) => shortcut.grants.length === 0 || shortcut.grants.some((grant) => hasPermission(grant))).map((shortcut) => <Link key={shortcut.to} to={shortcut.to} onClick={onClose} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-100 text-sm text-slate-700 transition-colors">
                  <div className="p-1 rounded bg-brand-50 text-brand-600"><shortcut.icon className="h-4 w-4" /></div>
                  <span className="font-medium">{shortcut.label}</span>
                </Link>)}
              </div>
            </div>
          </div>
        ) : !current || current.loading ? <p role="status" className="text-sm text-slate-500">Đang tìm kiếm...</p> : null}
        {current?.error ? <p role="alert" className="text-sm text-red-700">{isApiError(current.error) && current.error.error.code === 'FORBIDDEN' ? 'Bạn không có quyền tìm kiếm dữ liệu này.' : 'Không thể tìm kiếm. Vui lòng thử lại.'} <button className="underline" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></p> : null}
        {query.length >= 2 && current && !current.loading && !current.error && count === 0 && <p className="text-sm text-slate-500">Không tìm thấy kết quả phù hợp.</p>}
        {visibleCategories.map((category) => {
          const group = groups?.[category]; if (!group?.items.length) return null;
          return <section key={category} className="mb-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{labels[category]}</h3>
            <ul>{group.items.map((item) => <li key={item.id}><Link data-search-result className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-brand-50 focus:bg-brand-50 focus:outline-none" to={route(category, item.id)} onClick={onClose}>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{item.title}</p>{item.subtitle && <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>}</div><ArrowUpRight className="h-4 w-4 text-slate-400" />
            </Link></li>)}</ul>
            {group.nextCursor && <button className="text-xs text-brand-600 mt-2 px-3" disabled={current?.loading} onClick={() => { if (type === 'all') setType(category); else void load(group.nextCursor!); }}>{type === 'all' ? 'Xem thêm kết quả' : 'Tải thêm kết quả'}</button>}
          </section>;
        })}
      </div>
      <p className="text-xs text-slate-400 mt-4">↑ ↓ chọn · Enter mở · Esc đóng</p>
    </div>
  </dialog>;
}

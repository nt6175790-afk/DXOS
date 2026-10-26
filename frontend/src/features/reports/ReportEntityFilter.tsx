// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react';
import { listDepartments } from '@/api/departments';
import { listEmployees } from '@/api/employees';

export function ReportEntityFilter({ org, kind, value, onChange }: { org: string; kind: 'department' | 'employee'; value: string; onChange: (id: string) => void }) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [after, setAfter] = useState<string>();
  const [error, setError] = useState(false), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(false);
    const load = kind === 'department' ? listDepartments(org, { limit: 50, after }).then((p) => ({ ...p, items: p.items.map((r) => ({ id: r.id, name: r.name })) })) : listEmployees(org, { limit: 50, after }).then((p) => ({ ...p, items: p.items.map((r) => ({ id: r.id, name: r.displayName })) }));
    load.then((p) => { if (active) { setItems((prev) => after ? [...new Map([...prev, ...p.items].map((r) => [r.id, r])).values()] : p.items); setCursor(p.nextCursor); } }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [org, kind, after, retry]);
  const label = kind === 'department' ? 'Phòng ban' : 'Nhân viên';
  const filterId = `report-filter-${kind}`;
  return <div className="min-w-0"><label htmlFor={filterId} className="block text-xs font-medium text-slate-600">{label}</label><select id={filterId} aria-label={label} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Tất cả</option>{items.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
    {loading && <span className="text-xs text-slate-500">Đang tải lựa chọn…</span>}
    {error ? <button type="button" className="text-xs text-red-600" onClick={() => setRetry((n) => n + 1)}>Thử tải lại {label.toLowerCase()}</button> : cursor && <button disabled={loading} type="button" className="text-xs text-brand-600" onClick={() => setAfter(cursor)}>Tải thêm {label.toLowerCase()}</button>}
  </div>;
}

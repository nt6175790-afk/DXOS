// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { count } from './report-format';
export function ReportChart({ title, points }: { title: string; points: { label: string; value: number }[] }) {
  if (!points.some((p) => p.value !== 0)) return <p className="py-8 text-center text-sm text-slate-500">Chưa có dữ liệu cho {title.toLowerCase()} trong khoảng đã chọn.</p>;
  const max = Math.max(1, ...points.map((p) => p.value));
  const path = points.map((p, i) => `${30 + i * 540 / Math.max(1, points.length - 1)},${145 - p.value / max * 120}`).join(' ');
  return <div>
    <svg viewBox="0 0 600 180" className="w-full max-h-56" role="img" aria-label={title}>
      <title>{title}</title><path d="M30 15V145H575" stroke="#cbd5e1" fill="none" />
      <text x="0" y="20" fontSize="10" fill="#64748b">{count(max)}</text>
      <polyline points={path} fill="none" stroke="#4f46e5" strokeWidth="2.5" />
      {points.length === 1 && <circle cx="30" cy="25" r="4" fill="#4f46e5" />}
      <text x="30" y="170" fontSize="11" fill="#64748b">{points[0]?.label}</text>
      <text x="575" y="170" textAnchor="end" fontSize="11" fill="#64748b">{points[points.length - 1]?.label}</text>
    </svg>
    <details className="text-sm text-slate-600"><summary className="cursor-pointer">Xem dữ liệu biểu đồ: {title}</summary><div className="max-h-52 overflow-auto"><table className="w-full text-left"><caption className="sr-only">{title}</caption><thead><tr><th>Ngày bắt đầu nhóm</th><th>Giá trị</th></tr></thead><tbody>{points.map((p) => <tr key={p.label}><td>{p.label}</td><td>{count(p.value)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

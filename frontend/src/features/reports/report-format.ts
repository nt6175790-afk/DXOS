// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { ReportFilters } from '@/api/reports';
export const count = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
export const percent = (value: number | null | undefined) => value == null ? '—' : `${count(value)}%`;
// Group decimal text directly: large monetary totals must not pass through floating-point arithmetic.
export function amount(value: string | null, currency: string) {
  if (value === null) return '—';
  const [whole, fraction = '00'] = value.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction} ${currency}`;
}
export function initialFilters(): ReportFilters {
  const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  return { dateFrom: `${date.slice(0, 7)}-01`, dateTo: date, interval: 'day', payrollStatus: 'FINALIZED' };
}
export function validRange(q: Pick<ReportFilters, 'dateFrom' | 'dateTo'>) {
  const from = new Date(`${q.dateFrom}T00:00:00Z`), to = new Date(`${q.dateTo}T00:00:00Z`);
  return [from, to].every((d) => Number.isFinite(d.getTime()) && d.getUTCFullYear() >= 1000 && d.getUTCFullYear() <= 9998) && from.toISOString().slice(0, 10) === q.dateFrom && to.toISOString().slice(0, 10) === q.dateTo && to >= from && to.getTime() - from.getTime() < 366 * 86400000;
}

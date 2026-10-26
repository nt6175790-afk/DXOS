// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReportQueryDto } from './reports.dto';
import type { Counters, Trend } from './reports.types';

const DAY = 86_400_000;
export function reportRange(q: Pick<ReportQueryDto, 'dateFrom' | 'dateTo'>) {
  const parse = (s: string) => {
    const d = new Date(`${s}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s || d.getUTCFullYear() < 1000 || d.getUTCFullYear() > 9998) throw new BadRequestException('Invalid report date.');
    return d;
  };
  const start = parse(q.dateFrom), end = parse(q.dateTo);
  if (start > end || (end.getTime() - start.getTime()) / DAY >= 366) throw new BadRequestException('Report range must be 1 to 366 days.');
  return { start, end, utcStart: new Date(start.getTime() - 7 * 3600000), utcEnd: new Date(end.getTime() + DAY - 7 * 3600000) };
}
export function bucket(date: string, interval: ReportQueryDto['interval']): string {
  if (interval === 'month') return `${date.slice(0, 7)}-01`;
  if (interval === 'day') return date;
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
export function trend(rows: { bucket: string; metrics: Counters }[], q: ReportQueryDto, keys: string[]): Trend[] {
  const range = reportRange(q), groups = new Map<string, Counters>();
  for (let t = range.start.getTime(); t <= range.end.getTime(); t += DAY) groups.set(bucket(new Date(t).toISOString().slice(0, 10), q.interval), Object.fromEntries(keys.map((key) => [key, 0])));
  for (const row of rows) {
    const group = groups.get(bucket(row.bucket, q.interval));
    if (group) for (const key of keys) group[key] = (group[key] ?? 0) + (row.metrics[key] ?? 0);
  }
  return [...groups].map(([date, metrics]) => ({ bucket: date, metrics }));
}
export const rate = (numerator: number, denominator: number) => denominator ? Math.round(numerator / denominator * 10000) / 100 : null;
export const money = (value: Prisma.Decimal | string | number | null) => new Prisma.Decimal(value ?? 0).toFixed(2);
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // ASCII controls and whitespace can hide spreadsheet formula prefixes.
  const first = [...text].find((char) => char.charCodeAt(0) > 32 && char.charCodeAt(0) !== 127 && char.trim() !== '');
  if (first && '=+@-'.includes(first)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export const makeCsv = (rows: unknown[][]) => '\uFEFF' + [['section', 'bucket', 'departmentId', 'departmentName', 'currency', 'metric', 'value'], ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { IsIn, IsOptional, Matches } from 'class-validator';
import { ToolArgumentError } from '../tools/tool.types';
import { DAY_MS, VN_OFFSET_MS } from './vn-time';

/** Time keywords the model may use instead of computing dates itself (spec 9.3, P8). Weeks start on Monday. */
export const PERIODS = [
  'today', 'yesterday', 'tomorrow', 'this_week', 'last_week', 'next_week',
  'last_7_days', 'next_7_days', 'last_30_days', 'next_30_days', 'this_month', 'last_month', 'next_month', 'this_quarter', 'this_year',
] as const;
export type Period = (typeof PERIODS)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mixin fields for tools that take a time range. Explicit dates win over `period`. */
export class PeriodArgs {
  @IsOptional() @IsIn(PERIODS) period?: Period;
  @IsOptional() @Matches(DATE) fromDate?: string;
  @IsOptional() @Matches(DATE) toDate?: string;
}

export function periodSchema(defaultPeriod: Period, maxDays: number): Record<string, unknown> {
  return {
    period: { type: 'string', enum: [...PERIODS], description: `Time range in Vietnam time. Default ${defaultPeriod}.` },
    fromDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description: `Only when the user names a specific date (YYYY-MM-DD); overrides period. For relative ranges use period. Max ${maxDays} days.` },
    toDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Explicit end date, inclusive. Defaults to fromDate.' },
  };
}

export interface DateRange {
  /** Inclusive local dates (Asia/Ho_Chi_Minh). */
  fromDate: string;
  toDate: string;
  days: number;
  /** [startUtc, endUtc) instants covering the local dates. */
  startUtc: Date;
  endUtc: Date;
}

/** The range as the model should repeat it: dd/MM/yyyy dates, so it never converts ISO dates itself. */
export function rangeView(range: DateRange): { from: string; to: string; days: number } {
  const vn = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
  return { from: vn(range.fromDate), to: vn(range.toDate), days: range.days };
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Local calendar date of `now` as a UTC-midnight Date (how DATE columns such as work_date are stored). */
export function vnToday(now: Date): Date {
  const local = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

export function dateOnly(value: string): Date {
  const date = new Date(value + 'T00:00:00Z');
  if (!DATE.test(value) || Number.isNaN(date.getTime()) || iso(date) !== value) throw new ToolArgumentError('INVALID_DATE');
  return date;
}

function range(from: Date, to: Date, maxDays: number): DateRange {
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (days < 1) throw new ToolArgumentError('INVALID_DATE_RANGE');
  if (days > maxDays) throw new ToolArgumentError('RANGE_TOO_LONG');
  return {
    fromDate: iso(from), toDate: iso(to), days,
    startUtc: new Date(from.getTime() - VN_OFFSET_MS), endUtc: new Date(to.getTime() + DAY_MS - VN_OFFSET_MS),
  };
}

export function resolveRange(args: PeriodArgs, now: Date, fallback: Period, maxDays: number): DateRange {
  if (args.fromDate || args.toDate) {
    const from = dateOnly(args.fromDate ?? args.toDate!);
    return range(from, dateOnly(args.toDate ?? args.fromDate!), maxDays);
  }
  const today = vnToday(now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const shift = (days: number) => new Date(today.getTime() + days * DAY_MS);
  const monday = shift(-((today.getUTCDay() + 6) % 7));
  const weekFrom = (weeks: number) => new Date(monday.getTime() + weeks * 7 * DAY_MS);
  switch (args.period ?? fallback) {
    case 'today': return range(today, today, maxDays);
    case 'yesterday': return range(shift(-1), shift(-1), maxDays);
    case 'tomorrow': return range(shift(1), shift(1), maxDays);
    case 'this_week': return range(weekFrom(0), new Date(weekFrom(1).getTime() - DAY_MS), maxDays);
    case 'last_week': return range(weekFrom(-1), new Date(weekFrom(0).getTime() - DAY_MS), maxDays);
    case 'next_week': return range(weekFrom(1), new Date(weekFrom(2).getTime() - DAY_MS), maxDays);
    case 'last_7_days': return range(shift(-6), today, maxDays);
    case 'next_7_days': return range(today, shift(6), maxDays);
    case 'this_month': return range(new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 0)), maxDays);
    case 'last_month': return range(new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0)), maxDays);
    case 'last_30_days': return range(shift(-29), today, maxDays);
    case 'next_30_days': return range(today, shift(29), maxDays);
    case 'next_month': return range(new Date(Date.UTC(y, m + 1, 1)), new Date(Date.UTC(y, m + 2, 0)), maxDays);
    case 'this_quarter': {
      const q = Math.floor(m / 3) * 3;
      return range(new Date(Date.UTC(y, q, 1)), new Date(Date.UTC(y, q + 3, 0)), maxDays);
    }
    case 'this_year': return range(new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y, 11, 31)), maxDays);
  }
}

/**
 * The period right before `current` for comparisons: the previous calendar month / quarter / year when `current`
 * came from such a keyword ("this month vs last month"), otherwise the same number of days just before it.
 */
export function previousRange(current: DateRange, maxDays: number, period?: Period): DateRange {
  const from = dateOnly(current.fromDate);
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  if (period === 'this_month' || period === 'last_month') return range(new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0)), maxDays);
  if (period === 'this_quarter') return range(new Date(Date.UTC(y, m - 3, 1)), new Date(Date.UTC(y, m, 0)), maxDays);
  if (period === 'this_year') return range(new Date(Date.UTC(y - 1, 0, 1)), new Date(Date.UTC(y - 1, 11, 31)), maxDays);
  return range(new Date(from.getTime() - current.days * DAY_MS), new Date(from.getTime() - DAY_MS), maxDays);
}

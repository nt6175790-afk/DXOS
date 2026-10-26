// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { previousRange, resolveRange, vnToday } from '../../backend/src/modules/ai/agent/period';
import { ToolArgumentError } from '../../backend/src/modules/ai/tools/tool.types';

// Saturday 24/10/2026 10:00 in Vietnam.
const now = new Date('2026-10-24T03:00:00Z');
const r = (period: Parameters<typeof resolveRange>[0]['period'], max = 400) => {
  const range = resolveRange({ period }, now, 'today', max);
  return [range.fromDate, range.toDate];
};

describe('period resolution in Vietnam time', () => {
  it.each([
    ['today', '2026-10-24', '2026-10-24'],
    ['yesterday', '2026-10-23', '2026-10-23'],
    ['tomorrow', '2026-10-25', '2026-10-25'],
    ['this_week', '2026-10-19', '2026-10-25'],
    ['last_week', '2026-10-12', '2026-10-18'],
    ['next_week', '2026-10-26', '2026-11-01'],
    ['last_7_days', '2026-10-18', '2026-10-24'],
    ['next_7_days', '2026-10-24', '2026-10-30'],
    ['this_month', '2026-10-01', '2026-10-31'],
    ['last_month', '2026-09-01', '2026-09-30'],
    ['next_30_days', '2026-10-24', '2026-11-22'],
    ['last_30_days', '2026-09-25', '2026-10-24'],
    ['next_month', '2026-11-01', '2026-11-30'],
    ['this_quarter', '2026-10-01', '2026-12-31'],
    ['this_year', '2026-01-01', '2026-12-31'],
  ] as const)('%s → %s..%s', (period, from, to) => {
    expect(r(period)).toEqual([from, to]);
  });

  it('uses the local date even when UTC is still the previous day', () => {
    expect(vnToday(new Date('2026-10-23T18:30:00Z')).toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(resolveRange({}, new Date('2026-10-23T18:30:00Z'), 'today', 1).fromDate).toBe('2026-10-24');
  });

  it('maps local dates to UTC instants (UTC+7) for timestamp columns', () => {
    const range = resolveRange({ period: 'today' }, now, 'today', 1);
    expect(range.startUtc.toISOString()).toBe('2026-10-23T17:00:00.000Z');
    expect(range.endUtc.toISOString()).toBe('2026-10-24T17:00:00.000Z');
  });

  it('prefers explicit dates and defaults toDate to fromDate', () => {
    expect(resolveRange({ period: 'this_month', fromDate: '2026-10-05', toDate: '2026-10-07' }, now, 'today', 31)).toMatchObject({ fromDate: '2026-10-05', toDate: '2026-10-07', days: 3 });
    expect(resolveRange({ fromDate: '2026-10-05' }, now, 'today', 31)).toMatchObject({ toDate: '2026-10-05', days: 1 });
  });

  it.each([
    [{ fromDate: '2026-02-30' }, 'INVALID_DATE'],
    [{ fromDate: '2026-10-10', toDate: '2026-10-01' }, 'INVALID_DATE_RANGE'],
    [{ fromDate: '2026-01-01', toDate: '2026-12-31' }, 'RANGE_TOO_LONG'],
  ])('rejects %j with %s', (args, reason) => {
    expect(() => resolveRange(args, now, 'today', 31)).toThrow(new ToolArgumentError(reason));
  });

  it('computes the previous period of the same length', () => {
    const month = resolveRange({ period: 'this_month' }, now, 'today', 366);
    expect(previousRange(month, 366)).toMatchObject({ fromDate: '2026-08-31', toDate: '2026-09-30', days: 31 });
    expect(previousRange(month, 366, 'this_month')).toMatchObject({ fromDate: '2026-09-01', toDate: '2026-09-30', days: 30 });
    const quarter = resolveRange({ period: 'this_quarter' }, now, 'today', 366);
    expect(previousRange(quarter, 366, 'this_quarter')).toMatchObject({ fromDate: '2026-07-01', toDate: '2026-09-30' });
    const january = resolveRange({ period: 'this_month' }, new Date('2026-01-15T03:00:00Z'), 'today', 366);
    expect(previousRange(january, 366, 'this_month')).toMatchObject({ fromDate: '2025-12-01', toDate: '2025-12-31' });
    const week = resolveRange({ period: 'this_week' }, now, 'today', 366);
    expect(previousRange(week, 366)).toMatchObject({ fromDate: '2026-10-12', toDate: '2026-10-18' });
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { bucket, csvCell, makeCsv, money, rate, reportRange, trend } from '../../backend/src/modules/reports/report-calculations';
import { ReportQueryDto } from '../../backend/src/modules/reports/reports.dto';
describe('Report arithmetic, dates and spreadsheet encoding', () => {
  it('uses null instead of invented empty rates', () => { expect(rate(0, 0)).toBeNull(); expect(rate(1, 3)).toBe(33.33); });
  it('keeps arbitrarily large exact money text', () => { expect(money('12345678901234567890.23')).toBe('12345678901234567890.23'); });
  it('uses inclusive Vietnam boundaries across leap day', () => { const r = reportRange({ dateFrom: '2024-02-29', dateTo: '2024-02-29' }); expect(r.utcStart.toISOString()).toBe('2024-02-28T17:00:00.000Z'); expect(r.utcEnd.toISOString()).toBe('2024-02-29T17:00:00.000Z'); });
  it.each(['2026-02-29', '2026-04-31', '0000-01-01', '9999-01-01', 'x'])('rejects invalid business date %s', (dateFrom) => expect(() => reportRange({ dateFrom, dateTo: dateFrom })).toThrow());
  it('bounds 366 days and fills empty time buckets', () => { expect(() => reportRange({ dateFrom: '2024-01-01', dateTo: '2024-12-31' })).not.toThrow(); expect(() => reportRange({ dateFrom: '2024-01-01', dateTo: '2025-01-01' })).toThrow(); const q = Object.assign(new ReportQueryDto(), { dateFrom: '2026-09-01', dateTo: '2026-09-02' }); expect(trend([], q, ['total'])).toHaveLength(2); });
  it('uses Monday weeks across year/month boundaries', () => { expect(bucket('2027-01-01', 'week')).toBe('2026-12-28'); expect(bucket('2026-09-17', 'month')).toBe('2026-09-01'); });
  it.each(['=1+1', '+SUM(A1)', '-cmd', '@SUM(A1)', '\t  =cmd', '\u0000+cmd', '\r\n@cmd'])('escapes formula prefix %j', (text) => expect(csvCell(text)).toBe(`"'${text}"`));
  it('quotes embedded commas, quotes and Unicode in BOM CRLF CSV', () => { expect(csvCell('Nhân sự, "A"')).toBe('"Nhân sự, ""A"""'); expect(makeCsv([]).startsWith('\uFEFF')).toBe(true); expect(makeCsv([]).endsWith('\r\n')).toBe(true); });
});

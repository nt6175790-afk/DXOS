// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
/** Vietnam has no daylight saving time: local time is always UTC+7. */
export const VN_OFFSET_MS = 7 * 3_600_000;
export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** dd/MM/yyyy HH:mm in Asia/Ho_Chi_Minh, so the model never converts from UTC itself. */
export function formatVnDateTime(date: Date): string {
  const local = new Date(date.getTime() + VN_OFFSET_MS);
  return `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

export function formatVnDate(date: Date): string {
  return formatVnDateTime(date).slice(0, 10);
}

/** HH:mm in Vietnam time, or null. */
export function formatVnTime(date: Date | null | undefined): string | null {
  return date ? formatVnDateTime(date).slice(11) : null;
}

/**
 * `{ <prefix>Days }` from one full day on, otherwise `{ <prefix>Hours }` (at least `minHours`),
 * so answers never say "0 days overdue".
 */
export function elapsed(prefix: 'overdue' | 'waiting', ms: number, minHours: number): Record<string, number> {
  return ms >= DAY_MS ? { [prefix + 'Days']: Math.floor(ms / DAY_MS) } : { [prefix + 'Hours']: Math.max(minHours, Math.floor(ms / HOUR_MS)) };
}

/** Overdue flag and how late an open task is; `dueAt` null means not overdue. */
export function overdue(dueAt: Date | null, now: Date): Record<string, unknown> {
  const ms = dueAt ? now.getTime() - dueAt.getTime() : 0;
  return { overdue: ms > 0, ...(ms > 0 ? elapsed('overdue', ms, 1) : {}) };
}

export function vnWeekday(date: Date): string {
  return WEEKDAYS[new Date(date.getTime() + VN_OFFSET_MS).getUTCDay()];
}

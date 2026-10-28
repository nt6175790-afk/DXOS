// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException } from '@nestjs/common';

export function parseAttendanceDate(value: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Invalid calendar date');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid calendar date');
  return date;
}

export function attendanceRange(from?: string, to?: string) {
  const start = from === undefined ? undefined : parseAttendanceDate(from);
  const end = to === undefined ? undefined : parseAttendanceDate(to);
  if (start && end && start > end) throw new BadRequestException('from must not be after to');
  return { start, end };
}

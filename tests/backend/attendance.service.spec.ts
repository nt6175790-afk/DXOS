// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  calculateEarlyLeaveMinutes,
  calculateLateMinutes,
  calculateWorkedMinutes,
  getVietnamDateParts,
} from '../../backend/src/modules/attendance/attendance.service';

describe('Attendance Domain Unit Tests & Policies', () => {
  describe('getVietnamDateParts', () => {
    it('accurately extracts Vietnam local date and time parts from UTC timestamp', () => {
      // 2026-09-16 01:30:00 UTC = 2026-09-16 08:30:00 UTC+7
      const utcDate = new Date('2026-09-16T01:30:00.000Z');
      const parts = getVietnamDateParts(utcDate);

      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(8); // September is 8 (0-indexed)
      expect(parts.day).toBe(16);
      expect(parts.hours).toBe(8);
      expect(parts.minutes).toBe(30);
      expect(parts.workDate.toISOString().slice(0, 10)).toBe('2026-09-16');
    });

    it('crosses day boundary correctly when UTC is prior day evening', () => {
      // 2026-09-15 18:00:00 UTC = 2026-09-16 01:00:00 UTC+7
      const utcDate = new Date('2026-09-15T18:00:00.000Z');
      const parts = getVietnamDateParts(utcDate);

      expect(parts.year).toBe(2026);
      expect(parts.day).toBe(16);
      expect(parts.hours).toBe(1);
    });
  });

  describe('calculateLateMinutes', () => {
    it('returns 0 when check-in is before 09:00:00 local time', () => {
      // 08:50 UTC+7 (01:50 UTC)
      const checkIn = new Date('2026-09-16T01:50:00.000Z');
      expect(calculateLateMinutes(checkIn)).toBe(0);
    });

    it('returns 0 when check-in is exactly 09:00:00 local time', () => {
      // 09:00:00 UTC+7 (02:00:00 UTC)
      const checkIn = new Date('2026-09-16T02:00:00.000Z');
      expect(calculateLateMinutes(checkIn)).toBe(0);
    });

    it('calculates exact late minutes when check-in is after 09:00:00 local time', () => {
      // 09:25:30 UTC+7 (02:25:30 UTC) -> 25 minutes late
      const checkIn = new Date('2026-09-16T02:25:30.000Z');
      expect(calculateLateMinutes(checkIn)).toBe(25);
    });
  });

  describe('calculateEarlyLeaveMinutes', () => {
    it('returns 0 when check-out is at or after 18:00:00 local time', () => {
      // 18:00:00 UTC+7 (11:00:00 UTC)
      const onTime = new Date('2026-09-16T11:00:00.000Z');
      expect(calculateEarlyLeaveMinutes(onTime)).toBe(0);

      // 18:30:00 UTC+7 (11:30:00 UTC)
      const afterWork = new Date('2026-09-16T11:30:00.000Z');
      expect(calculateEarlyLeaveMinutes(afterWork)).toBe(0);
    });

    it('calculates exact early leave minutes when check-out is before 18:00:00 local time', () => {
      // 17:15:00 UTC+7 (10:15:00 UTC) -> 45 minutes early
      const earlyCheckOut = new Date('2026-09-16T10:15:00.000Z');
      expect(calculateEarlyLeaveMinutes(earlyCheckOut)).toBe(45);
    });
  });

  describe('calculateWorkedMinutes', () => {
    it('deducts 60-minute lunch break for a full work day', () => {
      // 08:30 to 18:30 UTC+7 (01:30 to 11:30 UTC): 10 hours gross = 600 mins - 60 lunch = 540 mins
      const checkIn = new Date('2026-09-16T01:30:00.000Z');
      const checkOut = new Date('2026-09-16T11:30:00.000Z');
      expect(calculateWorkedMinutes(checkIn, checkOut)).toBe(540);
    });

    it('does not deduct lunch break when shift is completely in morning before lunch', () => {
      // 08:00 to 12:00 UTC+7 (01:00 to 05:00 UTC): 4 hours = 240 mins
      const checkIn = new Date('2026-09-16T01:00:00.000Z');
      const checkOut = new Date('2026-09-16T05:00:00.000Z');
      expect(calculateWorkedMinutes(checkIn, checkOut)).toBe(240);
    });

    it('does not deduct lunch break when shift is completely in afternoon after lunch', () => {
      // 13:00 to 18:00 UTC+7 (06:00 to 11:00 UTC): 5 hours = 300 mins
      const checkIn = new Date('2026-09-16T06:00:00.000Z');
      const checkOut = new Date('2026-09-16T11:00:00.000Z');
      expect(calculateWorkedMinutes(checkIn, checkOut)).toBe(300);
    });

    it('deducts partial lunch overlap when shift ends during lunch', () => {
      // 08:30 to 12:30 UTC+7 (01:30 to 05:30 UTC): 4 hours gross = 240 mins - 30 mins lunch = 210 mins
      const checkIn = new Date('2026-09-16T01:30:00.000Z');
      const checkOut = new Date('2026-09-16T05:30:00.000Z');
      expect(calculateWorkedMinutes(checkIn, checkOut)).toBe(210);
    });

    it('returns 0 if check-out time is earlier than or equal to check-in time', () => {
      const checkIn = new Date('2026-09-16T05:00:00.000Z');
      const checkOut = new Date('2026-09-16T04:00:00.000Z');
      expect(calculateWorkedMinutes(checkIn, checkOut)).toBe(0);
    });
  });

  describe('Shift-Driven Rules & Policies (Task 4 Required Cases)', () => {
    const standardShift = {
      startTime: '09:00',
      endTime: '18:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      gracePeriodMinutes: 10,
      isOvernight: false,
    };

    // CASE 1: 09:00-18:00, Grace 10, check-in 09:05 -> PRESENT
    it('CASE 1: check-in within grace period (09:05 vs 09:00 + grace 10) is PRESENT with 0 late minutes', () => {
      // 09:05:00 UTC+7 (02:05:00 UTC)
      const checkIn = new Date('2026-09-16T02:05:00.000Z');
      expect(calculateLateMinutes(checkIn, standardShift)).toBe(0);
    });

    it('check-in exactly at grace cutoff (09:10:00 vs 09:00 + grace 10) is PRESENT with 0 late minutes', () => {
      // 09:10:00 UTC+7 (02:10:00 UTC)
      const checkIn = new Date('2026-09-16T02:10:00.000Z');
      expect(calculateLateMinutes(checkIn, standardShift)).toBe(0);
    });

    // CASE 2: check-in 09:11 -> LATE, lateMinutes = 11
    it('CASE 2: check-in after grace period (09:11 vs 09:00 + grace 10) is LATE with lateMinutes = 11', () => {
      // 09:11:00 UTC+7 (02:11:00 UTC)
      const checkIn = new Date('2026-09-16T02:11:00.000Z');
      expect(calculateLateMinutes(checkIn, standardShift)).toBe(11);
    });

    // CASE 3: check-out 17:50 vs 18:00 -> earlyLeaveMinutes = 10
    it('CASE 3: check-out 17:50 vs 18:00 shift end results in earlyLeaveMinutes = 10', () => {
      // 17:50:00 UTC+7 (10:50:00 UTC)
      const checkOut = new Date('2026-09-16T10:50:00.000Z');
      expect(calculateEarlyLeaveMinutes(checkOut, standardShift)).toBe(10);
    });

    // CASE 4: Overnight 22:00-06:00, check-in 2026-09-20 22:05, check-out 2026-09-21 06:10 -> correct workedMinutes
    it('CASE 4: overnight shift (22:00-06:00) calculates correct workedMinutes across midnight boundary', () => {
      const overnightShift = {
        startTime: '22:00',
        endTime: '06:00',
        breakStart: null,
        breakEnd: null,
        gracePeriodMinutes: 10,
        isOvernight: true,
      };

      // 2026-09-20 22:05:00 UTC+7 (15:05:00 UTC)
      const checkIn = new Date('2026-09-20T15:05:00.000Z');
      // 2026-09-21 06:10:00 UTC+7 (23:10:00 UTC on 2026-09-20)
      const checkOut = new Date('2026-09-20T23:10:00.000Z');

      const workedMinutes = calculateWorkedMinutes(checkIn, checkOut, overnightShift);
      // 8 hours 5 minutes = 485 minutes
      expect(workedMinutes).toBe(485);
    });

    it('CASE 4 (with break): overnight shift with 30m break correctly deducts break time', () => {
      const overnightShiftWithBreak = {
        startTime: '22:00',
        endTime: '06:00',
        breakStart: '02:00',
        breakEnd: '02:30',
        gracePeriodMinutes: 10,
        isOvernight: true,
      };

      // 2026-09-20 22:00:00 UTC+7 (15:00:00 UTC)
      const checkIn = new Date('2026-09-20T15:00:00.000Z');
      // 2026-09-21 06:00:00 UTC+7 (23:00:00 UTC on 2026-09-20)
      const checkOut = new Date('2026-09-20T23:00:00.000Z');

      const workedMinutes = calculateWorkedMinutes(checkIn, checkOut, overnightShiftWithBreak);
      // Gross 8 hours (480 mins) - 30 mins break = 450 minutes
      expect(workedMinutes).toBe(450);
    });
  });
});


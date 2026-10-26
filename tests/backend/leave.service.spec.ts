// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException } from '@nestjs/common';
import { LeaveStatus, LeaveType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { calculateLeaveDays, leaveTypeLabel } from '../../backend/src/modules/leave/leave.service';
import { notificationContent, NOTIFICATION_TYPES } from '../../backend/src/modules/notifications/notification-catalog';

describe('Leave Service unit tests & policies', () => {
  describe('calculateLeaveDays', () => {
    it('calculates 1.0 day for a full-day leave on the same date', () => {
      // 08:00 to 17:00 UTC+7 on 2026-09-16 (01:00 to 10:00 UTC) -> 9 hours
      const startsAt = new Date('2026-09-16T01:00:00.000Z');
      const endsAt = new Date('2026-09-16T10:00:00.000Z');
      expect(calculateLeaveDays(startsAt, endsAt)).toBe(1.0);
    });

    it('calculates 0.5 day for a half-day leave on the same date (<= 5 hours)', () => {
      // 08:00 to 12:00 UTC+7 (4 hours)
      const startsAt = new Date('2026-09-16T01:00:00.000Z');
      const endsAt = new Date('2026-09-16T05:00:00.000Z');
      expect(calculateLeaveDays(startsAt, endsAt)).toBe(0.5);
    });

    it('calculates multi-day leave correctly based on UTC+07:00 calendar dates', () => {
      // 2026-09-16 to 2026-09-18 (3 calendar days: 16, 17, 18)
      const startsAt = new Date('2026-09-16T01:00:00.000Z'); // 08:00 UTC+7
      const endsAt = new Date('2026-09-18T10:00:00.000Z');   // 17:00 UTC+7
      expect(calculateLeaveDays(startsAt, endsAt)).toBe(3);
    });

    it('calculates 2 days for consecutive days', () => {
      const startsAt = new Date('2026-09-16T01:00:00.000Z');
      const endsAt = new Date('2026-09-17T10:00:00.000Z');
      expect(calculateLeaveDays(startsAt, endsAt)).toBe(2);
    });
  });

  describe('leaveTypeLabel', () => {
    it('returns proper Vietnamese labels for all leave types', () => {
      expect(leaveTypeLabel(LeaveType.ANNUAL)).toBe('Nghỉ phép năm');
      expect(leaveTypeLabel(LeaveType.SICK)).toBe('Nghỉ ốm');
      expect(leaveTypeLabel(LeaveType.PERSONAL)).toBe('Việc riêng');
      expect(leaveTypeLabel(LeaveType.UNPAID)).toBe('Nghỉ không lương');
      expect(leaveTypeLabel(LeaveType.OTHER)).toBe('Nghỉ phép khác');
    });
  });

  describe('notificationContent for leave', () => {
    const orgId = randomUUID();
    const userId = randomUUID();
    const leaveId = randomUUID();

    it('creates approved leave notification', () => {
      const content = notificationContent({
        organizationId: orgId,
        recipientUserId: userId,
        type: NOTIFICATION_TYPES.LEAVE_STATUS_CHANGED,
        metadata: {
          leaveRequestId: leaveId,
          status: LeaveStatus.APPROVED,
        },
      });
      expect(content.title).toContain('phê duyệt');
      expect(content.body).toContain('phê duyệt');
      expect(content.metadata).toEqual({
        leaveRequestId: leaveId,
        status: LeaveStatus.APPROVED,
      });
    });

    it('creates rejected leave notification with reason', () => {
      const content = notificationContent({
        organizationId: orgId,
        recipientUserId: userId,
        type: NOTIFICATION_TYPES.LEAVE_STATUS_CHANGED,
        metadata: {
          leaveRequestId: leaveId,
          status: LeaveStatus.REJECTED,
          reason: 'Dự án đang vào giai đoạn quan trọng',
        },
      });
      expect(content.title).toContain('từ chối');
      expect(content.body).toContain('Dự án đang vào giai đoạn quan trọng');
      expect(content.metadata).toEqual({
        leaveRequestId: leaveId,
        status: LeaveStatus.REJECTED,
        reason: 'Dự án đang vào giai đoạn quan trọng',
      });
    });

    it('rejects leave notification without valid leaveRequestId', () => {
      expect(() =>
        notificationContent({
          organizationId: orgId,
          recipientUserId: userId,
          type: NOTIFICATION_TYPES.LEAVE_STATUS_CHANGED,
          metadata: {
            status: LeaveStatus.APPROVED,
          } as unknown as Record<string, unknown>,
        }),
      ).toThrow(BadRequestException);
    });
  });
});

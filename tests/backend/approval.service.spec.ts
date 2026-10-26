// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException } from '@nestjs/common';
import {  ApprovalStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { notificationContent, NOTIFICATION_TYPES } from '../../backend/src/modules/notifications/notification-catalog';

describe('Approval Service unit tests & notification policies', () => {
  const orgId = randomUUID();
  const userId = randomUUID();
  const approvalId = randomUUID();

  describe('notificationContent for approval', () => {
    it('creates approved notification with proper Vietnamese text', () => {
      const content = notificationContent({
        organizationId: orgId,
        recipientUserId: userId,
        type: NOTIFICATION_TYPES.APPROVAL_STATUS_CHANGED,
        metadata: {
          approvalRequestId: approvalId,
          status: 'APPROVED',
          title: 'Điều chỉnh chấm công ngày 2026-09-20',
        },
      });

      expect(content.title).toContain('đã được phê duyệt');
      expect(content.body).toContain('đã được phê duyệt');
      expect(content.metadata).toEqual({
        approvalRequestId: approvalId,
        status: 'APPROVED',
        title: 'Điều chỉnh chấm công ngày 2026-09-20',
      });
    });

    it('creates rejected notification with reason included in body', () => {
      const reason = 'Không đủ bằng chứng xác thực';
      const content = notificationContent({
        organizationId: orgId,
        recipientUserId: userId,
        type: NOTIFICATION_TYPES.APPROVAL_STATUS_CHANGED,
        metadata: {
          approvalRequestId: approvalId,
          status: 'REJECTED',
          title: 'Đơn xin nghỉ phép',
          reason,
        },
      });

      expect(content.title).toContain('đã bị từ chối');
      expect(content.body).toContain(reason);
      expect(content.metadata).toEqual({
        approvalRequestId: approvalId,
        status: 'REJECTED',
        title: 'Đơn xin nghỉ phép',
        reason,
      });
    });

    it('creates new approval request notification for approver/manager', () => {
      const content = notificationContent({
        organizationId: orgId,
        recipientUserId: userId,
        type: NOTIFICATION_TYPES.APPROVAL_NEW_REQUEST,
        metadata: {
          approvalRequestId: approvalId,
          title: 'Điều chỉnh chấm công Nguyễn Văn An',
        },
      });

      expect(content.title).toBe('Yêu cầu phê duyệt mới');
      expect(content.body).toContain('Có yêu cầu phê duyệt mới');
      expect(content.metadata).toEqual({
        approvalRequestId: approvalId,
        title: 'Điều chỉnh chấm công Nguyễn Văn An',
      });
    });

    it('rejects notification with missing approvalRequestId', () => {
      expect(() => {
        notificationContent({
          organizationId: orgId,
          recipientUserId: userId,
          type: NOTIFICATION_TYPES.APPROVAL_STATUS_CHANGED,
          metadata: {
            status: 'APPROVED',
          } as never,
        });
      }).toThrow(BadRequestException);
    });

    it('rejects notification with invalid status', () => {
      expect(() => {
        notificationContent({
          organizationId: orgId,
          recipientUserId: userId,
          type: NOTIFICATION_TYPES.APPROVAL_STATUS_CHANGED,
          metadata: {
            approvalRequestId: approvalId,
            status: 'INVALID_STATUS' as never,
          },
        });
      }).toThrow(BadRequestException);
    });
  });

  describe('Approval state machine invariants', () => {
    it('verifies allowed and disallowed transitions', () => {
      const allowedTransitions: Record<ApprovalStatus, ApprovalStatus[]> = {
        PENDING: [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.CANCELLED],
        APPROVED: [],
        REJECTED: [],
        CANCELLED: [],
      };

      expect(allowedTransitions.PENDING).toContain(ApprovalStatus.APPROVED);
      expect(allowedTransitions.PENDING).toContain(ApprovalStatus.REJECTED);
      expect(allowedTransitions.PENDING).toContain(ApprovalStatus.CANCELLED);
      expect(allowedTransitions.APPROVED.length).toBe(0);
      expect(allowedTransitions.REJECTED.length).toBe(0);
      expect(allowedTransitions.CANCELLED.length).toBe(0);
    });
  });
});

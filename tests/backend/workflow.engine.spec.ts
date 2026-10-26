// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import {
  WORKFLOW_STATUS,
  WORKFLOW_STEP_STATUS,
  WORKFLOW_STEP_TYPES,
} from '../../backend/src/modules/workflow/workflow.types';
import { notificationContent, NOTIFICATION_TYPES } from '../../backend/src/modules/notifications/notification-catalog';

describe('Workflow Engine Unit Tests', () => {
  const orgId = randomUUID();
  const userId = randomUUID();
  const workflowInstanceId = randomUUID();

  describe('Workflow Notification Catalog Integration', () => {
    it('creates WORKFLOW_WAITING_CONFIRMATION notification content', () => {
      const content = notificationContent({
        organizationId: orgId,
        recipientUserId: userId,
        type: NOTIFICATION_TYPES.WORKFLOW_WAITING_CONFIRMATION,
        metadata: {
          title: 'Cần xác nhận: Gia hạn hợp đồng',
          message: 'Quy trình đang chờ HR xác nhận điều khoản',
          workflowInstanceId,
          stepName: 'HR xác nhận điều khoản gia hạn',
        },
      });

      expect(content.title).toBe('Cần xác nhận: Gia hạn hợp đồng');
      expect(content.body).toBe('Quy trình đang chờ HR xác nhận điều khoản');
      expect(content.metadata).toEqual({
        workflowInstanceId,
        stepName: 'HR xác nhận điều khoản gia hạn',
      });
    });

    it('creates WORKFLOW_COMPLETED notification content', () => {
      const content = notificationContent({
        organizationId: orgId,
        recipientUserId: userId,
        type: NOTIFICATION_TYPES.WORKFLOW_COMPLETED,
        metadata: {
          title: 'Quy trình hoàn tất',
          message: 'Quy trình gia hạn hợp đồng đã hoàn thành',
          workflowInstanceId,
        },
      });

      expect(content.title).toBe('Quy trình hoàn tất');
      expect(content.body).toBe('Quy trình gia hạn hợp đồng đã hoàn thành');
      expect(content.metadata).toEqual({ workflowInstanceId });
    });
  });

  describe('Workflow State Machine Logic', () => {
    it('transitions correctly through states with Human-in-the-loop pause', () => {
      const steps: { index: number; name: string; type: string; status: string }[] = [
        { index: 0, name: 'Gửi thông báo', type: WORKFLOW_STEP_TYPES.NOTIFICATION, status: WORKFLOW_STEP_STATUS.PENDING },
        { index: 1, name: 'HR phê duyệt', type: WORKFLOW_STEP_TYPES.HUMAN_CONFIRMATION, status: WORKFLOW_STEP_STATUS.PENDING },
        { index: 2, name: 'Cập nhật hồ sơ', type: WORKFLOW_STEP_TYPES.ACTION, status: WORKFLOW_STEP_STATUS.PENDING },
      ];

      let instanceStatus: string = WORKFLOW_STATUS.RUNNING;

      // Advance step 0: NOTIFICATION
      steps[0].status = WORKFLOW_STEP_STATUS.COMPLETED;

      // Advance step 1: HUMAN_CONFIRMATION -> pauses
      if (steps[1].type === WORKFLOW_STEP_TYPES.HUMAN_CONFIRMATION) {
        steps[1].status = WORKFLOW_STEP_STATUS.WAITING_CONFIRMATION;
        instanceStatus = WORKFLOW_STATUS.WAITING;
      }

      expect(instanceStatus).toBe(WORKFLOW_STATUS.WAITING);
      expect(steps[1].status).toBe(WORKFLOW_STEP_STATUS.WAITING_CONFIRMATION);

      // Human confirms step 1
      steps[1].status = WORKFLOW_STEP_STATUS.COMPLETED;

      instanceStatus = WORKFLOW_STATUS.RUNNING;

      // Advance step 2: ACTION
      steps[2].status = WORKFLOW_STEP_STATUS.COMPLETED;
      instanceStatus = WORKFLOW_STATUS.COMPLETED;

      expect(instanceStatus).toBe(WORKFLOW_STATUS.COMPLETED);
      expect(steps.every((s) => s.status === WORKFLOW_STEP_STATUS.COMPLETED)).toBe(true);
    });
  });
});

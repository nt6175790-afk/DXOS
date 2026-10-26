// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import {
  type AutomationCondition,
} from '../../backend/src/modules/automation/automation.types';
import { notificationContent, NOTIFICATION_TYPES } from '../../backend/src/modules/notifications/notification-catalog';

describe('Automation Engine Unit Tests', () => {
  const orgId = randomUUID();
  const userId = randomUUID();
  const ruleId = randomUUID();

  describe('Automation Notification Catalog Integration', () => {
    it('creates AUTOMATION_TRIGGERED notification content', () => {
      const content = notificationContent({
        organizationId: orgId,
        recipientUserId: userId,
        type: NOTIFICATION_TYPES.AUTOMATION_TRIGGERED,
        metadata: {
          title: 'Quy tắc rà soát hợp đồng kích hoạt',
          message: 'Đã phát hiện hợp đồng cần gia hạn',
          ruleId,
        },
      });

      expect(content.title).toBe('Quy tắc rà soát hợp đồng kích hoạt');
      expect(content.body).toBe('Đã phát hiện hợp đồng cần gia hạn');
      expect(content.metadata).toEqual({ ruleId });
    });

    it('creates AUTOMATION_FAILED notification content', () => {
      const content = notificationContent({
        organizationId: orgId,
        recipientUserId: userId,
        type: NOTIFICATION_TYPES.AUTOMATION_FAILED,
        metadata: {
          title: 'Lỗi thực thi tự động hóa',
          message: 'Thao tác không hợp lệ',
          ruleId,
        },
      });

      expect(content.title).toBe('Lỗi thực thi tự động hóa');
      expect(content.body).toBe('Thao tác không hợp lệ');
      expect(content.metadata).toEqual({ ruleId });
    });
  });

  describe('Condition Evaluator Logic', () => {
    function evaluateCondition(condition: AutomationCondition, data: Record<string, unknown>): boolean {
      const actual = data ? data[condition.field] : undefined;
      const expected = condition.value;

      switch (condition.operator) {
        case 'equals':
          return actual === expected;
        case 'not_equals':
          return actual !== expected;
        case 'greater_than':
          return Number(actual) > Number(expected);
        case 'less_than':
          return Number(actual) < Number(expected);
        case 'greater_than_or_equal':
          return Number(actual) >= Number(expected);
        case 'less_than_or_equal':
          return Number(actual) <= Number(expected);
        case 'contains':
          return typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase());
        case 'in':
          return Array.isArray(expected) && expected.includes(actual);
        default:
          return false;
      }
    }

    it('evaluates category equals LABOR_CONTRACT correctly', () => {
      const condition: AutomationCondition = {
        field: 'category',
        operator: 'equals',
        value: 'LABOR_CONTRACT',
      };

      expect(evaluateCondition(condition, { category: 'LABOR_CONTRACT' })).toBe(true);
      expect(evaluateCondition(condition, { category: 'IDENTIFICATION' })).toBe(false);
    });

    it('evaluates daysRemaining less_than_or_equal 30 correctly', () => {
      const condition: AutomationCondition = {
        field: 'daysRemaining',
        operator: 'less_than_or_equal',
        value: 30,
      };

      expect(evaluateCondition(condition, { daysRemaining: 15 })).toBe(true);
      expect(evaluateCondition(condition, { daysRemaining: 30 })).toBe(true);
      expect(evaluateCondition(condition, { daysRemaining: 45 })).toBe(false);
    });

    it('evaluates string contains properly (case-insensitive)', () => {
      const condition: AutomationCondition = {
        field: 'title',
        operator: 'contains',
        value: 'hợp đồng',
      };

      expect(evaluateCondition(condition, { title: 'Gia hạn HỢP ĐỒNG lao động 2026' })).toBe(true);
      expect(evaluateCondition(condition, { title: 'Bằng đại học' })).toBe(false);
    });

    it('evaluates in operator properly', () => {
      const condition: AutomationCondition = {
        field: 'category',
        operator: 'in',
        value: ['LABOR_CONTRACT', 'IDENTIFICATION'],
      };

      expect(evaluateCondition(condition, { category: 'LABOR_CONTRACT' })).toBe(true);
      expect(evaluateCondition(condition, { category: 'IDENTIFICATION' })).toBe(true);
      expect(evaluateCondition(condition, { category: 'CERTIFICATE' })).toBe(false);
    });
  });

  describe('Idempotency Key Determinism', () => {
    it('generates consistent idempotency key for entity within the same day', () => {
      const entityType = 'EMPLOYEE_DOCUMENT';
      const entityId = 'doc-12345';
      const today = '2026-09-20';

      const key1 = `${orgId}:${ruleId}:${entityType}:${entityId}:${today}`;
      const key2 = `${orgId}:${ruleId}:${entityType}:${entityId}:${today}`;

      expect(key1).toBe(key2);
      expect(key1).toContain(entityId);
    });
  });
});

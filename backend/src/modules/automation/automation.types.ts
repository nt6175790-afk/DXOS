// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
export const AUTOMATION_TRIGGERS = {
  DOCUMENT_EXPIRING_30D: 'DOCUMENT_EXPIRING_30D',
  DOCUMENT_EXPIRING_7D: 'DOCUMENT_EXPIRING_7D',
  DOCUMENT_EXPIRED: 'DOCUMENT_EXPIRED',
  MISSING_MANDATORY_DOCUMENT: 'MISSING_MANDATORY_DOCUMENT',
  PROBATION_ENDING_15D: 'PROBATION_ENDING_15D',
  PERFORMANCE_REVIEW_DUE: 'PERFORMANCE_REVIEW_DUE',
  MANUAL_CHECK: 'MANUAL_CHECK',
} as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[keyof typeof AUTOMATION_TRIGGERS];

export const AUTOMATION_ACTION_TYPES = {
  CREATE_NOTIFICATION: 'CREATE_NOTIFICATION',
  CREATE_TASK: 'CREATE_TASK',
  TRIGGER_WORKFLOW: 'TRIGGER_WORKFLOW',
  SEND_REMINDER: 'SEND_REMINDER',
} as const;

export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[keyof typeof AUTOMATION_ACTION_TYPES];

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'less_than_or_equal'
  | 'greater_than_or_equal'
  | 'contains'
  | 'in';

export interface AutomationCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface AutomationAction {
  type: AutomationActionType;
  params: Record<string, unknown> & { title?: string; message?: string; triggerType?: string; description?: string };
}

export type AutomationExecutionStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface TriggerEventContext {
  organizationId: string;
  trigger: AutomationTrigger;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

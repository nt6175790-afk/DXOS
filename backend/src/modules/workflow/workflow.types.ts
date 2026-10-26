// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
export const WORKFLOW_STATUS = {
  RUNNING: 'RUNNING',
  WAITING: 'WAITING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUS)[keyof typeof WORKFLOW_STATUS];

export const WORKFLOW_STEP_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_CONFIRMATION: 'WAITING_CONFIRMATION',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUS)[keyof typeof WORKFLOW_STEP_STATUS];

export const WORKFLOW_STEP_TYPES = {
  NOTIFICATION: 'NOTIFICATION',
  TASK: 'TASK',
  HUMAN_CONFIRMATION: 'HUMAN_CONFIRMATION',
  ACTION: 'ACTION',
} as const;

export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[keyof typeof WORKFLOW_STEP_TYPES];

export interface WorkflowStepConfig {
  name: string;
  type: WorkflowStepType;
  description?: string;
  assigneeRole?: string;
  payload?: Record<string, unknown> & { title?: string; message?: string; assigneeRole?: string; description?: string; action?: string };
}

export interface WorkflowDefinitionConfig {
  name: string;
  triggerType: string;
  description?: string;
  steps: WorkflowStepConfig[];
}

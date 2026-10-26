// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';

export interface WorkflowDefinition {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  triggerType: string;
  steps: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepExecution {
  id: string;
  organizationId: string;
  workflowInstanceId: string;
  stepIndex: number;
  stepName: string;
  stepType: 'NOTIFICATION' | 'TASK' | 'HUMAN_CONFIRMATION' | 'ACTION';
  status: 'PENDING' | 'IN_PROGRESS' | 'WAITING_CONFIRMATION' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  assignedToUserId?: string | null;
  actionPayload?: string | null;
  resultPayload?: string | null;
  comments?: string | null;
  executedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface WorkflowInstance {
  id: string;
  organizationId: string;
  workflowDefinitionId: string;
  title: string;
  entityType?: string | null;
  entityId?: string | null;
  status: 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStepIndex: number;
  data?: string | null;
  ownerUserId: string;
  startedAt: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  definition?: WorkflowDefinition;
  stepExecutions?: WorkflowStepExecution[];
}

export interface CreateWorkflowInstancePayload {
  workflowDefinitionId: string;
  title: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

export interface ConfirmStepPayload {
  comments?: string;
  resultPayload?: Record<string, unknown>;
}

export const workflowsApi = {
  listDefinitions: async (orgId: string): Promise<WorkflowDefinition[]> => {
    const res = await api.get<WorkflowDefinition[]>(`/organizations/${orgId}/workflows/definitions`);
    return res.data;
  },

  listInstances: async (orgId: string, params?: { status?: string; limit?: number }): Promise<WorkflowInstance[]> => {
    const res = await api.get<WorkflowInstance[]>(`/organizations/${orgId}/workflows`, { params });
    return res.data;
  },

  getInstance: async (orgId: string, instanceId: string): Promise<WorkflowInstance> => {
    const res = await api.get<WorkflowInstance>(`/organizations/${orgId}/workflows/${instanceId}`);
    return res.data;
  },

  startWorkflow: async (orgId: string, payload: CreateWorkflowInstancePayload): Promise<WorkflowInstance> => {
    const res = await api.post<WorkflowInstance>(`/organizations/${orgId}/workflows`, payload);
    return res.data;
  },

  confirmStep: async (
    orgId: string,
    instanceId: string,
    stepId: string,
    payload: ConfirmStepPayload = {}
  ): Promise<WorkflowInstance> => {
    const res = await api.post<WorkflowInstance>(
      `/organizations/${orgId}/workflows/${instanceId}/steps/${stepId}/confirm`,
      payload
    );
    return res.data;
  },

  cancelWorkflow: async (
    orgId: string,
    instanceId: string,
    reason?: string
  ): Promise<WorkflowInstance> => {
    const res = await api.post<WorkflowInstance>(
      `/organizations/${orgId}/workflows/${instanceId}/cancel`,
      { reason }
    );
    return res.data;
  },
};

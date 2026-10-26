// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';

export interface AutomationCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface AutomationAction {
  type: string;
  params: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  trigger: string;
  conditions: string;
  actions: string;
  isActive: boolean;
  lastRunAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationExecution {
  id: string;
  organizationId: string;
  automationRuleId: string;
  event: string;
  entityType?: string | null;
  entityId?: string | null;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  idempotencyKey?: string | null;
  error?: string | null;
  metadata?: string | null;
  startedAt: string;
  completedAt?: string | null;
  createdAt: string;
  rule?: {
    id: string;
    name: string;
    trigger: string;
  };
}

export interface CreateAutomationRulePayload {
  name: string;
  description?: string;
  trigger: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive?: boolean;
}

export interface UpdateAutomationRulePayload {
  name?: string;
  description?: string;
  trigger?: string;
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
  isActive?: boolean;
}

export const automationApi = {
  listRules: async (orgId: string): Promise<AutomationRule[]> => {
    const res = await api.get<AutomationRule[]>(`/organizations/${orgId}/automation/rules`);
    return res.data;
  },

  getRule: async (orgId: string, ruleId: string): Promise<AutomationRule> => {
    const res = await api.get<AutomationRule>(`/organizations/${orgId}/automation/rules/${ruleId}`);
    return res.data;
  },

  createRule: async (orgId: string, payload: CreateAutomationRulePayload): Promise<AutomationRule> => {
    const res = await api.post<AutomationRule>(`/organizations/${orgId}/automation/rules`, payload);
    return res.data;
  },

  updateRule: async (orgId: string, ruleId: string, payload: UpdateAutomationRulePayload): Promise<AutomationRule> => {
    const res = await api.patch<AutomationRule>(`/organizations/${orgId}/automation/rules/${ruleId}`, payload);
    return res.data;
  },

  toggleRule: async (orgId: string, ruleId: string, isActive: boolean): Promise<AutomationRule> => {
    const res = await api.patch<AutomationRule>(`/organizations/${orgId}/automation/rules/${ruleId}/toggle`, { isActive });
    return res.data;
  },

  deleteRule: async (orgId: string, ruleId: string): Promise<{ success: boolean }> => {
    const res = await api.delete<{ success: boolean }>(`/organizations/${orgId}/automation/rules/${ruleId}`);
    return res.data;
  },

  listExecutions: async (orgId: string, limit = 50): Promise<AutomationExecution[]> => {
    const res = await api.get<AutomationExecution[]>(`/organizations/${orgId}/automation/executions`, {
      params: { limit },
    });
    return res.data;
  },

  runScan: async (orgId: string, trigger?: string): Promise<{ scannedAt: string; triggersFired: number; details: unknown[] }> => {
    const res = await api.post<{ scannedAt: string; triggersFired: number; details: unknown[] }>(`/organizations/${orgId}/automation/run`, { trigger });
    return res.data;
  },
};

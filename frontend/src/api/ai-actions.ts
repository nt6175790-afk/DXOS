// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
export interface TaskDraftFields { title: string; description?: string; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; dueAt?: string }
export interface AiTaskDraft { id: string; task: TaskDraftFields; provider: string; expiresAt: string; requiresConfirmation: boolean }
export interface KnowledgeSource { fileId: string; filename: string; chunks: number }
export const aiActions = {
  async propose(org: string, prompt: string) { return (await api.post<AiTaskDraft>(`/organizations/${org}/ai/task-drafts`, { prompt })).data; },
  async confirm(org: string, id: string, task: TaskDraftFields) { return (await api.post<{ taskId: string; replayed: boolean }>(`/organizations/${org}/ai/task-drafts/${id}/confirm`, { ...task, confirm: true })).data; },
  async sources(org: string) { return (await api.get<{ items: KnowledgeSource[] }>(`/organizations/${org}/ai/knowledge`)).data; },
  async index(org: string, id: string) { return (await api.post(`/organizations/${org}/ai/knowledge/${id}/index`)).data; },
  async remove(org: string, id: string) { return (await api.delete(`/organizations/${org}/ai/knowledge/${id}`)).data; },
};

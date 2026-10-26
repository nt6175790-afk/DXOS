// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { PaginatedResponse } from './types';

export interface ChecklistItem {
  id: string; taskId: string; title: string; isCompleted: boolean; createdAt: string; updatedAt: string;
}
export interface TaskReviewer { employeeId: string; displayName: string | null }
export interface TaskPlanning { reviewer: TaskReviewer | null; checklist: ChecklistItem[] }
export interface TaskActivity { id: string; event: string; createdAt: string }
const path = (orgId: string, taskId: string) => `/organizations/${orgId}/tasks/${taskId}`;
export async function getTaskPlanning(orgId: string, taskId: string): Promise<TaskPlanning> {
  return (await api.get<TaskPlanning>(`${path(orgId, taskId)}/planning`)).data;
}
export async function setTaskReviewer(orgId: string, taskId: string, reviewerEmployeeId: string | null): Promise<void> {
  await api.patch(`${path(orgId, taskId)}/planning/reviewer`, { reviewerEmployeeId });
}
export async function addChecklistItem(orgId: string, taskId: string, title: string): Promise<void> {
  await api.post(`${path(orgId, taskId)}/checklist`, { title });
}
export async function updateChecklistItem(orgId: string, taskId: string, itemId: string, data: { title?: string; isCompleted?: boolean }): Promise<void> {
  await api.patch(`${path(orgId, taskId)}/checklist/${itemId}`, data);
}
export async function removeChecklistItem(orgId: string, taskId: string, itemId: string): Promise<void> {
  await api.delete(`${path(orgId, taskId)}/checklist/${itemId}`);
}
export async function listTaskActivity(orgId: string, taskId: string, after?: string): Promise<PaginatedResponse<TaskActivity>> {
  return (await api.get<PaginatedResponse<TaskActivity>>(`${path(orgId, taskId)}/activity`, { params: { limit: 25, after } })).data;
}

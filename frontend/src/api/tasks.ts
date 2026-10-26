// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  PaginatedResponse,
  TaskListParams,
  TaskComment,
  CreateTaskCommentRequest,
  TaskAttachment,
  CreateTaskAttachmentRequest,
  TaskCollaborationParams,
} from './types';

function basePath(orgId: string) {
  return `/organizations/${orgId}/tasks`;
}

export async function listTasks(
  orgId: string,
  params?: TaskListParams
): Promise<PaginatedResponse<Task>> {
  const response = await api.get<PaginatedResponse<Task>>(basePath(orgId), { params });
  return response.data;
}

export async function getTask(
  orgId: string,
  taskId: string
): Promise<Task> {
  const response = await api.get<Task>(`${basePath(orgId)}/${taskId}`);
  return response.data;
}

export async function createTask(
  orgId: string,
  data: CreateTaskRequest
): Promise<Task> {
  const response = await api.post<Task>(basePath(orgId), data);
  return response.data;
}

export async function updateTask(
  orgId: string,
  taskId: string,
  data: UpdateTaskRequest
): Promise<Task> {
  const response = await api.patch<Task>(
    `${basePath(orgId)}/${taskId}`,
    data
  );
  return response.data;
}

// === Comments ===
export async function listTaskComments(
  orgId: string,
  taskId: string,
  params?: TaskCollaborationParams
): Promise<PaginatedResponse<TaskComment>> {
  const response = await api.get<PaginatedResponse<TaskComment>>(
    `${basePath(orgId)}/${taskId}/comments`,
    { params }
  );
  return response.data;
}

export async function createTaskComment(
  orgId: string,
  taskId: string,
  data: CreateTaskCommentRequest
): Promise<TaskComment> {
  const response = await api.post<TaskComment>(
    `${basePath(orgId)}/${taskId}/comments`,
    data
  );
  return response.data;
}

// === Attachments ===
export async function listTaskAttachments(
  orgId: string,
  taskId: string,
  params?: TaskCollaborationParams
): Promise<PaginatedResponse<TaskAttachment>> {
  const response = await api.get<PaginatedResponse<TaskAttachment>>(
    `${basePath(orgId)}/${taskId}/attachments`,
    { params }
  );
  return response.data;
}

export async function createTaskAttachment(
  orgId: string,
  taskId: string,
  data: CreateTaskAttachmentRequest
): Promise<TaskAttachment> {
  const response = await api.post<TaskAttachment>(
    `${basePath(orgId)}/${taskId}/attachments`,
    data
  );
  return response.data;
}

export async function deleteTaskAttachment(
  orgId: string,
  taskId: string,
  attachmentId: string
): Promise<void> {
  await api.delete(
    `${basePath(orgId)}/${taskId}/attachments/${attachmentId}`
  );
}

// === Planning ===
export interface ChecklistItem {
  id: string; taskId: string; title: string; isCompleted: boolean; createdAt: string; updatedAt: string;
}
export interface TaskReviewer { employeeId: string; displayName: string | null }
export interface TaskPlanning { reviewer: TaskReviewer | null; checklist: ChecklistItem[] }
export interface TaskActivity { id: string; event: string; createdAt: string }
const planPath = (orgId: string, taskId: string) => `${basePath(orgId)}/${taskId}`;
export async function getTaskPlanning(orgId: string, taskId: string): Promise<TaskPlanning> {
  return (await api.get<TaskPlanning>(`${planPath(orgId, taskId)}/planning`)).data;
}
export async function setTaskReviewer(orgId: string, taskId: string, reviewerEmployeeId: string | null): Promise<void> {
  await api.patch(`${planPath(orgId, taskId)}/planning/reviewer`, { reviewerEmployeeId });
}
export async function addChecklistItem(orgId: string, taskId: string, title: string): Promise<void> {
  await api.post(`${planPath(orgId, taskId)}/checklist`, { title });
}
export async function updateChecklistItem(orgId: string, taskId: string, itemId: string, data: { title?: string; isCompleted?: boolean }): Promise<void> {
  await api.patch(`${planPath(orgId, taskId)}/checklist/${itemId}`, data);
}
export async function removeChecklistItem(orgId: string, taskId: string, itemId: string): Promise<void> {
  await api.delete(`${planPath(orgId, taskId)}/checklist/${itemId}`);
}
export async function listTaskActivity(orgId: string, taskId: string, after?: string): Promise<PaginatedResponse<TaskActivity>> {
  return (await api.get<PaginatedResponse<TaskActivity>>(`${planPath(orgId, taskId)}/activity`, { params: { limit: 25, after } })).data;
}

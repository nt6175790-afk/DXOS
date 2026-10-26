// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  Notification,
  PaginatedResponse,
  NotificationListParams,
  NotificationSummary,
} from './types';

function basePath(orgId: string) {
  return `/organizations/${orgId}/notifications`;
}

export async function listNotifications(
  orgId: string,
  params?: NotificationListParams
): Promise<PaginatedResponse<Notification>> {
  const response = await api.get<PaginatedResponse<Notification>>(basePath(orgId), { params });
  return response.data;
}

export async function markNotificationAsRead(
  orgId: string,
  notificationId: string
): Promise<Notification> {
  const response = await api.patch<Notification>(
    `${basePath(orgId)}/${notificationId}/read`
  );
  return response.data;
}

export async function getNotificationSummary(
  orgId: string
): Promise<NotificationSummary> {
  const response = await api.get<NotificationSummary>(`${basePath(orgId)}/summary`);
  return response.data;
}

export async function markAllNotificationsAsRead(
  orgId: string
): Promise<{ updatedCount: number }> {
  const response = await api.patch<{ updatedCount: number }>(`${basePath(orgId)}/read-all`);
  return response.data;
}


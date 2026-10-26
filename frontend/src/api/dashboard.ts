// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { TaskPriority, TaskStatus } from './types';

interface Preview<T> { items: T[]; hasMore: boolean }
interface Population { total: number; active: number; inactive: number }
export interface DashboardData {
  organizationId: string;
  generatedAt: string;
  tasks: null | {
    total: number; byStatus: Record<TaskStatus, number>; open: number; overdue: number; unassigned: number;
    completionPercent: number | null; health: 'EMPTY' | 'ATTENTION' | 'ON_TRACK'; overdueHasMore: boolean;
    overdueItems: { id: string; title: string; status: TaskStatus; priority: TaskPriority; progressPercent: number; dueAt: string }[];
  };
  departments: null | (Population & Preview<{ id: string; name: string; status: string; employeeCount: number | null; openTasks: number | null }>);
  employees: Population | null;
  workload: null | Preview<{ employeeId: string; displayName: string; status: string; openTasks: number }>;
  notifications: { total: number; unread: number };
  activity: null | Preview<{ id: string; event: string; resourceType: string; resourceId: string | null; outcome: string; createdAt: string }>;
}
export async function getDashboard(organizationId: string): Promise<DashboardData> {
  return (await api.get<DashboardData>(`/organizations/${organizationId}/dashboard`)).data;
}

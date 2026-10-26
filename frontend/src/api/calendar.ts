// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { PaginatedResponse, TaskPriority, TaskStatus } from './types';
export interface CalendarTask { id: string; title: string; dueAt: string; priority: TaskPriority; status: TaskStatus; progressPercent: number }
export interface CalendarEvent {
  id: string; title: string; description: string | null; kind: 'EVENT' | 'MEETING'; startsAt: string; endsAt: string;
  location: string | null; status: 'SCHEDULED' | 'CANCELLED'; createdAt: string; updatedAt: string;
}
export interface CalendarEventInput { title: string; kind: 'EVENT' | 'MEETING'; startsAt: string; endsAt: string; description?: string | null; location?: string | null }
export interface CalendarRange { from: string; until: string }
const base = (orgId: string) => `/organizations/${orgId}/calendar`;
async function list<T>(orgId: string, range: CalendarRange, type: 'tasks' | 'events', after?: string): Promise<PaginatedResponse<T>> {
  const response = await api.get<Record<string, PaginatedResponse<T> | null>>(base(orgId), { params: { ...range, type, after, limit: 100 } });
  const page = response.data[type];
  if (!page) throw { success: false, error: { code: 'FORBIDDEN', message: 'Không có quyền xem lịch này.', requestId: '' } };
  return page;
}
export const listCalendarTasks = (orgId: string, range: CalendarRange, after?: string) => list<CalendarTask>(orgId, range, 'tasks', after);
export const listCalendarEvents = (orgId: string, range: CalendarRange, after?: string) => list<CalendarEvent>(orgId, range, 'events', after);
export async function createCalendarEvent(orgId: string, data: CalendarEventInput): Promise<CalendarEvent> {
  return (await api.post<CalendarEvent>(`${base(orgId)}/events`, data)).data;
}
export async function updateCalendarEvent(orgId: string, id: string, data: Partial<CalendarEventInput> & { status?: 'SCHEDULED' | 'CANCELLED' }): Promise<CalendarEvent> {
  return (await api.patch<CalendarEvent>(`${base(orgId)}/events/${id}`, data)).data;
}

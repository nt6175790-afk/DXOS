// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { Shift } from './shifts';

export interface WorkSchedule {
  id: string;
  organizationId: string;
  employeeId: string;
  shiftId: string | null;
  workDate: string;
  isOff: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  shift: Shift | null;
  employee: {
    id: string;
    employeeCode: string;
    displayName: string;
    jobTitle: string | null;
    departmentId: string | null;
    department: {
      id: string;
      name: string;
      code: string;
    } | null;
  };
}

export interface CreateScheduleInput {
  employeeId: string;
  shiftId?: string;
  workDate?: string;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  isOff?: boolean;
  notes?: string;
}

export interface UpdateScheduleInput {
  shiftId?: string;
  isOff?: boolean;
  notes?: string;
}

export interface ListSchedulesParams {
  from?: string;
  to?: string;
  employeeId?: string;
  departmentId?: string;
  shiftId?: string;
}

export async function listSchedules(
  organizationId: string,
  params?: ListSchedulesParams,
): Promise<WorkSchedule[]> {
  const res = await api.get<WorkSchedule[]>(`/organizations/${organizationId}/schedules`, {
    params,
  });
  return res.data;
}

export async function assignSchedule(
  organizationId: string,
  input: CreateScheduleInput,
): Promise<WorkSchedule[]> {
  const res = await api.post<WorkSchedule[]>(`/organizations/${organizationId}/schedules`, input);
  return res.data;
}

export async function updateSchedule(
  organizationId: string,
  scheduleId: string,
  input: UpdateScheduleInput,
): Promise<WorkSchedule> {
  const res = await api.patch<WorkSchedule>(
    `/organizations/${organizationId}/schedules/${scheduleId}`,
    input,
  );
  return res.data;
}

export async function deleteSchedule(
  organizationId: string,
  scheduleId: string,
): Promise<{ success: boolean; message: string }> {
  const res = await api.delete<{ success: boolean; message: string }>(
    `/organizations/${organizationId}/schedules/${scheduleId}`,
  );
  return res.data;
}

export async function getEmployeeSchedule(
  organizationId: string,
  employeeId: string,
  from?: string,
  to?: string,
): Promise<WorkSchedule[]> {
  const res = await api.get<WorkSchedule[]>(
    `/organizations/${organizationId}/schedules/employees/${employeeId}`,
    {
      params: { from, to },
    },
  );
  return res.data;
}

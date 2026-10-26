// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { PaginatedResponse, PaginationParams } from './types';
import type { Shift } from './shifts';
import type { WorkSchedule } from './schedules';

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE' | 'INCOMPLETE';

export interface AttendanceRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  shiftId?: string | null;
  workDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  status: AttendanceStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  shift?: Shift | null;
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

export interface TodayAttendanceResponse {
  isEmployee: boolean;
  employee: {
    id: string;
    displayName: string;
    employeeCode: string;
    status: string;
  } | null;
  record: AttendanceRecord | null;
  approvedLeave: {
    id: string;
    leaveType: string;
    startsAt: string;
    endsAt: string;
    daysCount: number;
    reason: string;
  } | null;
  todayDate: string;
  todaySchedule?: WorkSchedule | null;
  todayShift?: Shift | null;
  isOff?: boolean;
}

export interface AttendanceSummary {
  period: {
    from: string;
    to: string;
  };
  totalWorkDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  totalWorkedMinutes: number;
  averageWorkedMinutes: number;
  totalRecords: number;
}

export interface ListAttendanceParams extends PaginationParams {
  employeeId?: string;
  workDate?: string;
  from?: string;
  to?: string;
  status?: AttendanceStatus;
}

export interface AttendanceSummaryParams {
  employeeId?: string;
  month?: string;
  from?: string;
  to?: string;
}

const base = (orgId: string) => `/organizations/${orgId}/attendance`;

export async function getTodayAttendance(organizationId: string): Promise<TodayAttendanceResponse> {
  const res = await api.get<TodayAttendanceResponse>(`${base(organizationId)}/today`);
  return res.data;
}

export interface AttendancePosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
}

export interface AttendanceLocationPolicy {
  office: { label: string; latitude: number; longitude: number; updatedAt: string } | null;
  radiusMeters: number;
  maxAccuracyMeters: number;
  maxAgeSeconds: number;
}

export async function getAttendanceLocation(organizationId: string): Promise<AttendanceLocationPolicy> {
  return (await api.get<AttendanceLocationPolicy>(`${base(organizationId)}/location`)).data;
}

export async function setAttendanceLocation(organizationId: string, office: { label: string; latitude: number; longitude: number }): Promise<AttendanceLocationPolicy> {
  return (await api.put<AttendanceLocationPolicy>(`${base(organizationId)}/location`, office)).data;
}

export async function checkIn(organizationId: string, note: string | undefined, location: AttendancePosition): Promise<AttendanceRecord> {
  const res = await api.post<AttendanceRecord>(`${base(organizationId)}/check-in`, { note, location });
  return res.data;
}

export async function checkOut(organizationId: string, note: string | undefined, location: AttendancePosition): Promise<AttendanceRecord> {
  const res = await api.post<AttendanceRecord>(`${base(organizationId)}/check-out`, { note, location });
  return res.data;
}

export async function listAttendance(
  organizationId: string,
  params?: ListAttendanceParams,
): Promise<PaginatedResponse<AttendanceRecord>> {
  const res = await api.get<PaginatedResponse<AttendanceRecord>>(base(organizationId), { params });
  return res.data;
}

export async function getAttendanceSummary(
  organizationId: string,
  params?: AttendanceSummaryParams,
): Promise<AttendanceSummary> {
  const res = await api.get<AttendanceSummary>(`${base(organizationId)}/summary`, { params });
  return res.data;
}

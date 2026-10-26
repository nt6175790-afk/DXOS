// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { PaginatedResponse } from './types';

export type LeaveType = 'ANNUAL' | 'SICK' | 'PERSONAL' | 'UNPAID' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveRequest {
  id: string;
  organizationId: string;
  employeeId: string;
  createdByUserId: string;
  leaveType: LeaveType;
  startsAt: string;
  endsAt: string;
  daysCount: number;
  reason: string;
  status: LeaveStatus;
  reviewerUserId: string | null;
  reviewerNote: string | null;
  reviewedAt: string | null;
  calendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface CreateLeaveRequestInput {
  employeeId: string;
  leaveType: LeaveType;
  startsAt: string;
  endsAt: string;
  reason: string;
}

export interface ListLeaveRequestsQuery {
  status?: LeaveStatus;
  employeeId?: string;
  mine?: boolean;
  limit?: number;
  after?: string;
}

export interface ApproveLeaveRequestInput {
  note?: string;
}

export interface RejectLeaveRequestInput {
  reason: string;
}

export interface CancelLeaveRequestInput {
  reason?: string;
}

const base = (orgId: string) => `/organizations/${orgId}/leave-requests`;

export async function listLeaveRequests(orgId: string, query?: ListLeaveRequestsQuery): Promise<PaginatedResponse<LeaveRequest>> {
  const res = await api.get<PaginatedResponse<LeaveRequest>>(base(orgId), { params: query });
  return res.data;
}

export async function getLeaveRequest(orgId: string, leaveId: string): Promise<LeaveRequest> {
  const res = await api.get<LeaveRequest>(`${base(orgId)}/${leaveId}`);
  return res.data;
}

export async function createLeaveRequest(orgId: string, input: CreateLeaveRequestInput): Promise<LeaveRequest> {
  const res = await api.post<LeaveRequest>(base(orgId), input);
  return res.data;
}

export async function approveLeaveRequest(orgId: string, leaveId: string, input?: ApproveLeaveRequestInput): Promise<LeaveRequest> {
  const res = await api.post<LeaveRequest>(`${base(orgId)}/${leaveId}/approve`, input ?? {});
  return res.data;
}

export async function rejectLeaveRequest(orgId: string, leaveId: string, input: RejectLeaveRequestInput): Promise<LeaveRequest> {
  const res = await api.post<LeaveRequest>(`${base(orgId)}/${leaveId}/reject`, input);
  return res.data;
}

export async function cancelLeaveRequest(orgId: string, leaveId: string, input?: CancelLeaveRequestInput): Promise<LeaveRequest> {
  const res = await api.post<LeaveRequest>(`${base(orgId)}/${leaveId}/cancel`, input ?? {});
  return res.data;
}

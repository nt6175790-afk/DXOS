// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';

export interface Shift {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  gracePeriodMinutes: number;
  isOvernight: boolean;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShiftInput {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakStart?: string;
  breakEnd?: string;
  gracePeriodMinutes?: number;
  isOvernight?: boolean;
  isActive?: boolean;
  description?: string;
}

export interface UpdateShiftInput {
  name?: string;
  code?: string;
  startTime?: string;
  endTime?: string;
  breakStart?: string;
  breakEnd?: string;
  gracePeriodMinutes?: number;
  isOvernight?: boolean;
  isActive?: boolean;
  description?: string;
}

export interface ListShiftsParams {
  search?: string;
  isActive?: boolean;
}

export async function listShifts(organizationId: string, params?: ListShiftsParams): Promise<Shift[]> {
  const res = await api.get<Shift[]>(`/organizations/${organizationId}/shifts`, {
    params,
  });
  return res.data;
}

export async function getShift(organizationId: string, shiftId: string): Promise<Shift> {
  const res = await api.get<Shift>(`/organizations/${organizationId}/shifts/${shiftId}`);
  return res.data;
}

export async function createShift(organizationId: string, input: CreateShiftInput): Promise<Shift> {
  const res = await api.post<Shift>(`/organizations/${organizationId}/shifts`, input);
  return res.data;
}

export async function updateShift(
  organizationId: string,
  shiftId: string,
  input: UpdateShiftInput,
): Promise<Shift> {
  const res = await api.patch<Shift>(`/organizations/${organizationId}/shifts/${shiftId}`, input);
  return res.data;
}

export async function deleteShift(
  organizationId: string,
  shiftId: string,
): Promise<{ success: boolean; message: string }> {
  const res = await api.delete<{ success: boolean; message: string }>(
    `/organizations/${organizationId}/shifts/${shiftId}`,
  );
  return res.data;
}

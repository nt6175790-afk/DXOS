// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { MyScheduleOverview, MyScheduleParams } from './types';

export async function getMySchedule(
  organizationId: string,
  params?: MyScheduleParams,
): Promise<MyScheduleOverview> {
  const queryParams = new URLSearchParams();
  if (params?.month) queryParams.set('month', params.month);
  if (params?.from) queryParams.set('from', params.from);
  if (params?.to) queryParams.set('to', params.to);

  const queryString = queryParams.toString();
  const url = `/organizations/${organizationId}/my-schedule${queryString ? `?${queryString}` : ''}`;
  const response = await api.get<MyScheduleOverview>(url);
  return response.data;
}

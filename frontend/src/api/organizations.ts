// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  Organization,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  PaginatedResponse,
  PaginationParams,
} from './types';

export async function listOrganizations(
  params?: PaginationParams
): Promise<PaginatedResponse<Organization>> {
  const response = await api.get<PaginatedResponse<Organization>>('/organizations', { params });
  return response.data;
}

export async function getOrganization(orgId: string): Promise<Organization> {
  const response = await api.get<Organization>(`/organizations/${orgId}`);
  return response.data;
}

export async function createOrganization(
  data: CreateOrganizationRequest
): Promise<Organization> {
  const response = await api.post<Organization>('/organizations', data);
  return response.data;
}

export async function updateOrganization(
  orgId: string,
  data: UpdateOrganizationRequest
): Promise<Organization> {
  const response = await api.patch<Organization>(`/organizations/${orgId}`, data);
  return response.data;
}

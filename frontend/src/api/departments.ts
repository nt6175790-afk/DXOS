// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  Department,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  PaginatedResponse,
  DepartmentListParams,
} from './types';

function basePath(orgId: string) {
  return `/organizations/${orgId}/departments`;
}

export async function listDepartments(
  orgId: string,
  params?: DepartmentListParams
): Promise<PaginatedResponse<Department>> {
  const response = await api.get<PaginatedResponse<Department>>(basePath(orgId), { params });
  return response.data;
}

export async function getDepartment(
  orgId: string,
  departmentId: string
): Promise<Department> {
  const response = await api.get<Department>(`${basePath(orgId)}/${departmentId}`);
  return response.data;
}

export async function createDepartment(
  orgId: string,
  data: CreateDepartmentRequest
): Promise<Department> {
  const response = await api.post<Department>(basePath(orgId), data);
  return response.data;
}

export async function updateDepartment(
  orgId: string,
  departmentId: string,
  data: UpdateDepartmentRequest
): Promise<Department> {
  const response = await api.patch<Department>(
    `${basePath(orgId)}/${departmentId}`,
    data
  );
  return response.data;
}

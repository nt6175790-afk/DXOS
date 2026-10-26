// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  Employee,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  PaginatedResponse,
  EmployeeListParams,
} from './types';

function basePath(orgId: string) {
  return `/organizations/${orgId}/employees`;
}

export async function listEmployees(
  orgId: string,
  params?: EmployeeListParams
): Promise<PaginatedResponse<Employee>> {
  const response = await api.get<PaginatedResponse<Employee>>(basePath(orgId), { params });
  return response.data;
}

export async function getEmployee(
  orgId: string,
  employeeId: string
): Promise<Employee> {
  const response = await api.get<Employee>(`${basePath(orgId)}/${employeeId}`);
  return response.data;
}

export async function createEmployee(
  orgId: string,
  data: CreateEmployeeRequest
): Promise<Employee> {
  const response = await api.post<Employee>(basePath(orgId), data);
  return response.data;
}

export async function updateEmployee(
  orgId: string,
  employeeId: string,
  data: UpdateEmployeeRequest
): Promise<Employee> {
  const response = await api.patch<Employee>(
    `${basePath(orgId)}/${employeeId}`,
    data
  );
  return response.data;
}

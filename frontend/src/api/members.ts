// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  OrganizationMemberPage,
  MemberListParams,
  RoleAssignmentResult,
  OrganizationRolePage,
  RoleListParams,
  RoleSummary,
} from './types';

function basePath(orgId: string) {
  return `/organizations/${orgId}/members`;
}

export async function listMembers(
  orgId: string,
  params?: MemberListParams
): Promise<OrganizationMemberPage> {
  const response = await api.get<OrganizationMemberPage>(basePath(orgId), { params });
  return response.data;
}

export { listRoles, listAllRoles } from './roles';

export async function assignRole(
  orgId: string,
  membershipId: string,
  roleId: string
): Promise<RoleAssignmentResult> {
  const response = await api.post<RoleAssignmentResult>(
    `${basePath(orgId)}/${membershipId}/roles`,
    { roleId }
  );
  return response.data;
}

export async function revokeRole(
  orgId: string,
  membershipId: string,
  roleId: string
): Promise<RoleAssignmentResult> {
  const response = await api.delete<RoleAssignmentResult>(
    `${basePath(orgId)}/${membershipId}/roles/${roleId}`
  );
  return response.data;
}


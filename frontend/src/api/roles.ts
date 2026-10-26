// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  RoleSummary,
  OrganizationRolePage,
  RoleListParams,
  PermissionsResponse,
} from './types';

/**
 * List organization roles.
 * Endpoint: GET /api/v1/organizations/:organizationId/roles
 * Requires `role:read`.
 */
export async function listRoles(
  orgId: string,
  params?: RoleListParams
): Promise<OrganizationRolePage> {
  const response = await api.get<OrganizationRolePage>(
    `/organizations/${orgId}/roles`,
    { params }
  );
  return response.data;
}

/**
 * Progressively fetches all pages of organization roles using cursor pagination
 * until nextCursor is null.
 * Ensures complete catalog discovery without missing roles across multiple keyset pages.
 */
export async function listAllRoles(orgId: string): Promise<RoleSummary[]> {
  const allRoles: RoleSummary[] = [];
  let cursor: string | null = null;

  do {
    const page = await listRoles(orgId, {
      limit: 100,
      after: cursor || undefined,
    });
    allRoles.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  return allRoles;
}

// === Permissions ===
export async function getPermissions(orgId: string): Promise<PermissionsResponse> {
  const response = await api.get<PermissionsResponse>(`/organizations/${orgId}/permissions`);
  return response.data;
}

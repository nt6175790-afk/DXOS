// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useContext } from 'react';
import { PermissionContext } from '@/contexts/PermissionContext';
import type { Permission } from '@/api/types';

/**
 * Real Permission Hook — DX-OS V1.
 *
 * Connected to GET /api/v1/organizations/:organizationId/permissions via PermissionContext.
 *
 * Provides:
 * - `permissions`: exact array of permissions granted to the current user in the active org
 * - `hasPermission(permission)`: checks if the exact permission is granted
 * - `hasAnyPermission(...permissions)`: checks if any of the given permissions is granted
 * - `isLoading`: boolean indicating if permission discovery is in progress
 * - `error`: ApiError if permission discovery failed (e.g. 401, 403, network)
 * - `refreshPermissions()`: manual reload of permissions
 *
 * Cache and tenant isolation:
 * - Automatically scoped to `currentOrg.id`
 * - Invalidated immediately on organization switch
 * - Invalidated on logout
 * - No client-side permission invention or admin assumption
 */
export function usePermission() {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    return {
      permissions: [] as Permission[],
      hasPermission: (_permission: Permission) => false,
      hasAnyPermission: (..._permissions: Permission[]) => false,
      isLoading: false,
      error: null,
      refreshPermissions: async () => {},
    };
  }
  return ctx;
}

export function clearPermissionCache() {
  // Handled reactively by PermissionProvider on org change and logout.
  // Function preserved for backward compatibility.
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { PermissionsResponse } from './types';

export async function getPermissions(orgId: string): Promise<PermissionsResponse> {
  const response = await api.get<PermissionsResponse>(`/organizations/${orgId}/permissions`);
  return response.data;
}

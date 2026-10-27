// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
export interface OrganizationAccount { id: string; email: string; displayName: string | null; accountStatus: string; membershipId: string; membershipStatus: string }
export interface EditableRole { id: string; key: string; name: string; isActive: boolean; permissionKeys: string[] }
const base = (org: string) => `/organizations/${org}`;
export const accountsApi = {
  list: async (org: string, after?: string): Promise<{ items: OrganizationAccount[]; nextCursor: string | null }> => (await api.get(base(org) + '/users', { params: { limit: 25, after } })).data,
  create: async (org: string, data: { email: string; displayName: string; password: string }): Promise<OrganizationAccount> => (await api.post(base(org) + '/users', data)).data,
  update: async (org: string, id: string, data: { displayName?: string; membershipStatus?: string }): Promise<OrganizationAccount> => (await api.patch(base(org) + '/users/' + id, data)).data,
  remove: async (org: string, id: string) => (await api.delete(base(org) + '/users/' + id)).data,
  role: async (org: string, id: string): Promise<EditableRole> => (await api.get(base(org) + '/roles/' + id)).data,
  catalog: async (org: string): Promise<{ items: { key: string }[] }> => (await api.get(base(org) + '/roles/permission-catalog')).data,
  createRole: async (org: string, data: { key: string; name: string; permissionKeys: string[] }): Promise<EditableRole> => (await api.post(base(org) + '/roles', data)).data,
  updateRole: async (org: string, id: string, data: { name?: string; isActive?: boolean; permissionKeys?: string[] }): Promise<EditableRole> => (await api.patch(base(org) + '/roles/' + id, data)).data,
  deleteRole: async (org: string, id: string) => (await api.delete(base(org) + '/roles/' + id)).data,
};

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { PaginatedResponse } from './types';
export type SearchCategory = 'employees' | 'tasks' | 'documents' | 'departments' | 'notifications';
export interface SearchItem { id: string; title: string; subtitle: string | null }
export interface SearchResult { groups: Record<SearchCategory, PaginatedResponse<SearchItem> | null> }
export async function searchOrganization(orgId: string, q: string, type: SearchCategory | 'all', after?: string): Promise<SearchResult> {
  return (await api.get<SearchResult>(`/organizations/${orgId}/search`, { params: { q, type, after, limit: type === 'all' ? 5 : 25 } })).data;
}

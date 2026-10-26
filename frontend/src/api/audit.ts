// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { AuditEvent, PaginatedResponse, AuditListParams } from './types';

export async function listAuditLogs(
  orgId: string,
  params?: AuditListParams
): Promise<PaginatedResponse<AuditEvent>> {
  const response = await api.get<PaginatedResponse<AuditEvent>>(
    `/organizations/${orgId}/audit-logs`,
    { params }
  );
  return response.data;
}

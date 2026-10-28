// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const uuid = { type: 'string', format: 'uuid' };
const organization = { in: 'path', name: 'organizationId', required: true, schema: uuid };
const base = { tags: ['Approvals'], security: [{ bearerAuth: [] }], 'x-required-permission': 'approval:read', parameters: [organization],
  description: 'JWT + ACTIVE organization membership + approval:read. Existing requester/operator scope applies. PAYROLL additionally requires payroll:read; otherwise excluded from list, summary and AI results. No automatic grants.',
  responses: { '401': { description: 'Authentication required' }, '403': { description: 'Foreign/inactive tenant, insufficient grant, inaccessible request or PAYROLL detail without payroll:read' }, '400': { description: 'Invalid input or cursor outside the visible tenant/requester/filter scope' } } };
export const approvalReadPaths = {
  '/organizations/{organizationId}/approvals': { get: { ...base, summary: 'List visible approval requests',
    parameters: [organization, { in: 'query', name: 'after', schema: uuid }, { in: 'query', name: 'limit', schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 } },
      ...['status', 'type', 'requesterId', 'mine', 'pending'].map(name => ({ in: 'query', name, schema: name === 'requesterId' ? uuid : name === 'mine' || name === 'pending' ? { type: 'boolean' } : { type: 'string' } }))],
    responses: { ...base.responses, '200': { description: '{items,nextCursor}; createdAt DESC, id DESC. Last returned row is the cursor; preserve filters between pages. Payload returned only within its domain permission boundary.' } },
  } },
  '/organizations/{organizationId}/approvals/summary': { get: { ...base, summary: 'Count only approval requests visible to this actor', responses: { ...base.responses, '200': { description: '{pendingCount,approvedCount,rejectedCount,myPendingCount}; same tenant/requester/payroll permission scope as list' } } } },
  '/organizations/{organizationId}/approvals/{approvalId}': { get: { ...base, summary: 'Read one visible approval request', parameters: [organization, { in: 'path', name: 'approvalId', required: true, schema: uuid }], responses: { ...base.responses, '200': { description: 'Existing safe approval projection, including authorized domain payload; no account credentials or sessions' }, '404': { description: 'Missing or foreign resource after successful route-tenant authorization' } } } },
};

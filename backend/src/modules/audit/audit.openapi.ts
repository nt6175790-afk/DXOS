// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { AUDIT_EVENT_NAMES } from './audit-catalog';
import { PERMISSIONS } from '../rbac/permission-catalog';

const error = { $ref: '#/components/responses/ErrorResponse' };
export const auditPaths = {
  '/organizations/{organizationId}/audit-logs': {
    get: {
      summary: 'Read the authorized organization audit history', security: [{ bearerAuth: [] }],
      'x-required-permission': PERMISSIONS.AUDIT_READ,
      description: 'Active organization membership and audit:read required. No default grant. Global IAM/denial events are excluded. Append-only history has no write/delete API.',
      parameters: [
        { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        { name: 'after', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Previous nextCursor in the same tenant and event filter.' },
        { name: 'event', in: 'query', schema: { type: 'string', enum: AUDIT_EVENT_NAMES } },
      ],
      responses: {
        '200': { description: 'Newest first, ordered by createdAt then id descending', content: {
          'application/json': { schema: { $ref: '#/components/schemas/AuditPage' } },
        } },
        '400': error, '401': error, '403': error, '500': error,
      },
    },
  },
};
export const auditSchemas = {
  AuditEvent: {
    type: 'object', additionalProperties: false,
    required: ['id', 'organizationId', 'actorUserId', 'event', 'resourceType', 'resourceId', 'outcome', 'source', 'requestId', 'metadata', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' }, organizationId: { type: 'string', format: 'uuid', nullable: true },
      actorUserId: { type: 'string', format: 'uuid', nullable: true }, event: { type: 'string', enum: AUDIT_EVENT_NAMES },
      resourceType: { type: 'string', enum: ['auth', 'authorization', 'organization', 'membership', 'role', 'notification', 'file', 'ai', 'department', 'employee', 'task', 'task_comment', 'task_attachment'] },
      resourceId: { type: 'string', format: 'uuid', nullable: true }, outcome: { type: 'string', enum: ['SUCCESS', 'FAILURE', 'DENIED'] },
      source: { type: 'string', enum: ['HTTP', 'SYSTEM'] }, requestId: { type: 'string', maxLength: 128, nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      metadata: { type: 'object', additionalProperties: false, description: 'Maximum 1024 UTF-8 bytes; allowlisted fields only.', properties: {
        reason: { type: 'string', enum: ['INVALID_CREDENTIALS', 'ACCOUNT_INACTIVE', 'ACCOUNT_SUSPENDED', 'PERMISSION_DENIED'] },
        permission: { type: 'string', enum: Object.values(PERMISSIONS) },
        changedFields: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true,
          description: 'Event-specific field names only. Task update: title/description/assigneeEmployeeId/departmentId/status/priority/dueAt/progressPercent; task.assigned only assigneeEmployeeId; task.status_changed only status. Comment/attachment events require empty metadata. Existing Employee/Department/earlier policies unchanged. Values never included.',
          items: { type: 'string', enum: ['name', 'description', 'status', 'displayName', 'jobTitle', 'phone', 'departmentId', 'title', 'priority', 'dueAt', 'assigneeEmployeeId', 'progressPercent'] } },
      } },
    },
  },
  AuditPage: {
    type: 'object', required: ['items', 'nextCursor'], additionalProperties: false,
    properties: { items: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/AuditEvent' } },
      nextCursor: { type: 'string', format: 'uuid', nullable: true } },
  },
};

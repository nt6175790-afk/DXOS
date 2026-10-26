// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { NOTIFICATION_TYPES } from './notification-catalog';

const error = { $ref: '#/components/responses/ErrorResponse' };
const organization = { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const response = (schema: string) => ({ description: 'Recipient-owned notification data', content: {
  'application/json': { schema: { $ref: `#/components/schemas/${schema}` } },
} });
export const notificationPaths = {
  '/organizations/{organizationId}/notifications/summary': { get: {
    summary: 'Read exact own notification counters', security: [{ bearerAuth: [] }], parameters: [organization],
    description: 'ACTIVE user/organization/membership. Authenticated recipient only; strict empty query. Exact persisted counters across pages, no contents or identifiers, no successful-read audit.',
    responses: { '200': response('NotificationSummary'), '400': error, '401': error, '403': error, '409': error, '500': error },
  } },
  '/organizations/{organizationId}/notifications/read-all': { patch: {
    summary: 'Mark all own organization notifications as read', security: [{ bearerAuth: [] }], parameters: [organization],
    description: 'ACTIVE user/organization/membership. Atomically updates authenticated recipient only, across all categories. Preserves existing readAt/content. Idempotent, strict empty query/body, no read audit or new grant.',
    requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties: {} } } } },
    responses: { '200': response('NotificationReadAll'), '400': error, '401': error, '403': error, '409': error, '500': error },
  } },
  '/organizations/{organizationId}/notifications': { get: {
    summary: 'List own notifications in one organization', security: [{ bearerAuth: [] }],
    description: 'Requires active user, organization and membership, but no administrative permission. No recipient filter or public creation. Multi-organization users select one tenant per request.',
    parameters: [organization,
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
      { name: 'state', in: 'query', schema: { type: 'string', enum: ['read', 'unread'] } },
      { name: 'category', in: 'query', schema: { type: 'string', enum: ['work', 'organization', 'other'] }, description: 'task.assigned, organization.updated, or remaining types respectively.' },
      { name: 'after', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Prior nextCursor from this recipient and tenant; independent of read state. Newest createdAt then id descending.' },
    ], responses: { '200': response('NotificationPage'), '400': error, '401': error, '403': error, '409': error, '500': error },
  } },
  '/organizations/{organizationId}/notifications/{notificationId}/read': { patch: {
    summary: 'Mark own notification read', security: [{ bearerAuth: [] }],
    description: 'Active membership required. Idempotent: preserves first readAt and all other fields. Unknown/foreign identifiers return 403. No read audit event.',
    parameters: [organization, { name: 'notificationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
    requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties: {} } } } },
    responses: { '200': response('Notification'), '400': error, '401': error, '403': error, '409': error, '500': error },
  } },
};
export const notificationSchemas = {
  NotificationSummary: { type: 'object', additionalProperties: false, required: ['total', 'unread', 'read', 'categories'], properties: {
    total: { type: 'integer', minimum: 0 }, unread: { type: 'integer', minimum: 0 }, read: { type: 'integer', minimum: 0 },
    categories: { type: 'object', additionalProperties: false, required: ['work', 'organization', 'other'], properties: Object.fromEntries(['work', 'organization', 'other'].map((key) => [key, {
      type: 'object', additionalProperties: false, required: ['total', 'unread'], properties: { total: { type: 'integer', minimum: 0 }, unread: { type: 'integer', minimum: 0 } },
    }])) },
  } },
  NotificationReadAll: { type: 'object', additionalProperties: false, required: ['updatedCount'], properties: { updatedCount: { type: 'integer', minimum: 0 } } },
  Notification: { type: 'object', additionalProperties: false,
    required: ['id', 'organizationId', 'recipientUserId', 'type', 'title', 'body', 'metadata', 'createdAt', 'readAt', 'isRead'],
    properties: {
      id: { type: 'string', format: 'uuid' }, organizationId: { type: 'string', format: 'uuid' },
      recipientUserId: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: Object.values(NOTIFICATION_TYPES) },
      title: { type: 'string', minLength: 1, maxLength: 200 }, body: { type: 'string', minLength: 1, maxLength: 1000 },
      createdAt: { type: 'string', format: 'date-time' }, readAt: { type: 'string', format: 'date-time', nullable: true },
      isRead: { type: 'boolean', description: 'Derived from readAt != null' },
      metadata: { type: 'object', additionalProperties: false, description: 'Maximum 1024 UTF-8 bytes.',
        properties: { changedFields: { type: 'array', minItems: 1, maxItems: 1, items: { type: 'string', enum: ['name'] } },
          taskId: { type: 'string', format: 'uuid', description: 'Required sole metadata field for task.assigned; not permitted for organization.updated. Does not grant task access.' } } },
    },
  },
  NotificationPage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: {
    items: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/Notification' } },
    nextCursor: { type: 'string', format: 'uuid', nullable: true },
  } },
};

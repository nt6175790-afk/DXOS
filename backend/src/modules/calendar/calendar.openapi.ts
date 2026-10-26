// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const uuid = { type: 'string', format: 'uuid' };
const timestamp = { type: 'string', format: 'date-time' };
const eventFields = { title: { type: 'string', minLength: 1, maxLength: 200 }, kind: { type: 'string', enum: ['EVENT', 'MEETING'] },
  startsAt: timestamp, endsAt: timestamp, description: { type: 'string', nullable: true, minLength: 1, maxLength: 4000 },
  location: { type: 'string', nullable: true, minLength: 1, maxLength: 200 } };
const status = { type: 'string', enum: ['SCHEDULED', 'CANCELLED'] };
const security = [{ bearerAuth: [] }];
const org = { in: 'path', name: 'organizationId', required: true, schema: uuid };
const failures = Object.fromEntries(['400', '401', '403', '404', '409', '413', '500'].map((code) => [code, { $ref: '#/components/responses/ErrorResponse' }]));
const response = (name: string) => ({ description: name, content: { 'application/json': { schema: ref(name) } } });
const request = (name: string) => ({ required: true, content: { 'application/json': { schema: ref(name) } } });
const rules = 'JWT and ACTIVE user/session/organization/membership. Explicit existing RBAC grants, rechecked inside serializable transaction; no automatic role grants or role-name bypass. Unknown query/body fields rejected. Scoped foreign/missing event returns404 after authorization. 64KiB JSON limit. UTC persistence, timezone required; positive event duration at most31days. Atomic audit excludes content; successful reads are not audited.';
export const calendarPaths = {
  '/organizations/{organizationId}/calendar': { parameters: [org], get: { summary: 'List task deadlines and organization events', security,
    description: `${rules} task:read controls tasks, calendar:read controls events; unavailable groups null, no usable read grant or explicitly unauthorized group403. Positive [from,until) range up to62days. Tasks exclude CANCELLED and match dueAt; events overlap range including cancellations. dueAt/id or startsAt/id ascending keyset. Scoped missing/foreign/range-invalid after400, single group only.`,
    parameters: [{ in: 'query', name: 'from', required: true, schema: timestamp }, { in: 'query', name: 'until', required: true, schema: timestamp },
      { in: 'query', name: 'type', schema: { type: 'string', enum: ['all', 'tasks', 'events'], default: 'all' } },
      { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } }, { in: 'query', name: 'after', schema: uuid }],
    responses: { '200': response('CalendarPage'), ...failures },
  } },
  '/organizations/{organizationId}/calendar/events': { parameters: [org], post: { summary: 'Create an event or meeting', security,
    'x-required-permission': 'calendar:create', description: rules, requestBody: request('CreateCalendarEvent'), responses: { '201': response('CalendarEvent'), ...failures },
  } },
  '/organizations/{organizationId}/calendar/events/{eventId}': { parameters: [org, { in: 'path', name: 'eventId', required: true, schema: uuid }], patch: {
    summary: 'Update or cancel an event', security, 'x-required-permission': 'calendar:update', description: `${rules} Cancelled events cannot be edited/reopened. Exact no-op preserves updatedAt/audit. No delete endpoint.`,
    requestBody: request('UpdateCalendarEvent'), responses: { '200': response('CalendarEvent'), ...failures },
  } },
};
const page = (item: string) => ({ type: 'object', nullable: true, additionalProperties: false, required: ['items', 'nextCursor'], properties: {
  items: { type: 'array', maxItems: 100, items: ref(item) }, nextCursor: { ...uuid, nullable: true },
} });
export const calendarSchemas = {
  CalendarEvent: { type: 'object', additionalProperties: false, required: ['id', ...Object.keys(eventFields), 'status', 'createdAt', 'updatedAt'],
    properties: { id: uuid, ...eventFields, status, createdAt: timestamp, updatedAt: timestamp } },
  CreateCalendarEvent: { type: 'object', additionalProperties: false, required: ['title', 'kind', 'startsAt', 'endsAt'], properties: eventFields },
  UpdateCalendarEvent: { type: 'object', minProperties: 1, additionalProperties: false, properties: { ...eventFields, status } },
  CalendarTask: { type: 'object', additionalProperties: false, required: ['id', 'title', 'status', 'priority', 'dueAt', 'progressPercent'], properties: {
    id: uuid, title: { type: 'string' }, status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
    priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }, dueAt: timestamp, progressPercent: { type: 'integer', minimum: 0, maximum: 100 },
  } },
  CalendarPage: { type: 'object', additionalProperties: false, required: ['tasks', 'events'], properties: { tasks: page('CalendarTask'), events: page('CalendarEvent') } },
};

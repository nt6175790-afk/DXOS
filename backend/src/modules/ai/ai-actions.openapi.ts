// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const uuid = { type: 'string', format: 'uuid' };
const org = { name: 'organizationId', in: 'path', required: true, schema: uuid };
const id = { name: 'id', in: 'path', required: true, schema: uuid };
const error = { $ref: '#/components/responses/ErrorResponse' };
const operation = (summary: string, permissions: string[], withId = false) => ({ summary, security: [{ bearerAuth: [] }],
  description: 'JWT + ACTIVE organization membership; all permissions required: ' + permissions.join(', ') + '. No role-name bypass. See contracts/api/ai.md for privacy, confirmation, source and resource limits.',
  parameters: withId ? [org, id] : [org], responses: { '200': { description: 'Bounded safe tenant result; private no-store' }, '400': error, '401': error, '403': error, '404': error, '409': error, '502': error, '503': error } });
const body = (properties: object, required: string[]) => ({ required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties, required } } } });
export const aiActionsPaths = {
  '/organizations/{organizationId}/ai/task-drafts': { post: { ...operation('Propose task draft; does not create task', ['ai:use', 'task:create']), requestBody: body({ prompt: { type: 'string', minLength: 3, maxLength: 2000 } }, ['prompt']), responses: { ...operation('', []).responses, '201': { description: '{id,task:{title,description?,priority?,dueAt?},expiresAt,provider,requiresConfirmation:true}; 30 minute actor-bound draft' } } } },
  '/organizations/{organizationId}/ai/task-drafts/{id}/confirm': { post: { ...operation('Explicitly confirm/edit draft and create task exactly once', ['ai:use', 'task:create'], true), requestBody: body({ confirm: { type: 'boolean', const: true }, title: { type: 'string', minLength: 1, maxLength: 200 }, description: { type: 'string', maxLength: 10000 }, priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }, dueAt: { type: 'string', format: 'date-time' }, assigneeEmployeeId: uuid, departmentId: uuid }, ['confirm', 'title']) } },
  '/organizations/{organizationId}/ai/knowledge': { get: operation('List up to 100 opted-in PDF sources; createdAt/id ordering', ['ai:use', 'file:read']) },
  '/organizations/{organizationId}/ai/knowledge/search': { post: { ...operation('Read up to 5 PDF excerpts with file/page source', ['ai:use', 'file:read']), requestBody: body({ query: { type: 'string', minLength: 2, maxLength: 200 } }, ['query']) } },
  '/organizations/{organizationId}/ai/knowledge/{id}/index': { post: operation('Extract/index available generic PDF owned by actor (or file:delete operator)', ['ai:use', 'file:read', 'file:upload'], true) },
  '/organizations/{organizationId}/ai/knowledge/{id}': { delete: operation('Remove derived index only; preserve source file', ['ai:use', 'file:read', 'file:upload'], true) },
};

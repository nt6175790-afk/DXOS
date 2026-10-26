// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { taskCollaborationPaths, taskCollaborationSchemas } from './task-collaboration.openapi';
const error = { $ref: '#/components/responses/ErrorResponse' };
const json = (schema: object) => ({ 'application/json': { schema } });
const ref = { $ref: '#/components/schemas/Task' };
const uuid = { type: 'string', format: 'uuid' };
const optionalUuid = { ...uuid, nullable: true };
const title = { type: 'string', minLength: 1, maxLength: 200, description: 'Trimmed plain text, no controls.' };
const description = { type: 'string', nullable: true, minLength: 1, maxLength: 10000, description: 'Trimmed plain text; only LF/tab control characters allowed.' };
const status = { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] };
const progressPercent = { type: 'integer', minimum: 0, maximum: 100,
  description: 'TODO requires 0; IN_PROGRESS/CANCELLED 0–99; DONE 100. Status-only transition to DONE sets 100, TODO sets 0. Explicit inconsistent pairs return 409. Terminal tasks immutable.' };
const priority = { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] };
const dueAt = { type: 'string', format: 'date-time', nullable: true,
  description: 'Valid calendar timestamp with explicit Z/offset, seconds, optional 1–3 fractional digits; normalized to UTC year 1000–9999. Past timestamps allowed. Null clears.' };
const editable = { title, description, assigneeEmployeeId: optionalUuid, departmentId: optionalUuid, priority, dueAt };
const failures = { '400': error, '401': error, '403': error, '404': error, '409': error, '413': error, '500': error };
const security = [{ bearerAuth: [] }];
const tenant = { name: 'organizationId', in: 'path', required: true, schema: uuid };
const response = (schema: object) => ({ description: 'Authorized tenant-scoped result', content: json(schema) });
const rules = 'Active IAM session/User/organization/membership and exact grants. No automatic admin privilege. Inaccessible tenant 403; missing/foreign resource 404; inactive new reference or lifecycle conflict 409. JSON maximum decoded 64 KiB.';
export const taskPaths = {
  ...taskCollaborationPaths,
  '/organizations/{organizationId}/tasks': { parameters: [tenant],
    get: { summary: 'List organization tasks', security, 'x-required-permission': 'task:read', description: `${rules} ID ascending keyset pagination; all filters remain tenant-scoped.`,
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        { name: 'after', in: 'query', schema: uuid }, { name: 'status', in: 'query', schema: status },
        { name: 'priority', in: 'query', schema: priority }, { name: 'assigneeEmployeeId', in: 'query', schema: uuid },
        { name: 'departmentId', in: 'query', schema: uuid },
      ], responses: { '200': response({ $ref: '#/components/schemas/TaskPage' }), ...failures } },
    post: { summary: 'Create a task as the authenticated Employee', security, 'x-required-permission': 'task:create',
      description: `${rules} Non-null assignee additionally requires task:assign. Creator is derived from actor ACTIVE Employee; client creator fields rejected. Missing creator profile 404, inactive 409. Defaults TODO/MEDIUM. Task, audit and optional non-self assignment notice commit atomically.`,
      requestBody: { required: true, content: json({ $ref: '#/components/schemas/CreateTask' }) }, responses: { '201': response(ref), ...failures } },
  },
  '/organizations/{organizationId}/tasks/{taskId}': { parameters: [tenant, { name: 'taskId', in: 'path', required: true, schema: uuid }],
    get: { summary: 'Read a task', security, description: rules, 'x-required-permission': 'task:read', responses: { '200': response(ref), ...failures } },
    patch: { summary: 'Edit task content or assignment', security,
      'x-permission-matrix': { assignmentOnly: ['task:assign'], contentOnly: ['task:update'], mixed: ['task:assign', 'task:update'] },
      description: `${rules} Supplied assignee requires task:assign even when null/unchanged. Other supplied fields require task:update. Creator/organization immutable. TODO and IN_PROGRESS may transition to each other or DONE/CANCELLED. Terminal tasks reject every effective change; no-op preserves timestamp/audits. New assignee must have ACTIVE Employee/User/membership, new department ACTIVE. Audit or notification failure rolls back mutation.`,
      requestBody: { required: true, content: json({ $ref: '#/components/schemas/UpdateTask' }) }, responses: { '200': response(ref), ...failures } },
  },
};
export const taskSchemas = {
  ...taskCollaborationSchemas,
  Task: { type: 'object', additionalProperties: false,
    required: ['id', 'organizationId', 'creatorEmployeeId', 'assigneeEmployeeId', 'departmentId', 'title', 'description', 'status', 'progressPercent', 'priority', 'dueAt', 'createdAt', 'updatedAt'],
    properties: { id: uuid, organizationId: uuid, creatorEmployeeId: uuid, ...editable, status, progressPercent,
      createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } },
  CreateTask: { type: 'object', additionalProperties: false, required: ['title'], properties: { ...editable, priority: { ...priority, default: 'MEDIUM' } } },
  UpdateTask: { type: 'object', additionalProperties: false, minProperties: 1, properties: { ...editable, status, progressPercent } },
  TaskPage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
    properties: { items: { type: 'array', maxItems: 100, items: ref }, nextCursor: { ...uuid, nullable: true } } },
};

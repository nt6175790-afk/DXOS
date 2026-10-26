// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const error = { $ref: '#/components/responses/ErrorResponse' };
const json = (schema: object) => ({ 'application/json': { schema } });
const ref = { $ref: '#/components/schemas/Department' };
const uuid = { type: 'string', format: 'uuid' };
const name = { type: 'string', minLength: 1, maxLength: 200, description: 'Trimmed; no control characters.' };
const description = { type: 'string', nullable: true, minLength: 1, maxLength: 1000,
  description: 'Trimmed plain text; only LF/tab control characters allowed. Null clears it.' };
const status = { type: 'string', enum: ['ACTIVE', 'INACTIVE'] };
const security = [{ bearerAuth: [] }];
const failures = { '400': error, '401': error, '403': error, '404': error, '409': error, '413': error, '500': error };
const tenant = { name: 'organizationId', in: 'path', required: true, schema: uuid,
  description: 'Authoritative tenant UUID. Invalid/inaccessible tenant returns indistinguishable 403.' };
const success = (schema: object) => ({ description: 'Authorized tenant-scoped result', content: json(schema) });
const rules = 'Active IAM session, user, organization, membership and exact grant required. Missing or foreign resource in an authorized tenant returns 404. Strict JSON, maximum 64 KiB. No implicit owner/admin grants.';

export const departmentPaths = {
  '/organizations/{organizationId}/departments': {
    parameters: [tenant],
    get: { summary: 'List departments', security, description: `${rules} ID ascending keyset pagination; omitted status includes inactive rows.`,
      'x-required-permission': 'department:read', parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        { name: 'after', in: 'query', schema: uuid, description: 'Exclusive ID bound, never an authorization token.' },
        { name: 'status', in: 'query', schema: status },
      ], responses: { '200': success({ $ref: '#/components/schemas/DepartmentPage' }), ...failures } },
    post: { summary: 'Create a flat department', security, description: `${rules} Status defaults ACTIVE. Duplicate tenant code returns 409. Mutation and audit commit atomically.`,
      'x-required-permission': 'department:create',
      requestBody: { required: true, content: json({ $ref: '#/components/schemas/CreateDepartment' }) },
      responses: { '201': success(ref), ...failures } },
  },
  '/organizations/{organizationId}/departments/{departmentId}': {
    parameters: [tenant, { name: 'departmentId', in: 'path', required: true, schema: uuid }],
    get: { summary: 'Read a department', security, description: rules, 'x-required-permission': 'department:read',
      responses: { '200': success(ref), ...failures } },
    patch: { summary: 'Update department name, description or lifecycle', security,
      description: `${rules} Code and parent are immutable. ACTIVE and INACTIVE may transition both ways; no cascades. Empty PATCH rejected. No-op preserves timestamp and emits no audit. Audit failure rolls back mutation.`,
      'x-required-permission': 'department:update',
      requestBody: { required: true, content: json({ $ref: '#/components/schemas/UpdateDepartment' }) },
      responses: { '200': success(ref), ...failures } },
  },
};

export const departmentSchemas = {
  Department: { type: 'object', additionalProperties: false,
    required: ['id', 'organizationId', 'code', 'name', 'description', 'status', 'createdAt', 'updatedAt'],
    properties: { id: uuid, organizationId: uuid, code: { type: 'string', maxLength: 64,
      description: 'Immutable stored code; legacy values are preserved.' }, name, description, status,
    createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } },
  CreateDepartment: { type: 'object', additionalProperties: false, required: ['code', 'name'],
    properties: { code: { type: 'string', minLength: 1, maxLength: 64,
      description: 'Trimmed and uppercased before validation: ^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$. Unique within tenant including inactive rows.' }, name, description } },
  UpdateDepartment: { type: 'object', additionalProperties: false, minProperties: 1, properties: { name, description, status } },
  DepartmentPage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
    properties: { items: { type: 'array', maxItems: 100, items: ref }, nextCursor: { ...uuid, nullable: true } } },
};

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const error = { $ref: '#/components/responses/ErrorResponse' };
const json = (schema: object) => ({ 'application/json': { schema } });
const ref = { $ref: '#/components/schemas/Employee' };
const uuid = { type: 'string', format: 'uuid' };
const displayName = { type: 'string', minLength: 1, maxLength: 200, description: 'Trimmed business display name; no controls. Does not update User.' };
const jobTitle = { type: 'string', nullable: true, minLength: 1, maxLength: 200, description: 'Trimmed business title; no controls.' };
const phone = { type: 'string', nullable: true, minLength: 9, maxLength: 16, pattern: '^\\+[1-9][0-9]{7,14}$', description: 'Trimmed E.164-style business contact; not a verified identity.' };
const departmentId = { ...uuid, nullable: true };
const status = { type: 'string', enum: ['ACTIVE', 'INACTIVE'] };
const employeeCode = { type: 'string', minLength: 1, maxLength: 64,
  description: 'Trimmed, uppercased, then validated against ^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$. Immutable, unique in tenant including inactive profiles.' };
const security = [{ bearerAuth: [] }];
const failures = { '400': error, '401': error, '403': error, '404': error, '409': error, '413': error, '500': error };
const tenant = { name: 'organizationId', in: 'path', required: true, schema: uuid };
const success = (schema: object) => ({ description: 'Authorized tenant-scoped result', content: json(schema) });
const rules = 'Active IAM session/account/organization/membership and exact grant required. No automatic admin grants. Invalid/inaccessible tenant 403; missing/foreign employee/reference 404; ineligible same-tenant reference or duplicate 409. JSON only, decoded body limit 64 KiB.';

export const employeePaths = {
  '/organizations/{organizationId}/employees': {
    parameters: [tenant],
    get: { summary: 'List business employee profiles', security, description: `${rules} ID ascending keyset pagination. Status filter omitted includes all profiles. No global User search.`,
      'x-required-permission': 'employee:read', parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        { name: 'after', in: 'query', schema: uuid }, { name: 'status', in: 'query', schema: status },
        { name: 'departmentId', in: 'query', schema: uuid }, { name: 'userId', in: 'query', schema: uuid },
      ], responses: { '200': success({ $ref: '#/components/schemas/EmployeePage' }), ...failures } },
    post: { summary: 'Create an employee for an existing active member', security,
      description: `${rules} Validates target User via same-tenant ACTIVE membership, plus ACTIVE optional Department. Creates no credentials, memberships, roles, grants or sessions. Status starts ACTIVE. Audit is atomic.`,
      'x-required-permission': 'employee:create', requestBody: { required: true, content: json({ $ref: '#/components/schemas/CreateEmployee' }) },
      responses: { '201': success(ref), ...failures } },
  },
  '/organizations/{organizationId}/employees/{employeeId}': {
    parameters: [tenant, { name: 'employeeId', in: 'path', required: true, schema: uuid }],
    get: { summary: 'Read an employee', security, description: rules, 'x-required-permission': 'employee:read', responses: { '200': success(ref), ...failures } },
    patch: { summary: 'Update a business profile', security,
      description: `${rules} Immutable userId, organizationId and employeeCode. Null clears department/jobTitle/phone. No-op emits no audit/timestamp change. Reactivation requires eligible membership/User; changed non-null Department must be active. Historic inactive references remain on unrelated edits. Employee status never changes IAM. Audit failure rolls back mutation.`,
      'x-required-permission': 'employee:update', requestBody: { required: true, content: json({ $ref: '#/components/schemas/UpdateEmployee' }) },
      responses: { '200': success(ref), ...failures } },
  },
};

export const employeeSchemas = {
  Employee: { type: 'object', additionalProperties: false,
    required: ['id', 'organizationId', 'userId', 'departmentId', 'employeeCode', 'displayName', 'jobTitle', 'phone', 'status', 'createdAt', 'updatedAt'],
    properties: { id: uuid, organizationId: uuid, userId: uuid, departmentId, employeeCode, displayName, jobTitle, phone, status,
      createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } },
  CreateEmployee: { type: 'object', additionalProperties: false, required: ['userId', 'employeeCode', 'displayName'],
    properties: { userId: uuid, employeeCode, displayName, departmentId, jobTitle, phone } },
  UpdateEmployee: { type: 'object', additionalProperties: false, minProperties: 1,
    properties: { displayName, jobTitle, phone, departmentId, status } },
  EmployeePage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
    properties: { items: { type: 'array', maxItems: 100, items: ref }, nextCursor: { ...uuid, nullable: true } } },
};

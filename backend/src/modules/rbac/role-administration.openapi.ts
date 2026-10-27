// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { createRoleOperation } from './organization-accounts.openapi';
const error = { $ref: '#/components/responses/ErrorResponse' };
const uuid = { type: 'string', format: 'uuid' };
const security = [{ bearerAuth: [] }];
const organization = { name: 'organizationId', in: 'path', required: true, schema: uuid };
const membership = { name: 'membershipId', in: 'path', required: true, schema: uuid };

export const roleAdministrationPaths = {
  '/organizations/{organizationId}/roles': {
    post: createRoleOperation,
    get: { summary: 'List organization roles', security,
      description: 'Returns same-tenant role metadata for role administration. Requires role:read. Permission assignments and other internal fields are never returned; inactive roles remain visible with isActive false.',
      parameters: [organization, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } }, { name: 'after', in: 'query', schema: uuid }],
      responses: { '200': { description: 'Role page', content: { 'application/json': { schema: { $ref: '#/components/schemas/OrganizationRolePage' } } } }, '400': error, '401': error, '403': error, '500': error } },
  },
  '/organizations/{organizationId}/members': {
    get: { summary: 'List organization members and role summaries', security,
      description: 'Returns same-tenant member identity, lifecycle, employee summary and active/inactive role summaries. Credentials, sessions and permission internals are never returned.',
      parameters: [organization, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } }, { name: 'after', in: 'query', schema: uuid }],
      responses: { '200': { description: 'Member page', content: { 'application/json': { schema: { $ref: '#/components/schemas/OrganizationMemberPage' } } } }, '400': error, '401': error, '403': error, '500': error } },
  },
  '/organizations/{organizationId}/members/{membershipId}/roles': {
    post: { summary: 'Assign an existing role to a member', security,
      description: 'Requires role:assign. The actor must be active, cannot target self, and may grant only permissions already effective for the actor. Assignment and audit are one transaction.',
      parameters: [organization, membership], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AssignRoleRequest' } } } },
      responses: { '201': { description: 'Role assigned', content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleAssignmentResult' } } } }, '400': error, '401': error, '403': error, '404': error, '409': error, '500': error } },
  },
  '/organizations/{organizationId}/members/{membershipId}/roles/{roleId}': {
    delete: { summary: 'Revoke an existing role from a member', security,
      description: 'Requires role:assign. Self mutation is denied. Revocation and audit are one transaction; an already absent assignment is an idempotent no-op.',
      parameters: [organization, membership, { name: 'roleId', in: 'path', required: true, schema: uuid }],
      responses: { '200': { description: 'Role revocation result', content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleAssignmentResult' } } } }, '400': error, '401': error, '403': error, '404': error, '409': error, '500': error } },
  },
};

export const roleAdministrationSchemas = {
  RoleSummary: { type: 'object', additionalProperties: false, required: ['id', 'key', 'name', 'isActive'], properties: { id: uuid, key: { type: 'string' }, name: { type: 'string' }, isActive: { type: 'boolean' } } },
  EmployeeSummary: { type: ['object', 'null'], additionalProperties: false, properties: { id: uuid, employeeCode: { type: 'string' }, displayName: { type: 'string' }, status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] } } },
  OrganizationMember: { type: 'object', additionalProperties: false, required: ['id', 'organizationId', 'userId', 'email', 'displayName', 'accountStatus', 'status', 'roles', 'employee'], properties: { id: uuid, organizationId: uuid, userId: uuid, email: { type: 'string', format: 'email' }, displayName: { type: ['string', 'null'] }, accountStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] }, status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'REMOVED'] }, roles: { type: 'array', items: { $ref: '#/components/schemas/RoleSummary' } }, employee: { $ref: '#/components/schemas/EmployeeSummary' } } },
  OrganizationMemberPage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: { items: { type: 'array', items: { $ref: '#/components/schemas/OrganizationMember' } }, nextCursor: { oneOf: [uuid, { type: 'null' }] } } },
  OrganizationRolePage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: { items: { type: 'array', items: { $ref: '#/components/schemas/RoleSummary' } }, nextCursor: { oneOf: [uuid, { type: 'null' }] } } },
  AssignRoleRequest: { type: 'object', additionalProperties: false, required: ['roleId'], properties: { roleId: uuid } },
  RoleAssignmentResult: { type: 'object', additionalProperties: false, required: ['membershipId', 'roleId', 'assigned'], properties: { membershipId: uuid, roleId: uuid, assigned: { type: 'boolean' } } },
};

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const uuid = { type: 'string', format: 'uuid' };
const org = { name: 'organizationId', in: 'path', required: true, schema: uuid };
const error = { $ref: '#/components/responses/ErrorResponse' };
const body = (properties: object, required: string[] = []) => ({ required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties, required } } } });
const operation = (summary: string, permission: string, id?: string) => ({ summary, security: [{ bearerAuth: [] }],
  'x-required-permission': permission, description: 'JWT + ACTIVE membership + explicit permission. Tenant resources only; no implicit grants. Optional PATCH fields are non-nullable: explicit null is 400; omitted fields stay unchanged. See permission-provisioning.md for privilege ceiling, self mutation and shared identity restrictions.',
  parameters: [org, ...(id ? [{ name: id, in: 'path', required: true, schema: uuid }] : [])],
  responses: { '200': { description: 'Safe same-tenant metadata or mutation result; never credentials, sessions or hashes' }, '400': error, '401': error, '403': error, '404': error, '409': error } });
const roleFields = { name: { type: 'string', minLength: 1, maxLength: 100 }, permissionKeys: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string' }, description: 'Known catalog keys already held by actor; changes additionally require role:assign' } };
export const createRoleOperation = { ...operation('Create tenant role (no automatic assignment)', 'role:create'), requestBody: body({ ...roleFields, key: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,62}$' } }, ['key', 'name', 'permissionKeys']), responses: { ...operation('', '').responses, '201': { description: 'Created safe role metadata and permissionKeys' } } };
export const organizationAccountPaths = {
  '/organizations/{organizationId}/users': {
    get: { ...operation('List organization accounts', 'user:read'), parameters: [org, { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, minimum: 1, maximum: 100 } }, { name: 'after', in: 'query', schema: uuid }] },
    post: { ...operation('Create identity and tenant membership without assigned role', 'user:create'), requestBody: body({ email: { type: 'string', format: 'email' }, displayName: { type: 'string', minLength: 1, maxLength: 200 }, password: { type: 'string', minLength: 16, maxLength: 128, writeOnly: true } }, ['email', 'displayName', 'password']), responses: { ...operation('', '').responses, '201': { description: 'Safe account metadata; password never echoed' } } },
  },
  '/organizations/{organizationId}/users/{userId}': {
    get: operation('Read tenant account', 'user:read', 'userId'),
    patch: { ...operation('Update account display name / this membership status', 'user:update', 'userId'), requestBody: body({ displayName: { type: 'string', minLength: 1, maxLength: 200 }, membershipStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] } }) },
    delete: operation('Remove tenant membership and its role assignments; preserve global identity', 'user:delete', 'userId'),
  },
  '/organizations/{organizationId}/roles/permission-catalog': { get: operation('List known permission keys without granting them', 'role:read') },
  '/organizations/{organizationId}/roles/{roleId}': {
    get: operation('Read safe tenant role with permissionKeys', 'role:read', 'roleId'),
    patch: { ...operation('Update tenant role; self role mutation forbidden', 'role:update', 'roleId'), requestBody: body({ ...roleFields, isActive: { type: 'boolean' } }) },
    delete: operation('Delete unassigned tenant role; assigned roles return 409', 'role:delete', 'roleId'),
  },
};

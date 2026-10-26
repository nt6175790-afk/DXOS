// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const error = { $ref: '#/components/responses/ErrorResponse' };
const json = (schema: object) => ({ 'application/json': { schema } });
const organizationRef = { $ref: '#/components/schemas/Organization' };
const name = { type: 'string', minLength: 1, maxLength: 200, description: 'Trimmed nonempty name; control characters forbidden.' };
const security = [{ bearerAuth: [] }];
const failures = { '400': error, '401': error, '403': error, '409': error, '500': error };

export const organizationPaths = {
  '/organizations': {
    post: {
      summary: 'Create an organization with controlled initial owner grants', security,
      description: 'Active authenticated users may bootstrap a new tenant without prior membership. No organization:create grant on another tenant is required. Server grants only organization:read and organization:update.',
      requestBody: { required: true, content: json({ $ref: '#/components/schemas/CreateOrganization' }) },
      responses: { '201': { description: 'Organization and creator membership committed atomically', content: json(organizationRef) }, ...failures },
    },
    get: {
      summary: 'List active organizations with an active membership for the caller', security,
      description: 'Membership discovery, not global tenant listing. No role grant required. Inactive organizations and memberships are excluded. Ordered by opaque ID ascending.',
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, minimum: 1, maximum: 100 } },
        { name: 'after', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Exclusive opaque ID lower bound, usually nextCursor from the previous page.' },
      ],
      responses: { '200': { description: 'Membership-scoped page', content: json({ $ref: '#/components/schemas/OrganizationPage' }) },
        '400': error, '401': error, '403': error, '500': error },
    },
  },
  '/organizations/{organizationId}': {
    parameters: [{ name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' },
      description: 'Authoritative tenant UUID; slugs, headers and request payloads cannot replace it.' }],
    get: {
      summary: 'Read an organization', security,
      description: 'Requires active account, organization, membership and an active role granting organization:read. Unknown or inaccessible IDs return 403.',
      'x-required-permission': 'organization:read',
      responses: { '200': { description: 'Authorized organization', content: json(organizationRef) }, ...failures },
    },
    patch: {
      summary: 'Rename an organization', security,
      description: 'Requires organization:update. Only name is accepted; slug, status, ownership and grants are immutable through this endpoint.',
      'x-required-permission': 'organization:update',
      requestBody: { required: true, content: json({ $ref: '#/components/schemas/UpdateOrganization' }) },
      responses: { '200': { description: 'Updated organization', content: json(organizationRef) }, ...failures },
    },
  },
};

export const organizationSchemas = {
  Organization: {
    type: 'object', additionalProperties: false, required: ['id', 'name', 'slug', 'status', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' }, name,
      slug: { type: 'string', maxLength: 63, description: 'Immutable identifier; new values use lowercase ASCII letters, digits and single hyphens.' },
      status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] },
      createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateOrganization: {
    type: 'object', additionalProperties: false, required: ['name', 'slug'],
    properties: { name, slug: { type: 'string', minLength: 3, maxLength: 63,
      description: 'Trimmed and lowercased before validation; must then match ^[a-z0-9]+(?:-[a-z0-9]+)*$.' } },
  },
  UpdateOrganization: { type: 'object', additionalProperties: false, required: ['name'], properties: { name } },
  OrganizationPage: {
    type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
    properties: { items: { type: 'array', items: organizationRef, maxItems: 100 },
      nextCursor: { type: 'string', format: 'uuid', nullable: true } },
  },
};

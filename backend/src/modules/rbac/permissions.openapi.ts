// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const error = { $ref: '#/components/responses/ErrorResponse' };
const uuid = { type: 'string', format: 'uuid' };
const security = [{ bearerAuth: [] }];
const organization = { name: 'organizationId', in: 'path', required: true, schema: uuid };

export const permissionPaths = {
  '/organizations/{organizationId}/permissions': {
    get: { summary: 'Discover the authenticated user permissions', security,
      description: 'Returns effective permissions from the caller\'s active membership and active organization roles. No client permission input is accepted; invalid/inaccessible organizations return 403. This read is not audited on success.',
      parameters: [organization],
      responses: { '200': { description: 'Effective tenant permissions', content: { 'application/json': { schema: { $ref: '#/components/schemas/PermissionDiscovery' } } } },
        '400': error, '401': error, '403': error, '500': error } },
  },
};

export const permissionSchemas = {
  PermissionDiscovery: { type: 'object', additionalProperties: false, required: ['organizationId', 'permissions'],
    properties: { organizationId: uuid, permissions: { type: 'array', uniqueItems: true, items: { type: 'string' }, description: 'Sorted effective permission keys.' } } },
};

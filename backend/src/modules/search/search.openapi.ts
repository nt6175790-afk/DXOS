// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const categories = ['employees', 'tasks', 'documents', 'departments', 'notifications'];
export const searchPaths = {
  '/organizations/{organizationId}/search': { get: {
    summary: 'Search authorized organization business metadata', security: [{ bearerAuth: [] }],
    description: 'ACTIVE user/session/organization/membership. Each category uses its existing read permission; notifications are restricted to the caller. Unrequested/unauthorized groups are null. Single category without its read permission is 403. Literal title/name/code search; no bodies, storage/security fields or successful-read audits. Each category pages by ID ascending, using after only for single-category queries. after is an ordering bound and cannot expand tenant scope. At most 25 items per group; no schema change.',
    parameters: [
      { in: 'path', name: 'organizationId', required: true, schema: { type: 'string', format: 'uuid' } },
      { in: 'query', name: 'q', required: true, schema: { type: 'string', minLength: 2, maxLength: 100 }, description: 'Trimmed literal substring; no control characters.' },
      { in: 'query', name: 'type', schema: { type: 'string', enum: ['all', ...categories], default: 'all' } },
      { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 25, default: 5 }, description: 'Per category.' },
      { in: 'query', name: 'after', schema: { type: 'string', format: 'uuid' }, description: 'Single category only. ID ordering bound, not a foreign-resource lookup.' },
    ],
    responses: { '200': { description: 'Safe grouped results; empty is 200, not 404.', content: { 'application/json': { schema: ref('OrganizationSearch') } } },
      ...Object.fromEntries(['400', '401', '403', '409', '500'].map((status) => [status, { $ref: '#/components/responses/ErrorResponse' }])) },
  } },
};
export const searchSchemas = {
  OrganizationSearchItem: { type: 'object', additionalProperties: false, required: ['id', 'title', 'subtitle'], properties: {
    id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, subtitle: { type: 'string', nullable: true },
  } },
  OrganizationSearchPage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: {
    items: { type: 'array', maxItems: 25, items: ref('OrganizationSearchItem') }, nextCursor: { type: 'string', format: 'uuid', nullable: true },
  } },
  OrganizationSearch: { type: 'object', additionalProperties: false, required: ['groups'], properties: { groups: {
    type: 'object', additionalProperties: false, required: categories, properties: Object.fromEntries(categories.map((type) => [type, { allOf: [ref('OrganizationSearchPage')], nullable: true }])),
  } } },
};

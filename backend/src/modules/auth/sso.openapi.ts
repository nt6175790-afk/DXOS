// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const error = { $ref: '#/components/responses/ErrorResponse' };
const operation = (summary: string, schema: Record<string, unknown>, request?: Record<string, unknown>) => ({
  summary, ...(request ? { requestBody: { required: true, content: { 'application/json': { schema: request } } } } : {}),
  responses: { '200': { description: 'SSO response; Cache-Control: no-store', content: { 'application/json': { schema } } },
    '400': error, '401': error, '403': error, '404': error, '429': error, '503': error },
});
export const ssoPaths = {
  '/auth/sso/logout-url': { get: { ...operation('Discover trusted IdP logout URL for an active DX-OS session',
    { type: 'object', required: ['logoutUrl'], additionalProperties: false, properties: { logoutUrl: { type: 'string', format: 'uri' } } }), security: [{ bearerAuth: [] }] } },
  '/auth/sso/config': { get: operation('Discover SSO availability', { type: 'object', required: ['enabled', 'providerName'],
    properties: { enabled: { type: 'boolean' }, providerName: { type: 'string' } } }) },
  '/auth/sso/start': { post: operation('Start OIDC + PKCE; requires trusted Origin', { type: 'object',
    required: ['authorizationUrl', 'state', 'challenge', 'expiresIn'], properties: {
      authorizationUrl: { type: 'string', format: 'uri' }, state: { type: 'string' }, challenge: { type: 'string' }, expiresIn: { type: 'integer', enum: [300] },
    } }) },
  '/auth/sso/complete': { post: operation('Complete single-use OIDC login; no IdP roles accepted',
    { $ref: '#/components/schemas/AuthResponse' }, { type: 'object', additionalProperties: false, required: ['code', 'state', 'challenge'],
      properties: { code: { type: 'string', minLength: 1, maxLength: 4096 }, state: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
        challenge: { type: 'string', minLength: 40, maxLength: 4096 }, iss: { type: 'string', maxLength: 191, description: 'Forward authorization response issuer when supplied by IdP (RFC 9207)' } } }) },
};

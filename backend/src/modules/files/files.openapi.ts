// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { FILE_CONTENT_TYPES, MAX_FILE_BYTES } from './file-policy';
import { PERMISSIONS } from '../rbac/permission-catalog';

const error = { $ref: '#/components/responses/ErrorResponse' };
const org = { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const file = { name: 'fileId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const response = { description: 'File metadata; no storage key or physical path', content: { 'application/json': { schema: { $ref: '#/components/schemas/FileMetadata' } } } };
const errors = { '400': error, '401': error, '403': error, '409': error, '500': error };
const security = [{ bearerAuth: [] }];
export const filePaths = {
  '/organizations/{organizationId}/files': {
    get: { summary: 'List available organization file metadata', security, 'x-required-permission': PERMISSIONS.FILE_READ,
      description: 'Returns only AVAILABLE files in the route organization. ID ascending keyset pagination, default 25 and maximum 100. Deleted, uploading and failed reservations are excluded. No storage key or physical path is returned.',
      parameters: [org, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        { name: 'after', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Exclusive ID bound; it is not an authorization token.' }],
      responses: { '200': { description: 'Tenant-scoped file page', content: { 'application/json': { schema: { $ref: '#/components/schemas/FilePage' } } } }, ...errors } },
    post: {
    summary: 'Upload an organization file', security, 'x-required-permission': PERMISSIONS.FILE_UPLOAD,
    description: 'One nonempty file only; no text/query fields. Maximum 5 MiB. PDF/PNG/JPEG declared type must match basic signature (not malware scanning). Safe ASCII filename <=200 characters; no paths. No default grants. Server derives tenant, uploader, size, SHA-256 and opaque key.',
    parameters: [org], requestBody: { required: true, content: { 'multipart/form-data': {
      schema: { type: 'object', additionalProperties: false, required: ['file'], properties: { file: { type: 'string', format: 'binary', 'x-max-bytes': MAX_FILE_BYTES } } },
      encoding: { file: { contentType: FILE_CONTENT_TYPES.join(', ') } },
    } } }, responses: { '201': response, ...errors, '413': error, '415': error },
    },
  },
  '/organizations/{organizationId}/files/{fileId}': {
    get: { summary: 'Read available organization file metadata', security, 'x-required-permission': PERMISSIONS.FILE_READ,
      parameters: [org, file], responses: { '200': response, ...errors } },
    delete: { summary: 'Soft-delete organization file', security, 'x-required-permission': PERMISSIONS.FILE_DELETE,
      description: 'Idempotent, retains bytes/metadata. No query fields; absent or empty body. Atomically audits first deletion. New reads denied.',
      parameters: [org, file], requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties: {} } } } },
      responses: { '200': response, ...errors } },
  },
  '/organizations/{organizationId}/files/{fileId}/content': { get: {
    summary: 'Download authorized organization file', security, 'x-required-permission': PERMISSIONS.FILE_READ,
    description: 'AVAILABLE only. Active tenant membership and explicit grant. Attachment, nosniff, private no-store; no public URL. Unknown/foreign/unavailable IDs return 403. No query fields.',
    parameters: [org, file], responses: { '200': { description: 'Streamed attachment', content: Object.fromEntries(FILE_CONTENT_TYPES.map((type) => [type, { schema: { type: 'string', format: 'binary' } }])) }, ...errors },
  } },
};
export const fileSchemas = {
  FileMetadata: { type: 'object', additionalProperties: false,
    required: ['id', 'organizationId', 'uploadedByUserId', 'originalFilename', 'contentType', 'size', 'checksum', 'status', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' }, organizationId: { type: 'string', format: 'uuid' }, uploadedByUserId: { type: 'string', format: 'uuid' },
      originalFilename: { type: 'string', minLength: 1, maxLength: 200 }, contentType: { type: 'string', enum: FILE_CONTENT_TYPES },
      size: { type: 'integer', minimum: 1, maximum: MAX_FILE_BYTES }, checksum: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      status: { type: 'string', enum: ['AVAILABLE', 'DELETED'] }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  FilePage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
    properties: { items: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/FileMetadata' } }, nextCursor: { type: 'string', format: 'uuid', nullable: true } } },
};

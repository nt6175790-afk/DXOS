// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const uuid = { type: 'string', format: 'uuid' };
const timestamp = { type: 'string', format: 'date-time' };
const json = (schema: object) => ({ 'application/json': { schema } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (name: string) => ({ description: 'Authorized task collaboration result', content: json(ref(name)) });
const failures = Object.fromEntries(['400', '401', '403', '404', '409', '413', '500'].map((code) => [code, { $ref: '#/components/responses/ErrorResponse' }]));
const parameters = ['organizationId', 'taskId'].map((name) => ({ name, in: 'path', required: true, schema: uuid }));
const pagination = [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
  { name: 'after', in: 'query', schema: uuid }];
const security = [{ bearerAuth: [] }];
const rules = 'Active IAM User/session, organization and membership; exact grants rechecked in the mutation/read transaction. No implicit grants. Inaccessible tenant/missing permission 403; missing/foreign task or reference 404. Terminal task mutations 409. JSON decoded maximum 64 KiB; strict DTOs. Successful reads have no audit.';
const paging = 'Oldest first (createdAt ASC, id ASC), limit default 25/max 100. Scoped cursor lookup; missing/foreign/wrong-task cursor 400 without existence details. No totals/snapshot guarantee.';
const base = '/organizations/{organizationId}/tasks/{taskId}';
export const taskCollaborationPaths = {
  [`${base}/comments`]: { parameters,
    get: { summary: 'List task comments', security, 'x-required-permission': 'task:read', description: `${rules} ${paging}`,
      parameters: pagination, responses: { '200': response('TaskCommentPage'), ...failures } },
    post: { summary: 'Add an immutable plain-text comment', security, 'x-required-permission': 'task:update',
      description: `${rules} Author is the authenticated member; Employee profile is optional. No comment edit/delete API. POST is not idempotent; do not blindly retry. Body is never written to logs/audit.`,
      requestBody: { required: true, content: json(ref('CreateTaskComment')) }, responses: { '201': response('TaskComment'), ...failures } } },
  [`${base}/attachments`]: { parameters,
    get: { summary: 'List available task attachments', security, 'x-required-permissions': ['task:read', 'file:read'],
      description: `${rules} ${paging} Only AVAILABLE same-tenant file metadata. Soft-deleted files disappear; their retained link can still resolve a cursor.`,
      parameters: pagination, responses: { '200': response('TaskAttachmentPage'), ...failures } },
    post: { summary: 'Link an existing organization file to a task', security, 'x-required-permissions': ['task:update', 'file:read'],
      description: `${rules} AVAILABLE same-tenant file required (otherwise 409 after scoped lookup). Duplicate link returns the existing link with 201 and no extra audit. Files remain shared organization files; no upload, file permission grant or storage copy. Upload/download through existing Files API.`,
      requestBody: { required: true, content: json(ref('LinkTaskAttachment')) }, responses: { '201': response('TaskAttachment'), ...failures } } },
  [`${base}/attachments/{attachmentId}`]: { parameters: [...parameters, { name: 'attachmentId', in: 'path', required: true, schema: uuid }],
    delete: { summary: 'Unlink a task attachment without deleting the file', security, 'x-required-permissions': ['task:update', 'file:read'],
      description: `${rules} No request body or query fields. Link must belong to this task and tenant. Missing/already unlinked ID returns 404. Retained links to deleted files can be unlinked.`,
      responses: { '204': { description: 'Link removed; underlying file and other task links preserved' }, ...failures } } },
  [`${base}/planning`]: { parameters,
    get: { summary: 'Read task reviewer and checklist', security, 'x-required-permission': 'task:read',
      description: `${rules} Full checklist is bounded to 100 entries and ordered by createdAt/id ascending. Reviewer employeeId is safe task reference; displayName is null without employee:read. Checklist does not change progress or status.`,
      responses: { '200': response('TaskPlanning'), ...failures } } },
  [`${base}/planning/reviewer`]: { parameters,
    patch: { summary: 'Set or clear an informational task reviewer', security, 'x-required-permission': 'task:assign',
      description: `${rules} Non-null reviewer must be eligible ACTIVE same-tenant Employee/User/membership. No reviewer permission, implicit completion gate, approval decision or role grant is created. Same assignment is a no-op.`,
      requestBody: { required: true, content: json(ref('SetTaskReviewer')) }, responses: { '200': response('TaskReviewer'), ...failures } } },
  [`${base}/checklist`]: { parameters,
    post: { summary: 'Add a task checklist item', security, 'x-required-permission': 'task:update',
      description: `${rules} Maximum 100 items per task. Checklist completion does not update parent progress/status.`,
      requestBody: { required: true, content: json(ref('CreateTaskChecklistItem')) }, responses: { '201': response('TaskChecklistItem'), ...failures } } },
  [`${base}/checklist/{itemId}`]: { parameters: [...parameters, { name: 'itemId', in: 'path', required: true, schema: uuid }],
    patch: { summary: 'Update a task checklist item', security, 'x-required-permission': 'task:update', description: rules,
      requestBody: { required: true, content: json(ref('UpdateTaskChecklistItem')) }, responses: { '200': response('TaskChecklistItem'), ...failures } },
    delete: { summary: 'Remove a task checklist item', security, 'x-required-permission': 'task:update',
      description: `${rules} No body or query parameters.`, responses: { '204': { description: 'Item removed' }, ...failures } } },
  [`${base}/activity`]: { parameters,
    get: { summary: 'List safe task activity history', security, 'x-required-permission': 'task:read',
      description: `${rules} Only allowlisted resourceType=task mutation events matching this task. CreatedAt/id descending keyset pagination (limit 1–100/default 25); foreign/missing cursors return 400. Child comment/file audit rows, metadata, actors, security events and foreign activity are excluded.`,
      parameters: pagination, responses: { '200': response('TaskActivityPage'), ...failures } } },
};
const page = (name: string) => ({ type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: {
  items: { type: 'array', maxItems: 100, items: ref(name) }, nextCursor: { ...uuid, nullable: true } } });
export const taskCollaborationSchemas = {
  CreateTaskComment: { type: 'object', additionalProperties: false, required: ['body'], properties: {
    body: { type: 'string', minLength: 1, maxLength: 4000, description: 'Trimmed plain text; only LF/tab controls allowed. UI must escape text.' } } },
  TaskComment: { type: 'object', additionalProperties: false, required: ['id', 'taskId', 'authorUserId', 'authorDisplayName', 'body', 'createdAt'],
    properties: { id: uuid, taskId: uuid, authorUserId: uuid,
      authorDisplayName: { type: 'string', nullable: true, maxLength: 200, description: 'Current organization Employee displayName, else User displayName; nullable, not a historical snapshot.' },
      body: { type: 'string', maxLength: 4000 }, createdAt: timestamp } },
  LinkTaskAttachment: { type: 'object', additionalProperties: false, required: ['fileId'], properties: { fileId: uuid } },
  TaskAttachment: { type: 'object', additionalProperties: false, required: ['id', 'taskId', 'linkedByUserId', 'createdAt', 'file'], properties: {
    id: uuid, taskId: uuid, linkedByUserId: uuid, createdAt: timestamp,
    file: { type: 'object', additionalProperties: false, required: ['id', 'originalFilename', 'contentType', 'size'], properties: {
      id: uuid, originalFilename: { type: 'string', maxLength: 200 }, contentType: { type: 'string', maxLength: 100 }, size: { type: 'integer', minimum: 0, nullable: true } } } } },
  TaskCommentPage: page('TaskComment'), TaskAttachmentPage: page('TaskAttachment'),
  SetTaskReviewer: { type: 'object', additionalProperties: false, required: ['reviewerEmployeeId'], properties: { reviewerEmployeeId: { ...uuid, nullable: true } } },
  TaskReviewer: { type: 'object', nullable: true, additionalProperties: false, required: ['employeeId', 'displayName'],
    properties: { employeeId: uuid, displayName: { type: 'string', nullable: true, maxLength: 200 } } },
  CreateTaskChecklistItem: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string', minLength: 1, maxLength: 200, description: 'Trimmed plain text; no control characters.' } } },
  UpdateTaskChecklistItem: { type: 'object', additionalProperties: false, minProperties: 1, properties: { title: { type: 'string', minLength: 1, maxLength: 200 }, isCompleted: { type: 'boolean' } } },
  TaskChecklistItem: { type: 'object', additionalProperties: false, required: ['id', 'taskId', 'title', 'isCompleted', 'createdAt', 'updatedAt'], properties: {
    id: uuid, taskId: uuid, title: { type: 'string', maxLength: 200 }, isCompleted: { type: 'boolean' }, createdAt: timestamp, updatedAt: timestamp } },
  TaskPlanning: { type: 'object', additionalProperties: false, required: ['reviewer', 'checklist'], properties: {
    reviewer: ref('TaskReviewer'), checklist: { type: 'array', maxItems: 100, items: ref('TaskChecklistItem') } } },
  TaskActivity: { type: 'object', additionalProperties: false, required: ['id', 'event', 'createdAt'], properties: { id: uuid, event: { type: 'string' }, createdAt: timestamp } },
  TaskActivityPage: page('TaskActivity'),
};

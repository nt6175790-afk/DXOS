// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const coordinates = {
  latitude: { type: 'number', minimum: -90, maximum: 90 },
  longitude: { type: 'number', minimum: -180, maximum: 180 },
};
export const attendanceSchemas = {
  AttendancePosition: { type: 'object', additionalProperties: false, required: ['latitude', 'longitude', 'accuracyMeters', 'capturedAt'], properties: {
    ...coordinates, accuracyMeters: { type: 'number', minimum: 0, maximum: 50 }, capturedAt: { type: 'string', format: 'date-time', description: 'Fresh device position: at most 60 seconds old, at most 5 seconds in the future. Not used as attendance time.' },
  } },
  AttendanceOfficeInput: { type: 'object', additionalProperties: false, required: ['label', 'latitude', 'longitude'], properties: {
    label: { type: 'string', minLength: 1, maxLength: 120 }, ...coordinates,
  } },
  AttendanceLocationPolicy: { type: 'object', required: ['office', 'radiusMeters', 'maxAccuracyMeters', 'maxAgeSeconds'], properties: {
    office: { type: 'object', nullable: true, properties: { label: { type: 'string' }, ...coordinates, updatedAt: { type: 'string', format: 'date-time' } } },
    radiusMeters: { type: 'integer', enum: [100] }, maxAccuracyMeters: { type: 'integer', enum: [50] }, maxAgeSeconds: { type: 'integer', enum: [60] },
  } },
  AttendanceCheckInput: { type: 'object', additionalProperties: false, required: ['location'], properties: {
    note: { type: 'string', maxLength: 500 }, location: { $ref: '#/components/schemas/AttendancePosition' },
  } },
};
const parameters = [{ in: 'path', name: 'organizationId', required: true, schema: { type: 'string', format: 'uuid' } }];
const policyResponse = { description: 'Organization location policy. office is null until configured.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AttendanceLocationPolicy' } } } };
const errors = { '400': { description: 'Invalid payload / location sample / schedule rule' }, '401': { description: 'Authentication required' }, '403': { description: 'Inactive/foreign membership, insufficient permission, or outside 100 m including GPS accuracy' }, '409': { description: 'Office location not configured or existing attendance conflict' } };
const base = { tags: ['Attendance'], security: [{ bearerAuth: [] }], parameters };
export const attendancePaths = {
  '/organizations/{organizationId}/attendance/location': {
    get: { ...base, summary: 'Read office location; requires attendance:read and ACTIVE membership', responses: { '200': policyResponse, ...errors } },
    put: { ...base, summary: 'Set office coordinates; requires attendance:manage and ACTIVE membership. Records audit without GPS metadata.', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AttendanceOfficeInput' } } } }, responses: { '200': policyResponse, ...errors } },
  },
  ...Object.fromEntries(['check-in', 'check-out'].map(action => [`/organizations/{organizationId}/attendance/${action}`, { post: {
    ...base, summary: `${action}; requires attendance:${action}, ACTIVE membership, active employee and fresh location within 100 m including accuracy. Existing schedule/leave rules still apply.`,
    description: 'Server time determines attendance. No employee GPS coordinates are persisted or included in audit. Browser GPS can be spoofed; this is not device attestation.',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AttendanceCheckInput' } } } },
    responses: { '201': { description: 'Existing attendance record response (unchanged); no GPS fields.' }, ...errors },
  } }])),
};

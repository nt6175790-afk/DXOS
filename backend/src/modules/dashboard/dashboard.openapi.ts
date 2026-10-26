// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const count = { type: 'integer', minimum: 0 };
const uuid = { type: 'string', format: 'uuid' };
const time = { type: 'string', format: 'date-time' };
const object = (properties: Record<string, object>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const preview = (properties: Record<string, object>, maxItems = 10) => object({
  items: { type: 'array', maxItems, items: object(properties) }, hasMore: { type: 'boolean' },
});
const error = { $ref: '#/components/responses/ErrorResponse' };
const population = { total: count, active: count, inactive: count };

export const dashboardSchemas = {
  Dashboard: object({ organizationId: uuid, generatedAt: time,
    tasks: { ...object({ total: count, byStatus: object({ TODO: count, IN_PROGRESS: count, DONE: count, CANCELLED: count }),
      open: count, overdue: count, unassigned: count,
      completionPercent: { type: 'number', minimum: 0, maximum: 100, nullable: true, description: 'DONE / noncancelled total, one decimal; null for empty denominator.' },
      health: { type: 'string', enum: ['EMPTY', 'ATTENTION', 'ON_TRACK'], description: 'Task operational signal only: ATTENTION means overdue or unassigned open work.' },
      overdueItems: { type: 'array', maxItems: 5, items: object({ id: uuid, title: { type: 'string' },
        status: { type: 'string', enum: ['TODO', 'IN_PROGRESS'] }, priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        progressPercent: { type: 'integer', minimum: 0, maximum: 99 }, dueAt: time }) }, overdueHasMore: { type: 'boolean' },
    }), nullable: true },
    departments: { ...object({ ...population, ...preview({ id: uuid, name: { type: 'string' }, status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
      employeeCount: { ...count, nullable: true }, openTasks: { ...count, nullable: true } }).properties }), nullable: true },
    employees: { ...object(population), nullable: true },
    workload: { ...preview({ employeeId: uuid, displayName: { type: 'string' }, status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }, openTasks: count }), nullable: true },
    notifications: object({ total: count, unread: count }),
    activity: { ...preview({ id: uuid, event: { type: 'string' }, resourceType: { type: 'string' }, resourceId: { ...uuid, nullable: true },
      outcome: { type: 'string', enum: ['SUCCESS', 'FAILURE', 'DENIED'] }, createdAt: time }), nullable: true },
  }),
};
export const dashboardPaths = {
  '/organizations/{organizationId}/dashboard': {
    get: { summary: 'Read permission-scoped organization dashboard', security: [{ bearerAuth: [] }],
      description: 'ACTIVE membership required. Each section uses its existing read permission; denied sections are null. Workload needs task:read AND employee:read; audit feed needs audit:read. Personal notification counts use actor scope. Full-organization counters, bounded previews with hasMore. No query parameters, new grants, schema change or successful-read audit. See contracts/api/dashboard.md for metric definitions.',
      parameters: [{ name: 'organizationId', in: 'path', required: true, schema: uuid }],
      responses: { '200': { description: 'Authorized snapshot', content: { 'application/json': { schema: { $ref: '#/components/schemas/Dashboard' } } } },
        '400': error, '401': error, '403': error, '409': error, '500': error },
    },
  },
};

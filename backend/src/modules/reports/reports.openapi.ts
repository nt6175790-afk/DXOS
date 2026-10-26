// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const count = { type: 'integer', minimum: 0 };
const decimal = { type: 'string', pattern: '^-?[0-9]+\\.[0-9]{2}$', example: '123456789.50' };
const counters = { type: 'object', additionalProperties: { type: 'number', nullable: true }, description: 'Named aggregate metrics; null means undefined denominator or missing source permission. Exact metric definitions: contracts/api/hr-reports.md.' };
const moneyFields = { currency: { type: 'string' }, records: count, gross: decimal, net: decimal, averageNet: { ...decimal, nullable: true } };
const array = (items: unknown) => ({ type: 'array', items });
export const reportSchemas = {
  ReportCounters: counters,
  NumericReport: object({ metrics: counters, trend: array(object({ bucket: { type: 'string', format: 'date' }, metrics: counters })) }),
  ReportMoney: object({ ...moneyFields, employees: count }),
  PayrollReport: object({ periods: count, records: count, employees: count, currencies: array(ref('ReportMoney')), trend: array(object({ bucket: { type: 'string', format: 'date' }, currencies: array(object(moneyFields)) })) }),
  DepartmentReport: object({ items: array(object({ id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }, workforce: counters, attendance: { ...counters, nullable: true }, leave: { ...counters, nullable: true }, payroll: { ...array(ref('ReportMoney')), nullable: true } })), nextCursor: { type: 'string', format: 'uuid', nullable: true } }),
  PerformanceReport: object({ available: { type: 'boolean' }, reason: { type: 'string', enum: ['integration_pending', 'permission_denied'] }, metrics: counters }, ['available']),
  HrOverview: object({ organizationId: { type: 'string', format: 'uuid' }, generatedAt: { type: 'string', format: 'date-time' }, timezone: { type: 'string', enum: ['Asia/Ho_Chi_Minh'] }, filters: { type: 'object' }, workforce: { allOf: [ref('NumericReport')], nullable: true }, attendance: { allOf: [ref('NumericReport')], nullable: true }, leave: { allOf: [ref('NumericReport')], nullable: true }, payroll: { allOf: [ref('PayrollReport')], nullable: true }, departments: { allOf: [ref('DepartmentReport')], nullable: true }, performance: ref('PerformanceReport') }),
};
const parameters = [
  { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  ...['dateFrom', 'dateTo'].map((name) => ({ name, in: 'query', required: true, schema: { type: 'string', format: 'date' }, description: 'Inclusive Vietnam calendar date. Maximum range 366 days.' })),
  ...['departmentId', 'employeeId', 'after'].map((name) => ({ name, in: 'query', schema: { type: 'string', format: 'uuid' } })),
  ...Object.entries({ interval: ['day', 'week', 'month'], employeeStatus: ['ACTIVE', 'INACTIVE'], attendanceStatus: ['PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'INCOMPLETE'], leaveStatus: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], payrollStatus: ['DRAFT', 'PROCESSING', 'CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'FINALIZED', 'CANCELLED'] }).map(([name, values]) => ({ name, in: 'query', schema: { type: 'string', enum: values } })),
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
];
const errors = Object.fromEntries([400, 401, 403, 404, 409, 500].map((code) => [code, { description: ({ 400: 'Invalid/bounded filter or export', 401: 'JWT/session invalid', 403: 'Inactive or unauthorized context/source', 404: 'Scoped identifier not found', 409: 'Retry exhausted', 500: 'Safe persistence failure' } as Record<number, string>)[code], content: { 'application/json': { schema: ref('ErrorEnvelope') } } }]));
export const reportPaths = Object.fromEntries(['overview', 'workforce', 'attendance', 'leave', 'payroll', 'departments', 'performance'].flatMap((kind) => {
  const path = `/organizations/{organizationId}/reports/${kind}`;
  const schema = kind === 'overview' ? 'HrOverview' : kind === 'payroll' ? 'PayrollReport' : kind === 'departments' ? 'DepartmentReport' : kind === 'performance' ? 'PerformanceReport' : 'NumericReport';
  const get = { tags: ['Reports'], security: [{ bearerAuth: [] }], parameters, summary: `Read ${kind} analytics`, description: 'report:read and ACTIVE membership required; original source read scopes retained. Payroll requires payroll:read; attendance also attendance:manage; leave also leave:approve. No successful read audit. Unknown query fields rejected. Keyset department pages; current workforce, Vietnam date cohorts, default FINALIZED payroll. See hr-reports contract.', responses: { ...errors, 200: { description: 'Authorized aggregates only; Cache-Control no-store', content: { 'application/json': { schema: ref(schema) } } } } };
  return [[path, { get }], ...(!['overview', 'performance'].includes(kind) ? [[`${path}/export`, { get: { ...get, summary: `Export ${kind} aggregates`, description: get.description + ' Also requires report:export. UTF-8 BOM/CRLF formula-safe CSV, maximum1000 departments; report.exported audit with no data/filter metadata.', responses: { ...errors, 200: { description: 'CSV attachment', content: { 'text/csv': { schema: { type: 'string' } } } } } } }]] : [])];
}));

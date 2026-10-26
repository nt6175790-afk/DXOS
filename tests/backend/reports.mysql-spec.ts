// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { AnalyticsRepository } from '../../backend/src/modules/reports/analytics.repository';
import { seedReports, removeReportsFixture } from './reports.fixture';
const url = process.env.RBAC_TEST_DATABASE_URL, mysqlDescribe = url ? describe : describe.skip;
const range = { dateFrom: '2026-09-01', dateTo: '2026-09-30' };
mysqlDescribe('HR reports real MySQL authorization and aggregates', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication, seed: Awaited<ReturnType<typeof seedReports>>, token: string;
  const secret = 'reports-test-fixture-not-production';
  const get = (kind = 'overview', q: object = {}, org = seed.org.id) => request(app.getHttpServer()).get(`/api/v1/organizations/${org}/reports/${kind}`).set('Authorization', `Bearer ${token}`).query({ ...range, ...q });
  const revoke = (key: string) => db.rolePermission.deleteMany({ where: { roleId: seed.role.id, permission: { key } } });
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {})); await app.init();
  });
  beforeEach(async () => {
    seed = await seedReports(db);
    const session = await db.authSession.create({ data: { userId: seed.actor.id, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: seed.actor.id, sid: session.id, typ: 'access' }, secret, { expiresIn: 300 });
  });
  afterEach(async () => { jest.restoreAllMocks(); if (seed) await removeReportsFixture(db, seed); });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });
  it('requires a valid session and JWT', async () => {
    await request(app.getHttpServer()).get(`/api/v1/organizations/${seed.org.id}/reports/overview`).query(range).expect(401);
    await db.authSession.updateMany({ where: { userId: seed.actor.id }, data: { revokedAt: new Date() } }); await get().expect(401);
  });
  it.each(['INACTIVE', 'SUSPENDED', 'REMOVED'] as const)('denies %s membership', async (status) => {
    await db.organizationMembership.update({ where: { id: seed.member.id }, data: { status } }); await get().expect(403); await get('payroll/export').expect(403);
  });
  it('denies inactive organization and inactive role', async () => {
    await db.role.update({ where: { id: seed.role.id }, data: { isActive: false } }); await get().expect(403);
    await db.role.update({ where: { id: seed.role.id }, data: { isActive: true } });
    await db.organization.update({ where: { id: seed.org.id }, data: { status: 'SUSPENDED' } }); await get().expect(403);
  });
  it('requires explicit report read and export independently', async () => {
    await revoke('report:export'); await get('workforce/export').expect(403); await get().expect(200);
    await revoke('report:read'); await get().expect(403);
  });
  it('denies foreign organization and hides foreign filter identifiers', async () => {
    await get('overview', {}, seed.foreignOrg.id).expect(403); await get('overview', {}, randomUUID()).expect(403);
    for (const q of [{ employeeId: seed.foreignEmployee.id }, { departmentId: seed.foreignDepartment.id }, { after: seed.foreignDepartment.id }, { employeeId: randomUUID() }]) await get('overview', q).expect(404);
  });
  it.each([{ dateFrom: '2026-02-30' }, { dateFrom: '2026-10-01' }, { dateTo: '2027-10-01' }, { employeeId: 'x' }, { departmentId: 'x' }, { interval: 'year' }, { employeeStatus: 'DELETED' }, { attendanceStatus: 'REMOTE' }, { leaveStatus: 'PRESENT' }, { payrollStatus: 'PAID' }, { limit: 101 }, { limit: '1x' }, { permissions: ['payroll:read'] }, { organizationId: randomUUID() }])('rejects invalid or injected filters %j', async (q) => { await get('overview', q).expect(400); });
  it('uses current headcount and Vietnamese registration day rather than invented history', async () => {
    const { body } = await get('workforce').expect(200);
    expect(body.metrics).toEqual({ total: 2, active: 1, inactive: 1, unassigned: 1, newEmployeeRecords: 1 }); expect(body.trend).toHaveLength(30); expect(body.trend[0].metrics.newEmployeeRecords).toBe(1);
    expect((await get('workforce', { dateFrom: '2020-01-01', dateTo: '2020-01-01' }).expect(200)).body.metrics).toMatchObject({ total: 2, newEmployeeRecords: 0 });
  });
  it('reuses stored attendance and schedule denominators without recalculation', async () => {
    const { body } = await get('attendance').expect(200);
    expect(body.metrics).toMatchObject({ total: 4, present: 3, absent: 1, incomplete: 1, late: 1, earlyLeave: 1, workedMinutes: 920, completedRecords: 2, averageWorkedMinutes: 460, plannedDays: 2, offDays: 1, attendedPlannedDays: 2, attendanceRate: 100, lateRate: 33.33 });
    expect((await get('attendance', { attendanceStatus: 'LATE' }).expect(200)).body.metrics).toMatchObject({ total: 1, plannedDays: 2, attendedPlannedDays: 1, attendanceRate: 50 });
  });
  it('retains self-versus-manager source restrictions and omits unavailable denominator', async () => {
    await revoke('attendance:manage'); await revoke('leave:approve'); await get('attendance').expect(403); await get('leave').expect(403);
    const { body } = await get().expect(200); expect(body.attendance).toBeNull(); expect(body.leave).toBeNull(); expect(body.departments.items[0].attendance).toBeNull();
  });
  it('does not invent schedule or empty averages', async () => {
    await revoke('schedule:read'); expect((await get('attendance').expect(200)).body.metrics.attendanceRate).toBeNull();
    const { body } = await get('attendance', { dateFrom: '2026-01-01', dateTo: '2026-01-01' }).expect(200); expect(body.metrics.total).toBe(0); expect(body.metrics.averageWorkedMinutes).toBeNull(); expect(body.metrics.lateRate).toBeNull();
  });
  it('counts actual leave states and stored half-days at Vietnam start boundaries', async () => {
    expect((await get('leave').expect(200)).body.metrics).toEqual({ total: 4, pending: 1, approved: 1, rejected: 1, cancelled: 1, days: 4.5, approvedDays: 0.5 });
    expect((await get('leave', { leaveStatus: 'APPROVED' }).expect(200)).body.metrics.total).toBe(1);
  });
  it('sums exact decimal payroll while preserving finalized records', async () => {
    const before = await db.payrollRecord.findMany({ where: { organizationId: seed.org.id }, orderBy: { id: 'asc' } });
    const { body } = await get('payroll').expect(200); expect(body).toMatchObject({ periods: 1, employees: 2, records: 2 });
    expect(body.currencies).toEqual([{ currency: 'VND', employees: 2, records: 2, gross: '20000000.33', net: '18000000.03', averageNet: '9000000.02' }]);
    expect(await db.payrollRecord.findMany({ where: { organizationId: seed.org.id }, orderBy: { id: 'asc' } })).toEqual(before);
  });
  it('excludes inconsistent ID-only payroll links from another tenant', async () => {
    await db.payrollRecord.create({ data: { ...seed.payrollData, employeeId: seed.foreignEmployee.id, netAmount: 99 } });
    expect((await get('payroll').expect(200)).body.records).toBe(2);
    await db.payrollRecord.create({ data: { ...seed.payrollData, payrollPeriodId: seed.foreignPeriod.id, netAmount: 88 } });
    expect((await get('payroll').expect(200)).body.records).toBe(2);
  });
  it('does not query or expose payroll without the original permission, including department CSV', async () => {
    await revoke('payroll:read'); const query = jest.spyOn(app.get(AnalyticsRepository), 'payrollRows');
    const { body } = await get().expect(200); expect(body.payroll).toBeNull(); expect(body.departments.items[0].payroll).toBeNull(); expect(query).not.toHaveBeenCalled();
    await get('payroll').expect(403); await get('payroll/export').expect(403);
    expect((await get('departments/export').expect(200)).text).not.toContain('18000000');
  });
  it('applies source intersection and stable department pagination', async () => {
    await db.department.create({ data: { organizationId: seed.org.id, name: 'Second department', code: 'D2' } });
    const first = (await get('departments', { limit: 1 }).expect(200)).body;
    const second = (await get('departments', { limit: 1, after: first.nextCursor }).expect(200)).body;
    expect(first.items[0].id < second.items[0].id).toBe(true); expect(second.nextCursor).toBeNull();
    expect((await get('workforce', { employeeId: seed.employee2.id, departmentId: seed.department.id }).expect(200)).body.metrics.total).toBe(0);
    expect((await get('payroll', { employeeStatus: 'ACTIVE' }).expect(200)).body.currencies[0].net).toBe('9000000.01');
  });
  it('aggregates weekly/monthly trends without unbounded output', async () => {
    expect((await get('attendance', { interval: 'week' }).expect(200)).body.trend[0]).toMatchObject({ bucket: '2026-08-31', metrics: { total: 4 } });
    expect((await get('leave', { interval: 'month' }).expect(200)).body.trend).toHaveLength(1);
  });
  it('isolates performance final ratings and source permissions', async () => {
    const { body } = await get('performance').expect(200); expect(body.metrics).toMatchObject({ reviews: 2, completedReviews: 1, completionRate: 50, averageCompletedRating: 4, goals: 1, kpis: 1 });
    await revoke('goal:read'); expect((await get('performance').expect(200)).body.metrics.goals).toBeUndefined();
    await revoke('performance:manage'); expect((await get('performance').expect(200)).body).toEqual({ available: false, reason: 'permission_denied' });
  });
  it('exports safe UTF-8 CSV with a content-free atomic audit and no successful read audit', async () => {
    await db.department.update({ where: { id: seed.department.id }, data: { name: '=HYPERLINK("bad")' } });
    const before = await db.auditEvent.count({ where: { organizationId: seed.org.id } }); await get().expect(200); expect(await db.auditEvent.count({ where: { organizationId: seed.org.id } })).toBe(before);
    const response = await get('departments/export').expect(200); expect(response.headers['cache-control']).toBe('no-store'); expect(response.headers['content-type']).toContain('text/csv'); expect(response.text).toContain("'=HYPERLINK"); expect(response.text).toContain('\r\n');
    const audit = await db.auditEvent.findFirstOrThrow({ where: { organizationId: seed.org.id, event: 'report.exported' } }); expect(audit.metadata).toEqual({}); expect(audit.actorUserId).toBe(seed.actor.id);
  });
  it('fails export safely when audit persistence fails', async () => {
    jest.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('private persistence diagnostics'));
    const response = await get('workforce/export').expect(500); expect(JSON.stringify(response.body)).not.toContain('private'); expect(response.headers['content-type']).not.toContain('text/csv');
  });
  it('exposes no employee/private security/assessment/medical data', async () => {
    const response = await get().expect(200), text = JSON.stringify(response.body);
    for (const prohibited of ['passwordHash', 'refreshToken', 'baseSalary', 'private medical', 'private employee', 'Private employee', 'private attendance', 'private assessment', 'private feedback', 'Foreign', '999999999']) expect(text).not.toContain(prohibited);
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request, { type Response } from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { PERMISSIONS as P, type PermissionKey } from '../../backend/src/modules/rbac/permission-catalog';
import { ApprovalService } from '../../backend/src/modules/approval/approval.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const secret = 'whole-review-disposable-fixture-secret';
(url ? describe : describe.skip)('Final review fixes: real HTTP validation, pagination and payroll visibility', () => {
 const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused@localhost/unused' } } });
 let app: INestApplication;
 const organizations: string[] = [];
 const users: string[] = [];
 const previousSecret = process.env.JWT_ACCESS_SECRET;
 beforeAll(async () => {
  if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw Error('Disposable database required');
  process.env.JWT_ACCESS_SECRET = secret;
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
  app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {})); await app.init();
 });
 afterEach(async () => {
  const scope = { organizationId: { in: organizations } };
  await db.notification.deleteMany({ where: scope });
  await db.approvalRequest.deleteMany({ where: scope });
  await db.payrollPeriod.deleteMany({ where: scope });
  await db.attendanceRecord.deleteMany({ where: scope });
  await db.auditEvent.deleteMany({ where: { OR: [scope, { actorUserId: { in: users } }] } });
  await db.membershipRole.deleteMany({ where: scope });
  await db.rolePermission.deleteMany({ where: { role: scope } });
  await db.role.deleteMany({ where: scope });
  await db.employee.deleteMany({ where: scope });
  await db.organizationMembership.deleteMany({ where: scope });
  await db.organization.deleteMany({ where: { id: { in: organizations } } });
  await db.authSession.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  organizations.length = 0; users.length = 0;
 });
 afterAll(async () => { await app?.close(); await db.$disconnect(); if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = previousSecret; });
 async function fixture(keys: PermissionKey[], tenant?: string) {
  const org = tenant ?? (await db.organization.create({ data: { name: 'Synthetic review organization', slug: 'review-' + randomUUID() } })).id;
  if (!tenant) organizations.push(org);
  const user = (await db.user.create({ data: { email: randomUUID() + '@example.test' } })).id;
  users.push(user);
  const member = await db.organizationMembership.create({ data: { organizationId: org, userId: user } });
  const role = await db.role.create({ data: { organizationId: org, key: 'review-' + randomUUID(), name: 'Synthetic review operator' } });
  await db.membershipRole.create({ data: { organizationId: org, membershipId: member.id, roleId: role.id } });
  for (const key of keys) { const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } }); await db.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } }); }
  const employee = (await db.employee.create({ data: { organizationId: org, userId: user, employeeCode: 'SYN-' + randomUUID().slice(0, 12), displayName: 'Synthetic employee' } })).id;
  const session = await db.authSession.create({ data: { userId: user, refreshTokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 600000) } });
  return { org, user, employee, token: sign({ sub: user, sid: session.id, typ: 'access' }, secret, { expiresIn: 600 }) };
 }
 const http = () => request(app.getHttpServer());
 it('attendance pagination returns every row once', async () => {
  const f = await fixture([P.ATTENDANCE_READ]);
  for (let day = 1; day <= 5; day++) await db.attendanceRecord.create({ data: { organizationId: f.org, employeeId: f.employee, workDate: new Date(Date.UTC(2026, 9, day)), checkInAt: new Date(Date.UTC(2026, 9, day, 2)) } });
  let cursor: string | null = null; const dates: string[] = [];
  for (let i = 0; i < 6; i++) { const r: Response = await http().get(`/api/v1/organizations/${f.org}/attendance?limit=2${cursor ? '&after=' + cursor : ''}`).set('Authorization', 'Bearer ' + f.token).expect(200); dates.push(...r.body.items.map((x: { workDate: string }) => x.workDate.slice(0, 10))); cursor = r.body.nextCursor; if (!cursor) break; }
  expect(await db.attendanceRecord.count({ where: { organizationId: f.org } })).toBe(5);
  expect(dates).toEqual(['2026-10-05', '2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01']);
 });
 it.each(['name', 'isActive', 'permissionKeys'])('PATCH role with %s:null returns validation400', async field => {
  const f = await fixture([P.ROLE_UPDATE]);
  const target = await db.role.create({ data: { organizationId: f.org, key: 'unassigned', name: 'Unassigned role' } });
  const r = await http().patch(`/api/v1/organizations/${f.org}/roles/${target.id}`).set('Authorization', 'Bearer ' + f.token).send({ [field]: null });
  expect(r.status).toBe(400); expect((await db.role.findUniqueOrThrow({ where: { id: target.id } })).name).toBe('Unassigned role');
 });
 it.each(['displayName', 'membershipStatus'])('PATCH user with %s:null returns validation400', async field => {
  const operator = await fixture([P.USER_UPDATE]);
  const target = await fixture([], operator.org);
  await http().patch(`/api/v1/organizations/${operator.org}/users/${target.user}`).set('Authorization', 'Bearer ' + operator.token).send({ [field]: null }).expect(400);
  expect((await db.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: operator.org, userId: target.user } } })).status).toBe('ACTIVE');
 });
 it('rejects nonexistent calendar dates without silently filtering another day', async () => {
  const f = await fixture([P.ATTENDANCE_READ]);
  await db.attendanceRecord.create({ data: { organizationId: f.org, employeeId: f.employee, workDate: new Date('2026-03-03T00:00:00Z'), checkInAt: new Date('2026-03-03T02:00:00Z') } });
  const r = await http().get(`/api/v1/organizations/${f.org}/attendance?workDate=2026-02-31`).set('Authorization', 'Bearer ' + f.token).expect(400);
  expect(r.body).not.toHaveProperty('items');
 });
 it.each(['from=2026-02-31', 'from=2026-10-05&to=2026-10-01', 'limit=2junk'])('rejects invalid attendance query %s', async query => {
  const f = await fixture([P.ATTENDANCE_READ]);
  await http().get(`/api/v1/organizations/${f.org}/attendance?${query}`).set('Authorization', 'Bearer ' + f.token).expect(400);
 });
 it.each(['month=2026-13', 'from=2026-10-01', 'from=2026-10-05&to=2026-10-01'])('rejects invalid summary query %s', async query => {
  const f = await fixture([P.ATTENDANCE_READ]);
  await http().get(`/api/v1/organizations/${f.org}/attendance/summary?${query}`).set('Authorization', 'Bearer ' + f.token).expect(400);
 });
 it('valid leap day and scoped cursor are handled without leaking another employee', async () => {
  const f = await fixture([P.ATTENDANCE_READ]);
  const other = await fixture([P.ATTENDANCE_READ], f.org);
  const row = await db.attendanceRecord.create({ data: { organizationId: f.org, employeeId: other.employee, workDate: new Date('2024-02-29'), checkInAt: new Date('2024-02-29T02:00:00Z') } });
  const result = await http().get(`/api/v1/organizations/${f.org}/attendance?workDate=2024-02-29`).set('Authorization', 'Bearer ' + f.token).expect(200);
  expect(result.body.items).toHaveLength(0);
  await http().get(`/api/v1/organizations/${f.org}/attendance?after=${row.id}`).set('Authorization', 'Bearer ' + f.token).expect(400);
 });
 it('leave approver cannot read payroll through list, detail, cursor or summary', async () => {
  const accountant = await fixture([P.PAYROLL_CALCULATE]);
  const limited = await fixture([P.APPROVAL_READ, P.LEAVE_APPROVE], accountant.org);
  const period = await db.payrollPeriod.create({ data: { organizationId: accountant.org, name: 'Synthetic payroll', periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-10-31'), status: 'CALCULATED', totalGross: 123456789, totalNet: 112233445, employeeCount: 12 } });
  await http().post(`/api/v1/organizations/${accountant.org}/payroll-periods/${period.id}/request-approval`).set('Authorization', 'Bearer ' + accountant.token).send({}).expect(201);
  await http().get(`/api/v1/organizations/${accountant.org}/payroll-periods/${period.id}`).set('Authorization', 'Bearer ' + limited.token).expect(403);
  const list = await http().get(`/api/v1/organizations/${accountant.org}/approvals?type=PAYROLL`).set('Authorization', 'Bearer ' + limited.token).expect(200);
  expect(list.body.items).toHaveLength(0);
  const approval = await db.approvalRequest.findFirstOrThrow({ where: { organizationId: accountant.org, type: 'PAYROLL' } });
  await http().get(`/api/v1/organizations/${accountant.org}/approvals/${approval.id}`).set('Authorization', 'Bearer ' + limited.token).expect(403);
  await http().get(`/api/v1/organizations/${accountant.org}/approvals?after=${approval.id}`).set('Authorization', 'Bearer ' + limited.token).expect(400);
  const summary = await http().get(`/api/v1/organizations/${accountant.org}/approvals/summary`).set('Authorization', 'Bearer ' + limited.token).expect(200); expect(summary.body.pendingCount).toBe(0);
  const authorized = await fixture([P.APPROVAL_READ, P.LEAVE_APPROVE, P.PAYROLL_READ], accountant.org);
  const detail = await http().get(`/api/v1/organizations/${accountant.org}/approvals/${approval.id}`).set('Authorization', 'Bearer ' + authorized.token).expect(200); expect(detail.body.payload.totalNet).toBe('112233445');
  const ai = await app.get(ApprovalService).pendingForAssistant(limited.user, limited.org, { limit: 10 });
  expect(ai.items).toHaveLength(0);
  const outsider = await fixture([P.APPROVAL_READ]);
  await http().get(`/api/v1/organizations/${accountant.org}/approvals/${approval.id}`).set('Authorization', 'Bearer ' + outsider.token).expect(403);
 });
});

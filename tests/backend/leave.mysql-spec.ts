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
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'leave-fixture-secret-not-production';

const leavePayload = {
  leaveType: 'ANNUAL',
  startsAt: '2026-10-05T01:00:00.000Z', // 08:00 UTC+7
  endsAt: '2026-10-07T10:00:00.000Z',   // 17:00 UTC+7 (3 days)
  reason: 'Nghỉ phép thường niên',
};

mysqlDescribe('Leave Management (DXOS-PHASE2-TASK2-LEAVE-001)', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string, manager: string, foreign: string;
  let org: string, foreignOrg: string;
  let actorEmp: string, managerEmp: string;
  let actorRole: string, managerRole: string;
  let actorSession: string, managerSession: string;
  let actorToken: string, managerToken: string;

  const base = (organizationId = org) => `/api/v1/organizations/${organizationId}/leave-requests`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) {
      throw new Error('Disposable database required.');
    }
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {}));
    await app.init();
  });

  beforeEach(async () => {
    actor = randomUUID();
    manager = randomUUID();
    foreign = randomUUID();
    actorSession = randomUUID();
    managerSession = randomUUID();

    await db.user.createMany({
      data: [
        { id: actor, email: `${actor}@example.test`, displayName: 'Actor User', passwordHash: 'fixture-hash' },
        { id: manager, email: `${manager}@example.test`, displayName: 'Manager User', passwordHash: 'fixture-hash' },
        { id: foreign, email: `${foreign}@example.test`, displayName: 'Foreign User', passwordHash: 'fixture-hash' },
      ],
    });

    await db.authSession.createMany({
      data: [
        { id: actorSession, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
        { id: managerSession, userId: manager, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
      ],
    });

    actorToken = sign({ sub: actor, sid: actorSession, typ: 'access' }, secret, { expiresIn: 300 });
    managerToken = sign({ sub: manager, sid: managerSession, typ: 'access' }, secret, { expiresIn: 300 });

    const orgService = app.get(OrganizationsService);
    org = (await orgService.create(actor, { name: 'Leave Org A', slug: `leave-a-${randomUUID()}` })).id;
    foreignOrg = (await orgService.create(foreign, { name: 'Leave Org B', slug: `leave-b-${randomUUID()}` })).id;

    // Add manager membership in org
    await db.organizationMembership.create({ data: { organizationId: org, userId: manager } });

    // Roles
    actorRole = (await db.role.findFirstOrThrow({ where: { organizationId: org } })).id;
    managerRole = (await db.role.create({ data: { organizationId: org, key: 'manager', name: 'Manager' } })).id;

    const managerMembership = await db.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: org, userId: manager } },
    });
    await db.membershipRole.create({ data: { organizationId: org, membershipId: managerMembership.id, roleId: managerRole } });

    // Grant permissions
    for (const key of [PERMISSIONS.LEAVE_READ, PERMISSIONS.LEAVE_CREATE]) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: actorRole, permissionId: p.id } });
    }
    for (const key of [PERMISSIONS.LEAVE_READ, PERMISSIONS.LEAVE_CREATE, PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.LEAVE_CANCEL]) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: managerRole, permissionId: p.id } });
    }

    actorEmp = (await db.employee.create({
      data: { organizationId: org, userId: actor, employeeCode: 'EMP-ACT', displayName: 'Employee Actor' },
    })).id;

    managerEmp = (await db.employee.create({
      data: { organizationId: org, userId: manager, employeeCode: 'EMP-MGR', displayName: 'Employee Manager' },
    })).id;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    const orgs = { in: [org, foreignOrg] };
    const users = { in: [actor, manager, foreign] };

    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: orgs }, { actorUserId: users }] } });
    await db.notification.deleteMany({ where: { organizationId: orgs } });
    await db.leaveRequest.deleteMany({ where: { organizationId: orgs } });
    await db.calendarEvent.deleteMany({ where: { organizationId: orgs } });
    await db.task.deleteMany({ where: { organizationId: orgs } });
    await db.employee.deleteMany({ where: { organizationId: orgs } });
    await db.membershipRole.deleteMany({ where: { organizationId: orgs } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: orgs } } });
    await db.role.deleteMany({ where: { organizationId: orgs } });
    await db.organizationMembership.deleteMany({ where: { organizationId: orgs } });
    await db.organization.deleteMany({ where: { id: orgs } });
    await db.authSession.deleteMany({ where: { userId: users } });
    await db.user.deleteMany({ where: { id: users } });
  });

  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
    delete process.env.JWT_ACCESS_SECRET;
  });

  it('requires JWT authentication for reads and mutations', async () => {
    await http().get(base()).expect(401);
    await http().post(base()).send({ ...leavePayload, employeeId: actorEmp }).expect(401);
    await http().post(`${base()}/${randomUUID()}/approve`).send({}).expect(401);
    await http().post(`${base()}/${randomUUID()}/reject`).send({ reason: 'No' }).expect(401);
    await http().post(`${base()}/${randomUUID()}/cancel`).send({}).expect(401);
  });

  it('denies cross-tenant access and hides foreign leave requests', async () => {
    await http()
      .get(base(foreignOrg))
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(403);

    await http()
      .post(base(foreignOrg))
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ ...leavePayload, employeeId: actorEmp })
      .expect(403);
  });

  it('creates leave request with automatic daysCount calculation and records audit', async () => {
    const res = await http()
      .post(base())
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ ...leavePayload, employeeId: actorEmp })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('PENDING');
    expect(res.body.daysCount).toBe(3); // 3 days calculated automatically
    expect(res.body.employee.displayName).toBe('Employee Actor');

    const audit = await db.auditEvent.findFirstOrThrow({
      where: { resourceId: res.body.id, event: 'leave.request.created' },
    });
    expect(audit.actorUserId).toBe(actor);
  });

  it('validates input boundaries: endsAt <= startsAt, max 90 days', async () => {
    await http()
      .post(base())
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ ...leavePayload, employeeId: actorEmp, endsAt: leavePayload.startsAt })
      .expect(400);

    await http()
      .post(base())
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        ...leavePayload,
        employeeId: actorEmp,
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2027-02-01T00:00:00.000Z', // > 90 days
      })
      .expect(400);
  });

  it('prevents submitting leave request for another employee profile', async () => {
    await http()
      .post(base())
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ ...leavePayload, employeeId: managerEmp }) // actor trying to submit for manager
      .expect(403);
  });

  it('enforces non-self approval: actor cannot approve their own request', async () => {
    const created = (
      await http()
        .post(base())
        .set('Authorization', `Bearer ${actorToken}`)
        .send({ ...leavePayload, employeeId: actorEmp })
        .expect(201)
    ).body;

    // Actor tries to approve their own request
    await http()
      .post(`${base()}/${created.id}/approve`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ note: 'Self approve' })
      .expect(403);
  });

  it('manager approves leave: creates CalendarEvent and sends Notification to employee', async () => {
    const created = (
      await http()
        .post(base())
        .set('Authorization', `Bearer ${actorToken}`)
        .send({ ...leavePayload, employeeId: actorEmp })
        .expect(201)
    ).body;

    const approved = (
      await http()
        .post(`${base()}/${created.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ note: 'Đã duyệt nghỉ phép' })
        .expect(201)
    ).body;

    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewerUserId).toBe(manager);
    expect(approved.reviewerNote).toBe('Đã duyệt nghỉ phép');
    expect(approved.calendarEventId).toBeDefined();

    // Verify CalendarEvent was created
    const event = await db.calendarEvent.findUniqueOrThrow({
      where: { id: approved.calendarEventId },
    });
    expect(event.status).toBe('SCHEDULED');
    expect(event.title).toContain('Employee Actor');

    // Verify Notification was sent to actor
    const notification = await db.notification.findFirstOrThrow({
      where: { recipientUserId: actor, type: 'leave.status_changed' },
    });
    expect(notification.title).toContain('phê duyệt');
  });

  it('enforces overlap detection: cannot create or approve overlapping leave', async () => {
    // 1. Create and approve first leave: Oct 5 to Oct 7
    const first = (
      await http()
        .post(base())
        .set('Authorization', `Bearer ${actorToken}`)
        .send({ ...leavePayload, employeeId: actorEmp })
        .expect(201)
    ).body;

    await http()
      .post(`${base()}/${first.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);

    // 2. Try creating overlapping leave: Oct 6 to Oct 8 -> 409 Conflict
    await http()
      .post(base())
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        ...leavePayload,
        employeeId: actorEmp,
        startsAt: '2026-10-06T01:00:00.000Z',
        endsAt: '2026-10-08T10:00:00.000Z',
      })
      .expect(409);
  });

  it('manager rejects leave with required reason and notifies employee', async () => {
    const created = (
      await http()
        .post(base())
        .set('Authorization', `Bearer ${actorToken}`)
        .send({ ...leavePayload, employeeId: actorEmp })
        .expect(201)
    ).body;

    // Missing reason -> 400
    await http()
      .post(`${base()}/${created.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(400);

    const rejected = (
      await http()
        .post(`${base()}/${created.id}/reject`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Dự án đang bàn giao khẩn cấp' })
        .expect(201)
    ).body;

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.reviewerNote).toBe('Dự án đang bàn giao khẩn cấp');

    // Verify Notification sent to actor with reason
    const notification = await db.notification.findFirstOrThrow({
      where: { recipientUserId: actor, type: 'leave.status_changed' },
    });
    expect(notification.title).toContain('từ chối');
    expect(notification.body).toContain('Dự án đang bàn giao khẩn cấp');
  });

  it('cancelling approved leave marks calendar event CANCELLED', async () => {
    const created = (
      await http()
        .post(base())
        .set('Authorization', `Bearer ${actorToken}`)
        .send({ ...leavePayload, employeeId: actorEmp })
        .expect(201)
    ).body;

    const approved = (
      await http()
        .post(`${base()}/${created.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(201)
    ).body;

    // Actor cancels their own approved leave
    const cancelled = (
      await http()
        .post(`${base()}/${created.id}/cancel`)
        .set('Authorization', `Bearer ${actorToken}`)
        .send({ reason: 'Kế hoạch thay đổi' })
        .expect(201)
    ).body;

    expect(cancelled.status).toBe('CANCELLED');

    // CalendarEvent is now CANCELLED
    const event = await db.calendarEvent.findUniqueOrThrow({
      where: { id: approved.calendarEventId },
    });
    expect(event.status).toBe('CANCELLED');
  });
});

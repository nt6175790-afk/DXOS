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
const secret = 'approval-fixture-secret-not-production';

mysqlDescribe('Approval Workflow Engine Integration & RBAC (TASK 5)', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string, manager: string, foreign: string;
  let org: string, foreignOrg: string;
  let actorEmp: string, managerEmp: string;
  let actorRole: string, managerRole: string;
  let actorSession: string, managerSession: string;
  let actorToken: string, managerToken: string;

  const approvalsBase = (organizationId = org) => `/api/v1/organizations/${organizationId}/approvals`;
  const leavesBase = (organizationId = org) => `/api/v1/organizations/${organizationId}/leave-requests`;
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
        { id: actor, email: `${actor}@example.test`, displayName: 'Actor Employee', passwordHash: 'fixture-hash' },
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

    actorToken = sign({ sub: actor, sid: actorSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });
    managerToken = sign({ sub: manager, sid: managerSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });

    const orgService = app.get(OrganizationsService);
    org = (await orgService.create(manager, { name: 'Workflow Test Org', slug: `workflow-${randomUUID().slice(0, 8)}` })).id;
    foreignOrg = (await orgService.create(foreign, { name: 'Foreign Test Org', slug: `foreign-${randomUUID().slice(0, 8)}` })).id;

    const actorMembership = await db.organizationMembership.create({
      data: { organizationId: org, userId: actor, status: 'ACTIVE' },
    });

    const actorEmpRow = await db.employee.create({
      data: { organizationId: org, userId: actor, employeeCode: 'EMP-ACTOR', displayName: 'Actor Employee', status: 'ACTIVE' },
    });
    actorEmp = actorEmpRow.id;

    const managerEmpRow = await db.employee.create({
      data: { organizationId: org, userId: manager, employeeCode: 'EMP-MGR', displayName: 'Manager User', status: 'ACTIVE' },
    });
    managerEmp = managerEmpRow.id;

    // Create roles
    const employeeRole = await db.role.create({
      data: { organizationId: org, key: 'employee', name: 'Employee Role', isActive: true },
    });
    actorRole = employeeRole.id;

    const mgrRole = await db.role.create({
      data: { organizationId: org, key: 'manager', name: 'Manager Role', isActive: true },
    });
    managerRole = mgrRole.id;

    // Grant permissions
    const permKeys = [
      PERMISSIONS.APPROVAL_READ,
      PERMISSIONS.APPROVAL_CREATE,
      PERMISSIONS.LEAVE_READ,
      PERMISSIONS.LEAVE_CREATE,
      PERMISSIONS.ATTENDANCE_READ,
    ];
    for (const key of permKeys) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: actorRole, permissionId: p.id } });
    }

    const mgrPermKeys = [
      ...permKeys,
      PERMISSIONS.APPROVAL_APPROVE,
      PERMISSIONS.APPROVAL_REJECT,
      PERMISSIONS.APPROVAL_MANAGE,
      PERMISSIONS.LEAVE_APPROVE,
      PERMISSIONS.ATTENDANCE_MANAGE,
    ];
    for (const key of mgrPermKeys) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: managerRole, permissionId: p.id } });
    }

    await db.membershipRole.create({
      data: { organizationId: org, membershipId: actorMembership.id, roleId: actorRole },
    });

    const mgrMembership = await db.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: org, userId: manager } },
    });
    await db.membershipRole.create({
      data: { organizationId: org, membershipId: mgrMembership.id, roleId: managerRole },
    });
  });

  afterEach(async () => {
    await db.notification.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.approvalRequest.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.attendanceRecord.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.leaveRequest.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.calendarEvent.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.workSchedule.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.shift.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.auditEvent.deleteMany({
      where: {
        OR: [
          { organizationId: { in: [org, foreignOrg] } },
          { actorUserId: { in: [actor, manager, foreign] } },
        ],
      },
    });
    await db.membershipRole.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: { in: [org, foreignOrg] } } } });
    await db.role.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.employee.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.organizationMembership.deleteMany({ where: { organizationId: { in: [org, foreignOrg] } } });
    await db.organization.deleteMany({ where: { id: { in: [org, foreignOrg] } } });
    await db.authSession.deleteMany({ where: { userId: { in: [actor, manager, foreign] } } });
    await db.user.deleteMany({ where: { id: { in: [actor, manager, foreign] } } });
  });

  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  it('submits attendance adjustment request and blocks duplicate pending request for same date', async () => {
    const res = await http()
      .post(`${approvalsBase()}/adjustment`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        workDate: '2026-09-20',
        targetCheckInAt: '2026-09-20T01:30:00.000Z', // 08:30 UTC+7
        targetCheckOutAt: '2026-09-20T10:30:00.000Z', // 17:30 UTC+7
        reason: 'Quên bấm máy chấm công buổi sáng',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('PENDING');
    expect(res.body.type).toBe('ATTENDANCE_ADJUSTMENT');
    expect(res.body.requester.id).toBe(actorEmp);

    // Duplicate submission for same date should be rejected with 409 Conflict
    await http()
      .post(`${approvalsBase()}/adjustment`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        workDate: '2026-09-20',
        targetCheckInAt: '2026-09-20T01:45:00.000Z',
        reason: 'Gửi lại đơn điều chỉnh',
      })
      .expect(409);
  });

  it('blocks self-approval with 403 Forbidden even if user has APPROVAL_APPROVE permission', async () => {
    // Submit adjustment as manager
    const reqRes = await http()
      .post(`${approvalsBase()}/adjustment`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        workDate: '2026-09-21',
        targetCheckInAt: '2026-09-21T01:30:00.000Z',
        reason: 'Đi công tác sáng',
      })
      .expect(201);

    const approvalId = reqRes.body.id;

    // Manager tries to approve their own request
    const approveRes = await http()
      .post(`${approvalsBase()}/${approvalId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'Tự duyệt đơn của mình' })
      .expect(403);

    expect(approveRes.body.error.code).toBe('FORBIDDEN');
  });

  it('approves attendance adjustment, recalculates attendance record and records audit', async () => {
    const reqRes = await http()
      .post(`${approvalsBase()}/adjustment`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        workDate: '2026-09-22',
        targetCheckInAt: '2026-09-22T02:15:00.000Z', // 09:15 UTC+7 (15 mins late if shift starts 09:00 without grace)
        targetCheckOutAt: '2026-09-22T11:00:00.000Z', // 18:00 UTC+7
        reason: 'Xe hỏng trên đường đến công ty',
      })
      .expect(201);

    const approvalId = reqRes.body.id;

    // Manager approves
    const approveRes = await http()
      .post(`${approvalsBase()}/${approvalId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'Đã xác nhận sự cố' })
      .expect(201);

    expect(approveRes.body.status).toBe('APPROVED');
    expect(approveRes.body.reviewer.id).toBe(managerEmp);

    // Verify AttendanceRecord was created and recalculated
    const attendance = await db.attendanceRecord.findFirst({
      where: { organizationId: org, employeeId: actorEmp, workDate: new Date('2026-09-22T00:00:00.000Z') },
    });
    expect(attendance).toBeDefined();
    expect(attendance?.status).toBe('LATE');
    expect(attendance?.lateMinutes).toBe(15);
    expect(attendance?.workedMinutes).toBeGreaterThan(0);

    // Verify audit event exists
    const audit = await db.auditEvent.findFirst({
      where: { organizationId: org, event: 'attendance.adjusted' },
    });
    expect(audit).toBeDefined();

    // Verify cannot re-approve already approved request
    await http()
      .post(`${approvalsBase()}/${approvalId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(409);
  });

  it('rejects approval request and requires mandatory rejection reason', async () => {
    const reqRes = await http()
      .post(`${approvalsBase()}/adjustment`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        workDate: '2026-09-23',
        targetCheckInAt: '2026-09-23T01:30:00.000Z',
        reason: 'Quên chấm công',
      })
      .expect(201);

    const approvalId = reqRes.body.id;

    // Reject without reason fails validation
    await http()
      .post(`${approvalsBase()}/${approvalId}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(400);

    // Reject with reason succeeds
    const rejectRes = await http()
      .post(`${approvalsBase()}/${approvalId}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Không có minh chứng hợp lệ' })
      .expect(201);

    expect(rejectRes.body.status).toBe('REJECTED');
    expect(rejectRes.body.reviewerNote).toBe('Không có minh chứng hợp lệ');

    // Cannot approve rejected request
    await http()
      .post(`${approvalsBase()}/${approvalId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(409);
  });

  it('allows creator to cancel pending request and blocks cancellation of finalized requests', async () => {
    const reqRes = await http()
      .post(`${approvalsBase()}/adjustment`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        workDate: '2026-09-24',
        targetCheckInAt: '2026-09-24T01:30:00.000Z',
        reason: 'Nhầm lẫn ngày',
      })
      .expect(201);

    const approvalId = reqRes.body.id;

    // Cancel by creator
    const cancelRes = await http()
      .post(`${approvalsBase()}/${approvalId}/cancel`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ reason: 'Tôi xin hủy vì nộp nhầm ngày' })
      .expect(201);

    expect(cancelRes.body.status).toBe('CANCELLED');

    // Cannot cancel again
    await http()
      .post(`${approvalsBase()}/${approvalId}/cancel`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({})
      .expect(409);
  });

  it('synchronizes LeaveRequest creation and approval with unified ApprovalRequest engine', async () => {
    // 1. Create a LeaveRequest via the standard /leave-requests endpoint
    const leaveRes = await http()
      .post(leavesBase())
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        employeeId: actorEmp,
        leaveType: 'ANNUAL',
        startsAt: '2026-09-28T01:00:00.000Z',
        endsAt: '2026-09-29T10:00:00.000Z',
        reason: 'Nghỉ phép thường niên',
      })
      .expect(201);

    const leaveId = leaveRes.body.id;

    // 2. Verify ApprovalRequest was automatically created with type LEAVE
    const approval = await db.approvalRequest.findFirst({
      where: { organizationId: org, type: 'LEAVE', referenceId: leaveId },
    });
    expect(approval).toBeDefined();
    expect(approval?.status).toBe('PENDING');

    // 3. Manager approves via unified /approvals/:id/approve endpoint
    const approveRes = await http()
      .post(`${approvalsBase()}/${approval!.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'Đã duyệt đơn nghỉ phép' })
      .expect(201);

    expect(approveRes.body.status).toBe('APPROVED');

    // 4. Verify original LeaveRequest is now APPROVED and CalendarEvent is scheduled
    const updatedLeave = await db.leaveRequest.findUniqueOrThrow({
      where: { organizationId_id: { organizationId: org, id: leaveId } },
    });
    expect(updatedLeave.status).toBe('APPROVED');
    expect(updatedLeave.calendarEventId).toBeDefined();
  });

  it('blocks cross-tenant access to approval requests', async () => {
    const reqRes = await http()
      .post(`${approvalsBase()}/adjustment`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        workDate: '2026-09-25',
        targetCheckInAt: '2026-09-25T01:30:00.000Z',
        reason: 'Cách ly tenant',
      })
      .expect(201);

    const approvalId = reqRes.body.id;

    // Accessing org from foreign token
    await http()
      .get(`${approvalsBase(foreignOrg)}/${approvalId}`)
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(403);
  });
});

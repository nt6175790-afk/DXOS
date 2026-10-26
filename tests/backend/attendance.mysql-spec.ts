// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LeaveStatus, LeaveType, PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';
import { getVietnamDateParts } from '../../backend/src/modules/attendance/attendance.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'attendance-fixture-secret-not-production';

mysqlDescribe('Attendance Management Integration & RBAC (DXOS-PHASE2-TASK3-ATTENDANCE-001)', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string, manager: string, foreign: string;
  let org: string, foreignOrg: string;
  let actorEmp: string, managerEmp: string;
  let actorRole: string, managerRole: string;
  let actorSession: string, managerSession: string;
  let actorToken: string, managerToken: string;

  const base = (organizationId = org) => `/api/v1/organizations/${organizationId}/attendance`;
  const http = () => request(app.getHttpServer());
  const position = () => ({ latitude: 21, longitude: 105.8, accuracyMeters: 5, capturedAt: new Date().toISOString() });

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

    actorToken = sign({ sub: actor, sid: actorSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });
    managerToken = sign({ sub: manager, sid: managerSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });

    const orgService = app.get(OrganizationsService);
    org = (await orgService.create(actor, { name: `Attendance Org ${randomUUID().slice(0, 8)}`, slug: `att-a-${randomUUID().slice(0, 8)}` })).id;
    foreignOrg = (await orgService.create(foreign, { name: `Foreign Org ${randomUUID().slice(0, 8)}`, slug: `att-b-${randomUUID().slice(0, 8)}` })).id;

    await db.attendanceLocation.create({ data: { organizationId: org, label: 'Test office', latitude: 21, longitude: 105.8 } });

    await db.organizationMembership.create({
      data: { organizationId: org, userId: manager, status: 'ACTIVE' },
    });

    actorRole = (await db.role.findFirstOrThrow({ where: { organizationId: org } })).id;
    managerRole = (await db.role.create({
      data: { organizationId: org, key: 'manager', name: 'Manager Role' },
    })).id;

    for (const key of [
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_CHECK_IN,
      PERMISSIONS.ATTENDANCE_CHECK_OUT,
    ]) {
      const perm = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: actorRole, permissionId: perm.id } },
        update: {},
        create: { roleId: actorRole, permissionId: perm.id },
      });
    }

    for (const key of [
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_CHECK_IN,
      PERMISSIONS.ATTENDANCE_CHECK_OUT,
      PERMISSIONS.ATTENDANCE_MANAGE,
    ]) {
      const perm = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: managerRole, permissionId: perm.id } },
        update: {},
        create: { roleId: managerRole, permissionId: perm.id },
      });
    }

    const managerMem = (await db.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: org, userId: manager } },
    })).id;

    await db.membershipRole.create({
      data: { organizationId: org, membershipId: managerMem, roleId: managerRole },
    });

    actorEmp = (await db.employee.create({
      data: {
        organizationId: org,
        userId: actor,
        employeeCode: `EMP-A-${randomUUID().slice(0, 6).toUpperCase()}`,
        displayName: 'Actor Employee',
        status: 'ACTIVE',
      },
    })).id;

    managerEmp = (await db.employee.create({
      data: {
        organizationId: org,
        userId: manager,
        employeeCode: `EMP-M-${randomUUID().slice(0, 6).toUpperCase()}`,
        displayName: 'Manager Employee',
        status: 'ACTIVE',
      },
    })).id;

    const defaultShift = await db.shift.create({
      data: {
        organizationId: org,
        name: 'Ca hành chính',
        code: `HC-${randomUUID().slice(0, 6)}`,
        startTime: '09:00',
        endTime: '18:00',
        breakStart: '12:00',
        breakEnd: '13:00',
        gracePeriodMinutes: 10,
        isOvernight: false,
        isActive: true,
      },
    });

    const todayParts = getVietnamDateParts(new Date());
    await db.workSchedule.createMany({
      data: [
        {
          organizationId: org,
          employeeId: actorEmp,
          shiftId: defaultShift.id,
          workDate: todayParts.workDate,
          isOff: false,
        },
        {
          organizationId: org,
          employeeId: managerEmp,
          shiftId: defaultShift.id,
          workDate: todayParts.workDate,
          isOff: false,
        },
      ],
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    const orgs = { in: [org, foreignOrg] };
    const users = { in: [actor, manager, foreign] };

    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: orgs }, { actorUserId: users }] } });
    await db.attendanceRecord.deleteMany({ where: { organizationId: orgs } });
    await db.workSchedule.deleteMany({ where: { organizationId: orgs } });
    await db.shift.deleteMany({ where: { organizationId: orgs } });
    await db.leaveRequest.deleteMany({ where: { organizationId: orgs } });
    await db.calendarEvent.deleteMany({ where: { organizationId: orgs } });
    await db.employee.deleteMany({ where: { organizationId: orgs } });
    await db.membershipRole.deleteMany({ where: { organizationId: orgs } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: orgs } } });
    await db.role.deleteMany({ where: { organizationId: orgs } });
    await db.organizationMembership.deleteMany({ where: { organizationId: orgs } });
    await db.attendanceLocation.deleteMany({ where: { organizationId: orgs } });
    await db.organization.deleteMany({ where: { id: orgs } });
    await db.authSession.deleteMany({ where: { userId: users } });
    await db.user.deleteMany({ where: { id: users } });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('1. performs check-in successfully and records audit event', async () => {
    const res = await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ note: 'Đến đúng giờ', location: position() })
      .expect(201);

    expect(res.body.employeeId).toBe(actorEmp);
    expect(res.body.checkInAt).toBeDefined();
    expect(res.body.note).toBe('Đến đúng giờ');
    expect(res.body.status).toBeDefined();

    const audits = await db.auditEvent.findMany({
      where: { organizationId: org, event: 'attendance.check_in', resourceId: res.body.id },
    });
    expect(audits.length).toBe(1);
    expect(audits[0].actorUserId).toBe(actor);
  });

  it('2. rejects duplicate check-in on the same workDate with 409 Conflict', async () => {
    await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(201);

    const res = await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(409);

    expect(res.body.error.code).toBe('ALREADY_CHECKED_IN');
  });

  it('3. rejects check-out if user has not checked in today (400 Bad Request)', async () => {
    const res = await http()
      .post(`${base()}/check-out`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(400);

    expect(res.body.error.code).toBe('CHECK_IN_REQUIRED');
  });

  it('4. performs check-out successfully and computes worked minutes', async () => {
    await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(201);

    const res = await http()
      .post(`${base()}/check-out`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ note: 'Tan ca về nhà', location: position() })
      .expect(201);

    expect(res.body.checkOutAt).toBeDefined();
    expect(res.body.workedMinutes).toBeDefined();
    expect(res.body.earlyLeaveMinutes).toBeDefined();

    const audits = await db.auditEvent.findMany({
      where: { organizationId: org, event: 'attendance.check_out', resourceId: res.body.id },
    });
    expect(audits.length).toBe(1);
  });

  it('5. rejects duplicate check-out with 409 Conflict', async () => {
    await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(201);

    await http()
      .post(`${base()}/check-out`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(201);

    const res = await http()
      .post(`${base()}/check-out`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(409);

    expect(res.body.error.code).toBe('ALREADY_CHECKED_OUT');
  });

  it('6. blocks check-in with 409 EMPLOYEE_ON_LEAVE if employee has an APPROVED leave today', async () => {
    const { dayStartUtc, dayEndUtc } = getVietnamDateParts(new Date());

    await db.leaveRequest.create({
      data: {
        organizationId: org,
        employeeId: actorEmp,
        createdByUserId: actor,
        leaveType: LeaveType.ANNUAL,
        startsAt: dayStartUtc,
        endsAt: dayEndUtc,
        daysCount: 1.0,
        reason: 'Nghỉ phép thường niên hôm nay',
        status: LeaveStatus.APPROVED,
        reviewerUserId: manager,
      },
    });

    const res = await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(409);

    expect(res.body.error.code).toBe('EMPLOYEE_ON_LEAVE');
  });

  it('7. returns today status via GET /today', async () => {
    const initialRes = await http()
      .get(`${base()}/today`)
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(200);

    expect(initialRes.body.isEmployee).toBe(true);
    expect(initialRes.body.record).toBeNull();

    await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(201);

    const afterRes = await http()
      .get(`${base()}/today`)
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(200);

    expect(afterRes.body.record).toBeDefined();
    expect(afterRes.body.record.checkInAt).toBeDefined();
  });

  it('8. enforces cross-tenant isolation (cannot check-in to foreign org)', async () => {
    await http()
      .post(`${base(foreignOrg)}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(403);
  });

  it('9. regular employee cannot view other employee attendance records without manage permission', async () => {
    // Actor checks in
    await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(201);

    // Manager checks in
    await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ location: position() })
      .expect(201);

    // Actor lists attendance: should only see their own record
    const actorList = await http()
      .get(`${base()}?employeeId=${managerEmp}`)
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(200);

    expect(actorList.body.items.every((item: { employeeId: string }) => item.employeeId === actorEmp)).toBe(true);

    // Manager lists attendance for actor: allowed
    const managerList = await http()
      .get(`${base()}?employeeId=${actorEmp}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(managerList.body.items.some((item: { employeeId: string }) => item.employeeId === actorEmp)).toBe(true);
  });

  it('10. calculates attendance summary accurately via GET /summary', async () => {
    await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(201);

    const res = await http()
      .get(`${base()}/summary`)
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(200);

    expect(res.body.totalWorkDays).toBeGreaterThan(0);
    expect(res.body.totalRecords).toBeGreaterThanOrEqual(1);
  });

  it('11. CASE 6: rejects check-in with NO_SCHEDULE_ASSIGNED if employee has no schedule for today', async () => {
    // Delete schedule for actor
    await db.workSchedule.deleteMany({
      where: {
        organizationId: org,
        employeeId: actorEmp,
      },
    });

    const res = await http()
      .post(`${base()}/check-in`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ location: position() })
      .expect(400);

    expect(res.body.error.code).toBe('NO_SCHEDULE_ASSIGNED');
  });
  it('12. requires JWT and explicit attendance:read for location discovery', async () => {
    await http().get(base()+'/location').expect(401);
    await db.rolePermission.deleteMany({where:{roleId:actorRole,permission:{key:PERMISSIONS.ATTENDANCE_READ}}});
    await http().get(base()+'/location').set('Authorization','Bearer '+actorToken).expect(403);
  });
  it('13. location configuration requires manage permission and rejects privilege injection', async () => {
    const input={label:'Office',latitude:21,longitude:105.8};
    await http().put(base()+'/location').set('Authorization','Bearer '+actorToken).send(input).expect(403);
    await http().put(base()+'/location').set('Authorization','Bearer '+managerToken).send({...input,radiusMeters:10000}).expect(400);
    await http().put(base()+'/location').set('Authorization','Bearer '+managerToken).send({...input,organizationId:foreignOrg}).expect(400);
    const result=await http().put(base()+'/location').set('Authorization','Bearer '+managerToken).send(input).expect(200);
    expect(result.body.radiusMeters).toBe(100);
    const audit=await db.auditEvent.findFirstOrThrow({where:{organizationId:org,event:'attendance.location_updated'}});
    expect(audit.metadata).toEqual({});
  });
  it('14. foreign tenant and inactive membership cannot discover or change office', async () => {
    await http().get(base(foreignOrg)+'/location').set('Authorization','Bearer '+actorToken).expect(403);
    await http().put(base(foreignOrg)+'/location').set('Authorization','Bearer '+managerToken).send({label:'Foreign',latitude:0,longitude:0}).expect(403);
    await db.organizationMembership.update({where:{organizationId_userId:{organizationId:org,userId:actor}},data:{status:'INACTIVE'}});
    await http().get(base()+'/location').set('Authorization','Bearer '+actorToken).expect(403);
  });
  it('15. fails closed if office is not configured', async () => {
    await db.attendanceLocation.delete({where:{organizationId:org}});
    const r=await http().post(base()+'/check-in').set('Authorization','Bearer '+actorToken).send({location:position()}).expect(409);
    expect(r.body.error.code).toBe('ATTENDANCE_LOCATION_NOT_CONFIGURED');
    expect(await db.attendanceRecord.count({where:{organizationId:org}})).toBe(0);
  });
  it('16. rejects missing, inaccurate, stale, malformed and injected location without recording attendance', async () => {
    for(const body of [{},{location:{...position(),latitude:91}},{location:{...position(),accuracyMeters:51}},
      {location:{...position(),capturedAt:new Date(Date.now()-61000).toISOString()}},
      {location:{...position(),capturedAt:new Date(Date.now()+60000).toISOString()}},
      {location:{...position(),organizationId:foreignOrg}},{location:position(),withinRadius:true}]) {
      await http().post(base()+'/check-in').set('Authorization','Bearer '+actorToken).send(body).expect(400);
    }
    expect(await db.attendanceRecord.count({where:{organizationId:org}})).toBe(0);
  });
  it('17. blocks distant and uncertain check-ins even when client supplies valid GPS shape', async () => {
    for(const location of [{...position(),latitude:22},{...position(),latitude:21.0008,accuracyMeters:20}]) {
      const r=await http().post(base()+'/check-in').set('Authorization','Bearer '+actorToken).send({location}).expect(403);
      expect(r.body.error.code).toBe('ATTENDANCE_OUTSIDE_OFFICE');
    }
    expect(await db.attendanceRecord.count({where:{organizationId:org}})).toBe(0);
  });
  it('18. check-out independently requires a fresh position inside the office', async () => {
    const created=await http().post(base()+'/check-in').set('Authorization','Bearer '+actorToken).send({location:position()}).expect(201);
    await http().post(base()+'/check-out').set('Authorization','Bearer '+actorToken).send({location:{...position(),latitude:22}}).expect(403);
    expect((await db.attendanceRecord.findUniqueOrThrow({where:{id:created.body.id}})).checkOutAt).toBeNull();
    const result=await http().post(base()+'/check-out').set('Authorization','Bearer '+actorToken).send({location:position()}).expect(201);
    expect(JSON.stringify(result.body)).not.toMatch(/latitude|longitude|accuracyMeters|capturedAt/);
  });

});

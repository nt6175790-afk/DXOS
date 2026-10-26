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
const secret = 'shift-schedule-fixture-secret-not-production';

mysqlDescribe('Shift & Work Schedule Management Integration & RBAC (TASK 4)', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string, manager: string, foreign: string;
  let org: string, foreignOrg: string;
  let actorEmp: string;
  let actorRole: string, managerRole: string;
  let actorSession: string, managerSession: string;
  let actorToken: string, managerToken: string;

  const shiftsBase = (organizationId = org) => `/api/v1/organizations/${organizationId}/shifts`;
  const schedulesBase = (organizationId = org) => `/api/v1/organizations/${organizationId}/schedules`;
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

    actorToken = sign({ sub: actor, sid: actorSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });
    managerToken = sign({ sub: manager, sid: managerSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });

    const orgService = app.get(OrganizationsService);
    org = (await orgService.create(actor, { name: `Shift Org ${randomUUID().slice(0, 8)}`, slug: `shift-a-${randomUUID().slice(0, 8)}` })).id;
    foreignOrg = (await orgService.create(foreign, { name: `Foreign Org ${randomUUID().slice(0, 8)}`, slug: `shift-b-${randomUUID().slice(0, 8)}` })).id;

    await db.organizationMembership.create({
      data: { organizationId: org, userId: manager, status: 'ACTIVE' },
    });

    actorRole = (await db.role.findFirstOrThrow({ where: { organizationId: org } })).id;
    managerRole = (await db.role.create({
      data: { organizationId: org, key: 'manager', name: 'Manager Role' },
    })).id;

    // Actor has read-only for shifts and schedules
    for (const key of [PERMISSIONS.SHIFT_READ, PERMISSIONS.SCHEDULE_READ]) {
      const perm = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: actorRole, permissionId: perm.id } },
        update: {},
        create: { roleId: actorRole, permissionId: perm.id },
      });
    }

    // Manager has full manage permissions
    for (const key of [
      PERMISSIONS.SHIFT_READ,
      PERMISSIONS.SHIFT_CREATE,
      PERMISSIONS.SHIFT_UPDATE,
      PERMISSIONS.SHIFT_MANAGE,
      PERMISSIONS.SCHEDULE_READ,
      PERMISSIONS.SCHEDULE_CREATE,
      PERMISSIONS.SCHEDULE_UPDATE,
      PERMISSIONS.SCHEDULE_MANAGE,
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

    await db.employee.create({
      data: {
        organizationId: org,
        userId: manager,
        employeeCode: `EMP-M-${randomUUID().slice(0, 6).toUpperCase()}`,
        displayName: 'Manager Employee',
        status: 'ACTIVE',
      },
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    const orgs = { in: [org, foreignOrg] };
    const users = { in: [actor, manager, foreign] };

    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: orgs }, { actorUserId: users }] } });
    await db.workSchedule.deleteMany({ where: { organizationId: orgs } });
    await db.shift.deleteMany({ where: { organizationId: orgs } });
    await db.employee.deleteMany({ where: { organizationId: orgs } });
    await db.notification.deleteMany({ where: { organizationId: orgs } });
    await db.membershipRole.deleteMany({ where: { organizationId: orgs } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: orgs } } });
    await db.role.deleteMany({ where: { organizationId: orgs } });
    await db.organizationMembership.deleteMany({ where: { organizationId: orgs } });
    await db.organization.deleteMany({ where: { id: orgs } });
    await db.authSession.deleteMany({ where: { userId: users } });
    await db.user.deleteMany({ where: { id: users } });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('1. manager can create shift and actor can list shifts', async () => {
    const createRes = await http()
      .post(shiftsBase())
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Ca hành chính',
        code: 'HC',
        startTime: '09:00',
        endTime: '18:00',
        breakStart: '12:00',
        breakEnd: '13:00',
        gracePeriodMinutes: 10,
      })
      .expect(201);

    expect(createRes.body.name).toBe('Ca hành chính');
    expect(createRes.body.code).toBe('HC');

    const listRes = await http()
      .get(shiftsBase())
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(200);

    expect(listRes.body.some((s: { code: string; workDate: string }) => s.code === 'HC')).toBe(true);
  });

  it('2. regular employee cannot create shift without SHIFT_CREATE permission', async () => {
    await http()
      .post(shiftsBase())
      .set('Authorization', `Bearer ${actorToken}`)
      .send({
        name: 'Ca chiều',
        code: 'CHIEU',
        startTime: '14:00',
        endTime: '22:00',
      })
      .expect(403);
  });

  it('3. manager can assign work schedule for employee and query it', async () => {
    const shift = await db.shift.create({
      data: {
        organizationId: org,
        name: 'Ca sáng',
        code: 'SANG',
        startTime: '06:00',
        endTime: '14:00',
      },
    });

    const assignRes = await http()
      .post(schedulesBase())
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        employeeId: actorEmp,
        shiftId: shift.id,
        workDate: '2026-09-22',
      })
      .expect(201);

    expect(assignRes.body).toHaveLength(1);
    expect(assignRes.body[0].employeeId).toBe(actorEmp);

    // Actor can read their schedule
    const scheduleRes = await http()
      .get(`${schedulesBase()}/employees/${actorEmp}`)
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(200);

    expect(scheduleRes.body.some((s: { code: string; workDate: string }) => s.workDate.startsWith('2026-09-22'))).toBe(true);
  });

  it('4. strict cross-tenant isolation: cannot access shifts of another organization', async () => {
    const foreignShift = await db.shift.create({
      data: {
        organizationId: foreignOrg,
        name: 'Foreign Shift',
        code: 'FOREIGN',
        startTime: '08:00',
        endTime: '17:00',
      },
    });

    await http()
      .get(`${shiftsBase()}/${foreignShift.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(404);
  });
});

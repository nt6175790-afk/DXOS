// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PrismaClient,
} from '@prisma/client';
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
const secret = 'performance-fixture-secret-not-production';

mysqlDescribe('Performance Management & Employee Review Integration & RBAC (TASK 7)', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string, manager: string, foreign: string;
  let org: string, foreignOrg: string;
  let actorEmp: string, managerEmp: string;
  let actorRole: string, managerRole: string;
  let actorSession: string, managerSession: string;
  let actorToken: string, managerToken: string;

  const orgBase = (organizationId = org) => '/api/v1/organizations/' + organizationId;
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
    const foreignSession = randomUUID();

    await db.user.createMany({
      data: [
        { id: actor, email: actor + '@example.test', displayName: 'Actor Employee', passwordHash: 'fixture-hash' },
        { id: manager, email: manager + '@example.test', displayName: 'Manager User', passwordHash: 'fixture-hash' },
        { id: foreign, email: foreign + '@example.test', displayName: 'Foreign User', passwordHash: 'fixture-hash' },
      ],
    });

    await db.authSession.createMany({
      data: [
        { id: actorSession, userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
        { id: managerSession, userId: manager, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
        { id: foreignSession, userId: foreign, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) },
      ],
    });

    actorToken = sign({ sub: actor, sid: actorSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });
    managerToken = sign({ sub: manager, sid: managerSession, typ: 'access' }, secret, { algorithm: 'HS256', expiresIn: 300 });

    const orgService = app.get(OrganizationsService);
    org = (await orgService.create(manager, { name: 'Performance Org ' + randomUUID().slice(0, 8), slug: 'perf-a-' + randomUUID().slice(0, 8) })).id;
    foreignOrg = (await orgService.create(foreign, { name: 'Foreign Org ' + randomUUID().slice(0, 8), slug: 'perf-b-' + randomUUID().slice(0, 8) })).id;

    // Memberships
    const actorMembership = await db.organizationMembership.create({
      data: { organizationId: org, userId: actor, status: 'ACTIVE' },
    });

    const actorEmpRow = await db.employee.create({
      data: { organizationId: org, userId: actor, employeeCode: 'EMP-ACTOR', displayName: 'Actor Employee', status: 'ACTIVE' },
    });
    actorEmp = actorEmpRow.id;

    const mgrEmpRow = await db.employee.create({
      data: { organizationId: org, userId: manager, employeeCode: 'EMP-MGR', displayName: 'Manager User', status: 'ACTIVE' },
    });
    managerEmp = mgrEmpRow.id;

    // Roles
    const employeeRole = await db.role.create({
      data: { organizationId: org, key: 'employee', name: 'Employee Role', isActive: true },
    });
    actorRole = employeeRole.id;

    const mgrRole = await db.role.create({
      data: { organizationId: org, key: 'manager', name: 'Manager Role', isActive: true },
    });
    managerRole = mgrRole.id;

    // Permissions for actor (standard employee)
    const actorPerms = [
      PERMISSIONS.PERFORMANCE_READ,
      PERMISSIONS.GOAL_READ,
      PERMISSIONS.GOAL_CREATE,
      PERMISSIONS.GOAL_UPDATE,
      PERMISSIONS.KPI_READ,
    ];
    for (const key of actorPerms) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: actorRole, permissionId: p.id } });
    }

    // Permissions for manager (HR / Reviewer / Admin)
    const managerPerms = [
      PERMISSIONS.PERFORMANCE_READ,
      PERMISSIONS.PERFORMANCE_CREATE,
      PERMISSIONS.PERFORMANCE_UPDATE,
      PERMISSIONS.PERFORMANCE_REVIEW,
      PERMISSIONS.PERFORMANCE_MANAGE,
      PERMISSIONS.GOAL_READ,
      PERMISSIONS.GOAL_CREATE,
      PERMISSIONS.GOAL_UPDATE,
      PERMISSIONS.GOAL_MANAGE,
      PERMISSIONS.KPI_READ,
      PERMISSIONS.KPI_UPDATE,
      PERMISSIONS.KPI_MANAGE,
    ];
    for (const key of managerPerms) {
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
    const orgs = { in: [org, foreignOrg] };
    const users = { in: [actor, manager, foreign] };

    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId: orgs }, { actorUserId: users }] } });
    await db.notification.deleteMany({ where: { organizationId: orgs } });
    await db.performanceReview.deleteMany({ where: { organizationId: orgs } });
    await db.performanceGoal.deleteMany({ where: { organizationId: orgs } });
    await db.performanceKpi.deleteMany({ where: { organizationId: orgs } });
    await db.performanceReviewCycle.deleteMany({ where: { organizationId: orgs } });
    await db.membershipRole.deleteMany({ where: { organizationId: orgs } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId: orgs } } });
    await db.role.deleteMany({ where: { organizationId: orgs } });
    await db.employee.deleteMany({ where: { organizationId: orgs } });
    await db.organizationMembership.deleteMany({ where: { organizationId: orgs } });
    await db.organization.deleteMany({ where: { id: orgs } });
    await db.authSession.deleteMany({ where: { userId: users } });
    await db.user.deleteMany({ where: { id: users } });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  describe('1. Review Cycles & Lifecycle Management', () => {
    it('creates review cycle, rejects duplicate name, and updates status', async () => {
      // Manager creates cycle
      const res = await http()
        .post(orgBase() + '/performance-cycles')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          name: 'Q3 2026 Performance Review',
          startDate: '2026-07-01',
          endDate: '2026-09-30',
          description: 'Quarterly review cycle for Q3',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Q3 2026 Performance Review');
      expect(res.body.status).toBe('DRAFT');
      const cycleId = res.body.id;

      // Duplicate name rejected with 409
      const dup = await http()
        .post(orgBase() + '/performance-cycles')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          name: 'Q3 2026 Performance Review',
          startDate: '2026-07-01',
          endDate: '2026-09-30',
        });
      expect(dup.status).toBe(409);

      // Actor lacks permission to create cycle
      const denied = await http()
        .post(orgBase() + '/performance-cycles')
        .set('Authorization', 'Bearer ' + actorToken)
        .send({
          name: 'Unauthorized Cycle',
          startDate: '2026-07-01',
          endDate: '2026-09-30',
        });
      expect(denied.status).toBe(403);

      // Manager updates cycle to OPEN
      const openRes = await http()
        .patch(orgBase() + '/performance-cycles/' + cycleId)
        .set('Authorization', 'Bearer ' + managerToken)
        .send({ status: 'OPEN' });
      expect(openRes.status).toBe(200);
      expect(openRes.body.status).toBe('OPEN');

      // Both can list cycles
      const listRes = await http()
        .get(orgBase() + '/performance-cycles')
        .set('Authorization', 'Bearer ' + actorToken);
      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(1);
      expect(listRes.body[0].name).toBe('Q3 2026 Performance Review');
    });
  });

  describe('2. Goals & Quantitative KPIs', () => {
    let cycleId: string;

    beforeEach(async () => {
      const cycle = await db.performanceReviewCycle.create({
        data: {
          organizationId: org,
          name: 'Cycle for Goals & KPIs',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-09-30'),
          status: 'OPEN',
        },
      });
      cycleId = cycle.id;
    });

    it('creates and tracks individual goals with weights and progress', async () => {
      const goalRes = await http()
        .post(orgBase() + '/performance-goals')
        .set('Authorization', 'Bearer ' + actorToken)
        .send({
          cycleId,
          employeeId: actorEmp,
          title: 'Deliver DX-OS Phase 2',
          weight: 30,
          progress: 50,
        });

      expect(goalRes.status).toBe(201);
      expect(goalRes.body.title).toBe('Deliver DX-OS Phase 2');
      expect(Number(goalRes.body.weight)).toBe(30);
      expect(Number(goalRes.body.progress)).toBe(50);
      const goalId = goalRes.body.id;

      // Update progress to 100% -> auto completes
      const patchRes = await http()
        .patch(orgBase() + '/performance-goals/' + goalId)
        .set('Authorization', 'Bearer ' + actorToken)
        .send({ progress: 100 });

      expect(patchRes.status).toBe(200);
      expect(Number(patchRes.body.progress)).toBe(100);
      expect(patchRes.body.status).toBe('COMPLETED');
    });

    it('creates KPIs and calculates deterministic achievement score', async () => {
      // Manager creates KPI: Target = 200, Actual = 150 -> Score = 75%
      const kpiRes = await http()
        .post(orgBase() + '/performance-kpis')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          cycleId,
          employeeId: actorEmp,
          name: 'Customer Satisfaction Tickets',
          targetValue: 200,
          actualValue: 150,
          unit: 'tickets',
        });

      expect(kpiRes.status).toBe(201);
      expect(kpiRes.body.name).toBe('Customer Satisfaction Tickets');
      expect(Number(kpiRes.body.score)).toBe(75);
      const kpiId = kpiRes.body.id;

      // Update actual value to 250 (exceeds target) -> score capped at 100%
      const updateRes = await http()
        .patch(orgBase() + '/performance-kpis/' + kpiId)
        .set('Authorization', 'Bearer ' + managerToken)
        .send({ actualValue: 250 });

      expect(updateRes.status).toBe(200);
      expect(Number(updateRes.body.score)).toBe(100);
    });
  });

  describe('3. Reviewer Resolution & Strict Anti-Self-Review Rule', () => {
    let cycleId: string;

    beforeEach(async () => {
      const cycle = await db.performanceReviewCycle.create({
        data: {
          organizationId: org,
          name: 'Anti-Self-Review Cycle',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-09-30'),
          status: 'OPEN',
        },
      });
      cycleId = cycle.id;
    });

    it('rejects review creation when reviewer is the employee themselves (HTTP 403 SELF_REVIEW_FORBIDDEN)', async () => {
      const selfReview = await http()
        .post(orgBase() + '/performance-reviews')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          cycleId,
          employeeId: managerEmp,
          reviewerId: managerEmp, // VIOLATION: Reviewing oneself!
        });

      expect(selfReview.status).toBe(403);
      expect(selfReview.body.message || selfReview.body.error?.message || selfReview.body.error?.code).toMatch(/SELF_REVIEW_FORBIDDEN/i);
    });

    it('successfully creates review with independent reviewer and prevents duplicate reviews', async () => {
      const validReview = await http()
        .post(orgBase() + '/performance-reviews')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          cycleId,
          employeeId: actorEmp,
          reviewerId: managerEmp, // Valid dual-control
        });

      expect(validReview.status).toBe(201);
      expect(validReview.body.employeeId).toBe(actorEmp);
      expect(validReview.body.reviewerId).toBe(managerEmp);
      expect(validReview.body.status).toBe('SELF_ASSESSMENT');

      // Duplicate review in same cycle rejected with 409
      const dup = await http()
        .post(orgBase() + '/performance-reviews')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          cycleId,
          employeeId: actorEmp,
          reviewerId: managerEmp,
        });

      expect(dup.status).toBe(409);
    });
  });

  describe('4. Dual-Control Assessment Workflow & Immutability Snapshot', () => {
    let cycleId: string;
    let reviewId: string;

    beforeEach(async () => {
      const cycle = await db.performanceReviewCycle.create({
        data: {
          organizationId: org,
          name: 'End-to-End Evaluation Cycle',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-09-30'),
          status: 'OPEN',
        },
      });
      cycleId = cycle.id;

      // Create a goal and KPI
      await db.performanceGoal.create({
        data: {
          organizationId: org,
          cycleId,
          employeeId: actorEmp,
          title: 'Refactor Core Components',
          weight: 40,
          progress: 80,
          status: 'IN_PROGRESS',
        },
      });

      await db.performanceKpi.create({
        data: {
          organizationId: org,
          cycleId,
          employeeId: actorEmp,
          name: 'Code Coverage %',
          targetValue: 90,
          actualValue: 95,
          unit: '%',
          score: 100,
        },
      });

      const review = await db.performanceReview.create({
        data: {
          organizationId: org,
          cycleId,
          employeeId: actorEmp,
          reviewerId: managerEmp,
          status: 'SELF_ASSESSMENT',
        },
      });
      reviewId = review.id;
    });

    it('executes full workflow: self assessment -> manager review -> completion snapshot -> immutability freeze', async () => {
      // Step 1: Employee submits self assessment
      const selfRes = await http()
        .post(orgBase() + '/performance-reviews/' + reviewId + '/self-assessment')
        .set('Authorization', 'Bearer ' + actorToken)
        .send({
          selfAssessment: 'Đã hoàn thành các mục tiêu kỹ thuật lớn và hỗ trợ team hiệu quả.',
          selfRating: 4,
        });

      expect(selfRes.status).toBe(201);
      expect(selfRes.body.selfRating).toBe(4);
      expect(selfRes.body.status).toBe('MANAGER_REVIEW');

      // Step 2: Employee cannot submit manager review for themselves (Strict Anti-Self-Review)
      const cheatManagerReview = await http()
        .post(orgBase() + '/performance-reviews/' + reviewId + '/manager-review')
        .set('Authorization', 'Bearer ' + actorToken)
        .send({
          managerReview: 'Tự khen mình xuất sắc',
          managerRating: 5,
        });

      expect(cheatManagerReview.status).toBe(403);
      expect(cheatManagerReview.body.message || cheatManagerReview.body.error?.message || cheatManagerReview.body.error?.code).toMatch(/SELF_REVIEW_FORBIDDEN|NOT_DESIGNATED_REVIEWER|permission/i);

      // Step 3: Designated Manager submits review
      const mgrRes = await http()
        .post(orgBase() + '/performance-reviews/' + reviewId + '/manager-review')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          managerReview: 'Hiệu suất làm việc rất cao, giải quyết sự cố chủ động.',
          managerRating: 5,
          summaryFeedback: 'Đề xuất thăng cấp Senior',
        });

      expect(mgrRes.status).toBe(201);
      expect(mgrRes.body.managerRating).toBe(5);

      // Step 4: Complete review and generate immutable snapshot
      const completeRes = await http()
        .post(orgBase() + '/performance-reviews/' + reviewId + '/complete')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({
          finalRating: 5,
          summaryFeedback: 'Chính thức xếp loại Xuất sắc (5/5).',
        });

      expect(completeRes.status).toBe(201);
      expect(completeRes.body.status).toBe('COMPLETED');
      expect(completeRes.body.finalRating).toBe(5);
      expect(completeRes.body.snapshotData).toBeDefined();
      expect(completeRes.body.snapshotData.goals.length).toBeGreaterThan(0);
      expect(completeRes.body.snapshotData.kpis.length).toBeGreaterThan(0);

      // Step 5: Immutability check - attempting to submit self-assessment again throws 400
      const retrySelf = await http()
        .post(orgBase() + '/performance-reviews/' + reviewId + '/self-assessment')
        .set('Authorization', 'Bearer ' + actorToken)
        .send({
          selfAssessment: 'Thay đổi sau khi đã đóng băng',
          selfRating: 3,
        });

      expect(retrySelf.status).toBe(400);
      expect(retrySelf.body.message || retrySelf.body.error?.message || retrySelf.body.error?.code).toMatch(/REVIEW_ALREADY_COMPLETED_IMMUTABLE/i);
    });

    it('queries performance dashboard metrics and employee performance profile', async () => {
      // Complete review first
      await http()
        .post(orgBase() + '/performance-reviews/' + reviewId + '/complete')
        .set('Authorization', 'Bearer ' + managerToken)
        .send({ finalRating: 4 });

      // Dashboard
      const dashRes = await http()
        .get(orgBase() + '/performance-dashboard')
        .set('Authorization', 'Bearer ' + managerToken);

      expect(dashRes.status).toBe(200);
      expect(dashRes.body.totalReviews).toBe(1);
      expect(dashRes.body.completedReviewsCount).toBe(1);
      expect(dashRes.body.averageRating).toBe(4);
      expect(dashRes.body.ratingDistribution['4']).toBe(1);

      // Employee Profile
      const profRes = await http()
        .get(orgBase() + '/employees/' + actorEmp + '/performance-profile')
        .set('Authorization', 'Bearer ' + managerToken);

      expect(profRes.status).toBe(200);
      expect(profRes.body.employee.id).toBe(actorEmp);
      expect(profRes.body.averageRating).toBe(4);
      expect(profRes.body.reviews.length).toBe(1);
    });
  });
});

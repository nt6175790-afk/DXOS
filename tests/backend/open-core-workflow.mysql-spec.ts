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
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';
import { AuditService } from '../../backend/src/modules/audit/audit.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
const secret = 'open-core-workflow-disposable-test-secret';

integration('Open-Core: authenticated university unit workflow, persistence and audit', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused@localhost/unused' } } });
  let app: INestApplication;
  let org: string; let foreignOrg: string; let actor: string; let membership: string;
  let token: string; let definition: string; let foreignDefinition: string;
  const http = () => request(app.getHttpServer());
  const route = (suffix = '', tenant = org) => `/api/v1/organizations/${tenant}/workflows${suffix}`;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const start = (id = definition) => http().post(route()).set(auth()).send({
    workflowDefinitionId: id, title: 'Rà soát hồ sơ giảng viên của đơn vị đào tạo',
  });
  const confirm = (id: string, step: string) => http().post(route(`/${id}/steps/${step}/confirm`)).set(auth()).send({ comments: 'Đã kiểm tra hồ sơ giả lập' });

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {}));
    await app.init();
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });
  afterEach(async () => {
    // The full suite shares its disposable DB. Remove only this test's fixtures,
    // including notifications, so other modules can assert absence of side effects.
    const tenants = { organizationId: { in: [org, foreignOrg] } };
    await db.workflowStepExecution.deleteMany({ where: tenants });
    await db.workflowInstance.deleteMany({ where: tenants });
    await db.workflowDefinition.deleteMany({ where: tenants });
    await db.task.deleteMany({ where: tenants });
    await db.employeeDocument.deleteMany({ where: tenants });
    await db.employee.deleteMany({ where: tenants });
    await db.notification.deleteMany({ where: tenants });
    await db.auditEvent.deleteMany({ where: { OR: [tenants, { actorUserId: actor }] } });
    const roles = await db.role.findMany({ where: tenants, select: { id: true } });
    await db.rolePermission.deleteMany({ where: { roleId: { in: roles.map(r => r.id) } } });
    await db.membershipRole.deleteMany({ where: tenants });
    await db.role.deleteMany({ where: tenants });
    await db.organizationMembership.deleteMany({ where: tenants });
    await db.organization.deleteMany({ where: { id: { in: [org, foreignOrg] } } });
    await db.authSession.deleteMany({ where: { userId: actor } });
    await db.user.delete({ where: { id: actor } });
  });
  beforeEach(async () => {
    actor = randomUUID();
    await db.user.create({ data: { id: actor, email: `${actor}@example.test`, passwordHash: 'not-used-by-session-fixture' } });
    const session = await db.authSession.create({ data: { userId: actor, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session.id, typ: 'access' }, secret, { expiresIn: 300 });
    org = (await db.organization.create({ data: { name: 'Đơn vị đào tạo giả lập', slug: `unit-${randomUUID()}` } })).id;
    foreignOrg = (await db.organization.create({ data: { name: 'Đơn vị khác', slug: `other-unit-${randomUUID()}` } })).id;
    membership = (await db.organizationMembership.create({ data: { organizationId: org, userId: actor } })).id;
    const role = await db.role.create({ data: { organizationId: org, key: 'unit-operator', name: 'Unit operator' } });
    await db.membershipRole.create({ data: { organizationId: org, membershipId: membership, roleId: role.id } });
    for (const key of [PERMISSIONS.WORKFLOW_READ, PERMISSIONS.WORKFLOW_CREATE, PERMISSIONS.WORKFLOW_UPDATE, PERMISSIONS.WORKFLOW_CANCEL]) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    const steps = JSON.stringify([{ name: 'Thông báo tiếp nhận', type: 'NOTIFICATION' }, { name: 'Người phụ trách xác nhận', type: 'HUMAN_CONFIRMATION' }]);
    definition = (await db.workflowDefinition.create({ data: { organizationId: org, name: 'Rà soát hồ sơ', triggerType: 'MANUAL_UNIT_REVIEW', steps, createdBy: actor } })).id;
    foreignDefinition = (await db.workflowDefinition.create({ data: { organizationId: foreignOrg, name: 'Foreign definition', triggerType: 'MANUAL_UNIT_REVIEW', steps, createdBy: actor } })).id;
  });

  it('executes H → P → D with a real human pause, persistent history and audit', async () => {
    const started = await start().expect(201);
    expect(started.body.status).toBe('WAITING');
    expect(started.body.stepExecutions[0].status).toBe('COMPLETED');
    const step = started.body.stepExecutions[1];
    expect(step.status).toBe('WAITING_CONFIRMATION');
    const finished = await confirm(started.body.id, step.id).expect(201);
    expect(finished.body.status).toBe('COMPLETED');
    const read = await http().get(route(`/${started.body.id}`)).set(auth()).expect(200);
    expect(read.body.ownerUserId).toBe(actor);
    expect(read.body.stepExecutions[1].assignedToUserId).toBe(actor);
    expect(read.body.stepExecutions[1].completedAt).toBeTruthy();
    expect(await db.auditEvent.count({ where: { organizationId: org, resourceId: started.body.id } })).toBeGreaterThanOrEqual(3);
    await confirm(started.body.id, step.id).expect(400);
    await http().post(route(`/${started.body.id}/cancel`)).set(auth()).send({}).expect(400);
  });
  it('rejects anonymous and inactive members before creating a workflow', async () => {
    await http().post(route()).send({ workflowDefinitionId: definition, title: 'Forbidden' }).expect(401);
    await db.organizationMembership.update({ where: { id: membership }, data: { status: 'INACTIVE' } });
    await start().expect(403);
    expect(await db.workflowInstance.count({ where: { organizationId: org } })).toBe(0);
  });
  it('requires explicit grants and does not infer privileges from a role name', async () => {
    await db.membershipRole.deleteMany({ where: { membershipId: membership } });
    await start().expect(403);
  });
  it('rejects foreign organization and definition identifiers without exposing their content', async () => {
    await http().get(route('', foreignOrg)).set(auth()).expect(403);
    const denied = await start(foreignDefinition).expect(404);
    expect(JSON.stringify(denied.body)).not.toContain('Foreign definition');
  });
  it('cannot confirm a cancelled workflow or revive it', async () => {
    const started = await start().expect(201);
    await http().post(route(`/${started.body.id}/cancel`)).set(auth()).send({}).expect(201);
    await confirm(started.body.id, started.body.stepExecutions[1].id).expect(400);
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: started.body.id } })).status).toBe('CANCELLED');
  });
  it('does not start inactive definitions', async () => {
    await db.workflowDefinition.update({ where: { id: definition }, data: { isActive: false } });
    await start().expect(400);
  });
  it.each(['limit=-1', 'limit=not-a-number', 'limit=51', 'status=unknown'])('rejects invalid workflow query %s with 400', async query => {
    await http().get(route(`?${query}`)).set(auth()).expect(400);
  });
  it('accepts only one of two simultaneous confirmations', async () => {
    const started = await start().expect(201);
    const replies = await Promise.all([confirm(started.body.id, started.body.stepExecutions[1].id), confirm(started.body.id, started.body.stepExecutions[1].id)]);
    expect(replies.filter(r => r.status === 201)).toHaveLength(1);
    expect(replies.every(r => [201, 400, 409].includes(r.status))).toBe(true);
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: started.body.id } })).status).toBe('COMPLETED');
  });
  async function businessFixture(permission?: string) {
    const employee = await db.employee.create({ data: { organizationId: org, userId: actor, employeeCode: 'WF-001', displayName: 'Workflow operator' } });
    if (permission) await grant(permission);
    return employee;
  }
  async function grant(key: string) {
    const role = await db.role.findFirstOrThrow({ where: { organizationId: org } });
    const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }
  async function taskWorkflow() {
    await db.workflowDefinition.update({ where: { id: definition }, data: { steps: JSON.stringify([
      { name: 'Confirm task', type: 'HUMAN_CONFIRMATION' }, { name: 'Create task', type: 'TASK', payload: { action: 'CREATE_TASK' } },
    ]) } });
    return start().expect(201);
  }
  it('creates a real task after human confirmation, persists its reference and never duplicates it', async () => {
    await businessFixture(PERMISSIONS.TASK_CREATE);
    const waiting = await taskWorkflow();
    expect(await db.task.count({ where: { organizationId: org } })).toBe(0);
    const done = await confirm(waiting.body.id, waiting.body.stepExecutions[0].id).expect(201);
    expect(done.body.status).toBe('COMPLETED');
    const outcome = JSON.parse(done.body.stepExecutions[1].resultPayload);
    expect(outcome.action).toBe('CREATE_TASK');
    expect(await db.task.count({ where: { organizationId: org, id: outcome.taskId } })).toBe(1);
    await http().post(route(`/${waiting.body.id}/retry`)).set(auth()).send({}).expect(409);
    expect(await db.task.count({ where: { organizationId: org } })).toBe(1);
  });
  it('fails without domain permission, then safely retries after an explicit grant', async () => {
    await businessFixture(); const waiting = await taskWorkflow();
    const failed = await confirm(waiting.body.id, waiting.body.stepExecutions[0].id).expect(201);
    expect(failed.body.status).toBe('FAILED');
    expect(await db.task.count({ where: { organizationId: org } })).toBe(0);
    await grant(PERMISSIONS.TASK_CREATE);
    const retried = await http().post(route(`/${waiting.body.id}/retry`)).set(auth()).send({}).expect(201);
    expect(retried.body.status).toBe('COMPLETED');
    expect(await db.task.count({ where: { organizationId: org } })).toBe(1);
  });
  it('rolls back the task when step audit fails and retry creates exactly one task', async () => {
    await businessFixture(PERMISSIONS.TASK_CREATE); const waiting = await taskWorkflow();
    const audit = app.get(AuditService), original = audit.record.bind(audit);
    const spy = jest.spyOn(audit, 'record').mockImplementation(async (input, tx) => {
      if (input.event === 'workflow.step_completed') throw new Error('Fixture step audit failure');
      return original(input, tx);
    });
    try {
      const failed = await confirm(waiting.body.id, waiting.body.stepExecutions[0].id).expect(201);
      expect(failed.body.status).toBe('FAILED');
      expect(await db.task.count({ where: { organizationId: org } })).toBe(0);
    } finally { spy.mockRestore(); }
    await http().post(route(`/${waiting.body.id}/retry`)).set(auth()).send({}).expect(201);
    expect(await db.task.count({ where: { organizationId: org } })).toBe(1);
  });
  it('updates the actual contract expiry only after human confirmation and document authorization', async () => {
    const employee = await businessFixture(PERMISSIONS.DOCUMENT_UPDATE);
    const doc = await db.employeeDocument.create({ data: { organizationId: org, employeeId: employee.id, category: 'LABOR_CONTRACT', title: 'Fixture contract', expiryDate: new Date(Date.now() + 30 * 86400000) } });
    await db.workflowDefinition.update({ where: { id: definition }, data: { triggerType: 'CONTRACT_RENEWAL', steps: JSON.stringify([{ name: 'Review', type: 'HUMAN_CONFIRMATION' }, { name: 'Renew', type: 'ACTION', payload: { action: 'RENEW_CONTRACT' } }]) } });
    const expiry = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const waiting = await http().post(route()).set(auth()).send({ workflowDefinitionId: definition, title: 'Renew fixture contract', data: { documentId: doc.id, newExpiryDate: expiry } }).expect(201);
    expect((await db.employeeDocument.findUniqueOrThrow({ where: { id: doc.id } })).expiryDate).toEqual(doc.expiryDate);
    const done = await confirm(waiting.body.id, waiting.body.stepExecutions[0].id).expect(201);
    expect(done.body.status).toBe('COMPLETED');
    expect((await db.employeeDocument.findUniqueOrThrow({ where: { id: doc.id } })).expiryDate?.toISOString().slice(0, 10)).toBe(expiry);
  });
});

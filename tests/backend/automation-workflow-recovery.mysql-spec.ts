// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { AutomationEngineService } from '../../backend/src/modules/automation/automation-engine.service';
import { WorkflowService } from '../../backend/src/modules/workflow/workflow.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';

const url = process.env.RBAC_TEST_DATABASE_URL;
const secret = 'automation-recovery-disposable-fixture-secret';
(url ? describe : describe.skip)('Automation atomicity and workflow completion recovery (MySQL)', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused@localhost/unused' } } });
  let app: INestApplication;
  const tenants: string[] = []; const users: string[] = [];
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw Error('Disposable database required');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {}));
    await app.init();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const where = { organizationId: { in: tenants } };
    await db.auditEvent.deleteMany({ where: { OR: [where, { actorUserId: { in: users } }] } });
    await db.workflowStepExecution.deleteMany({ where }); await db.workflowInstance.deleteMany({ where });
    await db.workflowDefinition.deleteMany({ where }); await db.automationExecution.deleteMany({ where });
    await db.automationRule.deleteMany({ where }); await db.task.deleteMany({ where });
    await db.notification.deleteMany({ where }); await db.employee.deleteMany({ where });
    const roles = await db.role.findMany({ where, select: { id: true } });
    await db.rolePermission.deleteMany({ where: { roleId: { in: roles.map(r => r.id) } } });
    await db.membershipRole.deleteMany({ where }); await db.role.deleteMany({ where });
    await db.organizationMembership.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: tenants } } });
    await db.authSession.deleteMany({ where: { userId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } });
    tenants.length = 0; users.length = 0;
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });
  async function fixture() {
    const user = await db.user.create({ data: { email: randomUUID() + '@example.test' } }); users.push(user.id);
    const org = await db.organization.create({ data: { name: 'Recovery fixture', slug: 'recovery-' + randomUUID() } }); tenants.push(org.id);
    const membership = await db.organizationMembership.create({ data: { organizationId: org.id, userId: user.id } });
    const role = await db.role.create({ data: { organizationId: org.id, key: 'operator', name: 'Fixture operator' } });
    await db.membershipRole.create({ data: { organizationId: org.id, membershipId: membership.id, roleId: role.id } });
    for (const key of [PERMISSIONS.AUTOMATION_MANAGE, PERMISSIONS.WORKFLOW_CREATE, PERMISSIONS.WORKFLOW_READ, PERMISSIONS.WORKFLOW_UPDATE, PERMISSIONS.WORKFLOW_CANCEL, PERMISSIONS.TASK_CREATE]) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
    const employee = await db.employee.create({ data: { organizationId: org.id, userId: user.id, employeeCode: 'RECOVERY', displayName: 'Synthetic fixture' } });
    const rule = await db.automationRule.create({ data: { organizationId: org.id, name: 'Atomic fixture', trigger: 'MANUAL_CHECK', conditions: '[]', actions: JSON.stringify([{ type: 'CREATE_TASK', params: { title: 'Synthetic task' } }]), createdBy: user.id } });
    const session = await db.authSession.create({ data: { userId: user.id, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    return { user: user.id, org: org.id, membership: membership.id, role: role.id, employee: employee.id, rule: rule.id,
      token: sign({ sub: user.id, sid: session.id, typ: 'access' }, secret, { expiresIn: 300 }),
      event: { organizationId: org.id, trigger: 'MANUAL_CHECK' as const, entityType: 'EMPLOYEE', entityId: employee.id, data: {} } };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const engine = () => app.get(AutomationEngineService);
  const workflow = () => app.get(WorkflowService);
  function failAudit(...events: string[]) {
    const audit = app.get(AuditService), original = audit.record.bind(audit);
    return jest.spyOn(audit, 'record').mockImplementation(async (input, tx) => {
      if (events.includes(input.event)) throw Error('Injected audit failure with private fixture text');
      return original(input, tx);
    });
  }
  async function definition(f: Fixture, steps = [{ name: 'Create task', type: 'TASK', payload: { action: 'CREATE_TASK' } }]) {
    return db.workflowDefinition.create({ data: { organizationId: f.org, name: 'Fixture task workflow', triggerType: 'TASK_REQUEST', createdBy: f.user, steps: JSON.stringify(steps) } });
  }
  async function stranded(f: Fixture) {
    const def = await definition(f); const spy = failAudit('workflow.instance_completed');
    try { await expect(workflow().startWorkflow(f.user, f.org, { workflowDefinitionId: def.id, title: 'Synthetic workflow' })).rejects.toThrow(); }
    finally { spy.mockRestore(); }
    const row = await db.workflowInstance.findFirstOrThrow({ where: { organizationId: f.org }, include: { stepExecutions: true } });
    expect(row.status).toBe('RUNNING'); expect(row.stepExecutions[0].status).toBe('COMPLETED');
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(1);
    return row;
  }
  it('rolls back task, success record and lastRunAt on success-audit failure; persists one sanitized failure', async () => {
    const f = await fixture(); failAudit('automation.executed');
    const result = await engine().dispatchTrigger(f.event, f.user);
    expect(result[0].status).toBe('FAILED'); expect(JSON.stringify(result)).not.toContain('private fixture');
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(0);
    const rows = await db.automationExecution.findMany({ where: { organizationId: f.org } });
    expect(rows).toHaveLength(1); expect(rows[0].status).toBe('FAILED'); expect(rows[0].error).toBe('Automation action failed.');
    expect((await db.automationRule.findUniqueOrThrow({ where: { id: f.rule } })).lastRunAt).toBeNull();
    expect(await db.auditEvent.count({ where: { organizationId: f.org, event: 'automation.executed' } })).toBe(0);
    expect(await db.auditEvent.count({ where: { organizationId: f.org, event: 'automation.failed' } })).toBe(1);
    expect((await engine().dispatchTrigger(f.event, f.user))[0].status).toBe('SKIPPED_IDEMPOTENT');
  });
  it('serializes six concurrent dispatches to one task, execution and success audit', async () => {
    const f = await fixture(); const results = await Promise.all(Array.from({ length: 6 }, () => engine().dispatchTrigger(f.event, f.user)));
    expect(results.filter(x => x[0].status === 'SUCCESS')).toHaveLength(1);
    expect(results.filter(x => x[0].status === 'SKIPPED_IDEMPOTENT')).toHaveLength(5);
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(1);
    expect(await db.automationExecution.count({ where: { organizationId: f.org } })).toBe(1);
    expect(await db.auditEvent.count({ where: { organizationId: f.org, event: 'automation.executed' } })).toBe(1);
  });
  it('does not suppress a different entity or another tenant', async () => {
    const a = await fixture(), b = await fixture();
    const results = await Promise.all([engine().dispatchTrigger(a.event, a.user), engine().dispatchTrigger({ ...a.event, entityId: randomUUID() }, a.user), engine().dispatchTrigger(b.event, b.user)]);
    expect(results.every(x => x[0].status === 'SUCCESS')).toBe(true);
    expect(await db.task.count({ where: { organizationId: a.org } })).toBe(2);
    expect(await db.task.count({ where: { organizationId: b.org } })).toBe(1);
  });
  it('honors historical executions without deleting or rewriting duplicate history', async () => {
    const f = await fixture(); const key = `${f.org}:${f.rule}:EMPLOYEE:${f.employee}:${new Date().toISOString().slice(0, 10)}`;
    for (let i = 0; i < 2; i++) await db.automationExecution.create({ data: { organizationId: f.org, automationRuleId: f.rule, event: 'MANUAL_CHECK', status: 'SUCCESS', idempotencyKey: key } });
    expect((await engine().dispatchTrigger(f.event, f.user))[0].status).toBe('SKIPPED_IDEMPOTENT');
    expect(await db.automationExecution.count({ where: { organizationId: f.org } })).toBe(2);
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(0);
  });
  it('rolls back notification and earlier task if a later action fails', async () => {
    const f = await fixture(); await db.automationRule.update({ where: { id: f.rule }, data: { actions: JSON.stringify([{ type: 'CREATE_TASK' }, { type: 'CREATE_NOTIFICATION' }, { type: 'UNKNOWN' }]) } });
    expect((await engine().dispatchTrigger(f.event, f.user))[0].status).toBe('FAILED');
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.notification.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.auditEvent.count({ where: { organizationId: f.org, event: 'notification.created' } })).toBe(0);
  });
  it('rolls back the workflow, steps, task and audits together with a failed automation', async () => {
    const f = await fixture(); await definition(f);
    await db.automationRule.update({ where: { id: f.rule }, data: { actions: JSON.stringify([{ type: 'TRIGGER_WORKFLOW', params: { triggerType: 'TASK_REQUEST' } }]) } });
    failAudit('automation.executed'); expect((await engine().dispatchTrigger(f.event, f.user))[0].status).toBe('FAILED');
    expect(await db.workflowInstance.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.workflowStepExecution.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.notification.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.auditEvent.count({ where: { organizationId: f.org, event: { startsWith: 'workflow.' } } })).toBe(0);
  });
  it('commits a complete workflow action once even under concurrent dispatch', async () => {
    const f = await fixture(); await definition(f);
    await db.automationRule.update({ where: { id: f.rule }, data: { actions: JSON.stringify([{ type: 'TRIGGER_WORKFLOW', params: { triggerType: 'TASK_REQUEST' } }, { type: 'SEND_REMINDER' }]) } });
    const results = await Promise.all([engine().dispatchTrigger(f.event, f.user), engine().dispatchTrigger(f.event, f.user)]);
    expect(results.map(x => x[0].status).sort()).toEqual(['SKIPPED_IDEMPOTENT', 'SUCCESS']);
    expect(await db.workflowInstance.count({ where: { organizationId: f.org, status: 'COMPLETED' } })).toBe(1);
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(1);
    expect(await db.auditEvent.count({ where: { organizationId: f.org, event: 'workflow.instance_completed' } })).toBe(1);
  });
  it('rolls back lazily created definitions and a human-paused workflow on automation audit failure', async () => {
    const f = await fixture();
    await db.automationRule.update({ where: { id: f.rule }, data: { actions: JSON.stringify([{ type: 'TRIGGER_WORKFLOW', params: { triggerType: 'CONTRACT_RENEWAL' } }]) } });
    failAudit('automation.executed');
    expect((await engine().dispatchTrigger(f.event, f.user))[0].status).toBe('FAILED');
    expect(await db.workflowDefinition.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.workflowInstance.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.workflowStepExecution.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.notification.count({ where: { organizationId: f.org } })).toBe(0);
  });
  it('does not swallow notification audit failures within an enclosing automation transaction', async () => {
    const f = await fixture(); await definition(f);
    await db.automationRule.update({ where: { id: f.rule }, data: { actions: JSON.stringify([{ type: 'CREATE_TASK' }, { type: 'TRIGGER_WORKFLOW', params: { triggerType: 'TASK_REQUEST' } }]) } });
    failAudit('notification.created');
    expect((await engine().dispatchTrigger(f.event, f.user))[0].status).toBe('FAILED');
    expect(await db.workflowInstance.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.notification.count({ where: { organizationId: f.org } })).toBe(0);
  });
  it('propagates failure-audit failure without leaving a task or unaudited execution', async () => {
    const f = await fixture(); failAudit('automation.executed', 'automation.failed');
    await expect(engine().dispatchTrigger(f.event, f.user)).rejects.toThrow();
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.automationExecution.count({ where: { organizationId: f.org } })).toBe(0);
    jest.restoreAllMocks(); expect((await engine().dispatchTrigger(f.event, f.user))[0].status).toBe('SUCCESS');
  });
  it('rejects inactive, ungranted and foreign actors inside the automation transaction', async () => {
    const f = await fixture(), other = await fixture();
    await expect(engine().dispatchTrigger(f.event, other.user)).rejects.toMatchObject({ status: 403 });
    await db.organizationMembership.update({ where: { id: f.membership }, data: { status: 'INACTIVE' } });
    await expect(engine().dispatchTrigger(f.event, f.user)).rejects.toMatchObject({ status: 403 });
    await db.organizationMembership.update({ where: { id: f.membership }, data: { status: 'ACTIVE' } });
    await db.rolePermission.deleteMany({ where: { roleId: f.role } });
    await expect(engine().dispatchTrigger(f.event, f.user)).rejects.toMatchObject({ status: 403 });
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(0);
  });
  it('preserves domain permission denial as a failed automation without granting task privileges', async () => {
    const f = await fixture(); await definition(f);
    const permission = await db.permission.findUniqueOrThrow({ where: { key: PERMISSIONS.TASK_CREATE } });
    await db.rolePermission.deleteMany({ where: { roleId: f.role, permissionId: permission.id } });
    await db.automationRule.update({ where: { id: f.rule }, data: { actions: JSON.stringify([{ type: 'TRIGGER_WORKFLOW', params: { triggerType: 'TASK_REQUEST' } }]) } });
    expect((await engine().dispatchTrigger(f.event, f.user))[0].status).toBe('FAILED');
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.workflowInstance.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await db.rolePermission.count({ where: { roleId: f.role, permissionId: permission.id } })).toBe(0);
  });
  it('recovers completion through HTTP retry without repeating the committed task or step audit', async () => {
    const f = await fixture(), row = await stranded(f);
    await request(app.getHttpServer()).post(`/api/v1/organizations/${f.org}/workflows/${row.id}/retry`).set('Authorization', `Bearer ${f.token}`).send({}).expect(201);
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('COMPLETED');
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(1);
    expect(await db.auditEvent.count({ where: { organizationId: f.org, event: 'workflow.step_completed' } })).toBe(1);
    expect(await db.auditEvent.count({ where: { organizationId: f.org, event: 'workflow.instance_completed' } })).toBe(1);
    await expect(workflow().retry(f.user, f.org, row.id)).rejects.toMatchObject({ status: 409 });
  });
  it('keeps completion retry recoverable when its audit fails repeatedly', async () => {
    const f = await fixture(), row = await stranded(f); const spy = failAudit('workflow.instance_completed');
    await expect(workflow().retry(f.user, f.org, row.id)).rejects.toThrow(); spy.mockRestore();
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('RUNNING');
    await workflow().retry(f.user, f.org, row.id);
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(1);
  });
  it('completes at most once under concurrent finalization retries', async () => {
    const f = await fixture(), row = await stranded(f);
    const replies = await Promise.allSettled([workflow().retry(f.user, f.org, row.id), workflow().retry(f.user, f.org, row.id)]);
    expect(replies.some(r => r.status === 'fulfilled')).toBe(true);
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('COMPLETED');
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(1);
    expect(await db.auditEvent.count({ where: { organizationId: f.org, event: 'workflow.instance_completed' } })).toBe(1);
  });
  it('cannot resurrect cancellation through completion recovery', async () => {
    const f = await fixture(), row = await stranded(f);
    await workflow().cancelWorkflow(f.user, f.org, row.id, {});
    await expect(workflow().retry(f.user, f.org, row.id)).rejects.toMatchObject({ status: 409 });
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('CANCELLED');
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(1);
  });
  it('denies recovery for anonymous, foreign, inactive or ungranted actors', async () => {
    const f = await fixture(), other = await fixture(), row = await stranded(f);
    await request(app.getHttpServer()).post(`/api/v1/organizations/${f.org}/workflows/${row.id}/retry`).send({}).expect(401);
    await expect(workflow().retry(other.user, f.org, row.id)).rejects.toMatchObject({ status: 403 });
    await db.organizationMembership.update({ where: { id: f.membership }, data: { status: 'INACTIVE' } });
    await expect(workflow().retry(f.user, f.org, row.id)).rejects.toMatchObject({ status: 403 });
    await db.organizationMembership.update({ where: { id: f.membership }, data: { status: 'ACTIVE' } });
    await db.rolePermission.deleteMany({ where: { roleId: f.role } });
    await expect(workflow().retry(f.user, f.org, row.id)).rejects.toMatchObject({ status: 403 });
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('RUNNING');
  });
  it('does not recover a RUNNING instance with unfinished steps or a WAITING human step', async () => {
    const f = await fixture(); const def = await definition(f, [{ name: 'Confirm', type: 'HUMAN_CONFIRMATION', payload: { action: 'CREATE_TASK' } }]);
    const row = await workflow().startWorkflow(f.user, f.org, { workflowDefinitionId: def.id, title: 'Waiting fixture' });
    await expect(workflow().retry(f.user, f.org, row!.id)).rejects.toMatchObject({ status: 409 });
    await db.workflowInstance.update({ where: { id: row!.id }, data: { status: 'RUNNING' } });
    await expect(workflow().retry(f.user, f.org, row!.id)).rejects.toMatchObject({ status: 409 });
    expect(await db.task.count({ where: { organizationId: f.org } })).toBe(0);
  });
});

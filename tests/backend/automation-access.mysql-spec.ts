import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { AutomationEngineService } from '../../backend/src/modules/automation/automation-engine.service';
import { AutomationSchedulerService } from '../../backend/src/modules/automation/automation-scheduler.service';
import { AUTOMATION_TRIGGERS } from '../../backend/src/modules/automation/automation.types';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'automation-access-fixture-secret-not-production';

mysqlDescribe('automation execution and manual scan authorization', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let actor: string; let outsider: string; let org: string; let foreignOrg: string;
  let membership: string; let role: string; let token: string; let outsiderToken: string; let execution: string;
  const endpoint = (path: string, organizationId = org) => `/api/v1/organizations/${organizationId}/automation/${path}`;
  const http = () => request(app.getHttpServer());
  const scan = () => http().post(endpoint('run')).set('Authorization', `Bearer ${token}`)
    .send({ trigger: AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_7D });

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {}));
    await app.init();
  });
  afterEach(async () => { await db.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: [actor, outsider] } }, { organizationId: { in: [org, foreignOrg] } }] } }); });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });

  beforeEach(async () => {
    actor = randomUUID(); outsider = randomUUID();
    await db.user.createMany({ data: [actor, outsider].map((id) => ({ id, email: `${id}@example.test`, passwordHash: 'unused' })) });
    const tokens: string[] = [];
    for (const userId of [actor, outsider]) {
      const session = await db.authSession.create({ data: { userId, refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
      tokens.push(sign({ sub: userId, sid: session.id, typ: 'access' }, secret, { expiresIn: 300 }));
    }
    [token, outsiderToken] = tokens;
    org = (await db.organization.create({ data: { name: 'Automation access', slug: `automation-${randomUUID()}` } })).id;
    foreignOrg = (await db.organization.create({ data: { name: 'Other automation', slug: `automation-foreign-${randomUUID()}` } })).id;
    membership = (await db.organizationMembership.create({ data: { organizationId: org, userId: actor } })).id;
    await db.organizationMembership.create({ data: { organizationId: foreignOrg, userId: outsider } });
    role = (await db.role.create({ data: { organizationId: org, key: 'operator', name: 'Operator' } })).id;
    await db.membershipRole.create({ data: { organizationId: org, membershipId: membership, roleId: role } });
    for (const key of [PERMISSIONS.AUTOMATION_READ, PERMISSIONS.AUTOMATION_MANAGE]) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role, permissionId: permission.id } });
    }
    const employee = await db.employee.create({ data: { organizationId: org, userId: actor, employeeCode: 'AUTO-1', displayName: 'Automation employee' } });
    await db.employeeDocument.create({ data: { organizationId: org, employeeId: employee.id, title: 'Expiring fixture', category: 'LABOR_CONTRACT', expiryDate: new Date(Date.now() + 2 * 86400000) } });
    const rule = await db.automationRule.create({ data: { organizationId: org, name: 'Create fixture task', trigger: AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_7D, conditions: '[]', actions: JSON.stringify([{ type: 'CREATE_TASK', params: { title: 'Authorized scan task' } }]), createdBy: actor } });
    execution = (await db.automationExecution.create({ data: { organizationId: org, automationRuleId: rule.id, event: 'fixture', entityType: 'EMPLOYEE', entityId: employee.id, status: 'SUCCESS', idempotencyKey: randomUUID(), metadata: JSON.stringify({ confidential: 'tenant metadata' }) } })).id;
    const foreignRule = await db.automationRule.create({ data: { organizationId: foreignOrg, name: 'Foreign rule', trigger: 'fixture', conditions: '[]', actions: '[]', createdBy: outsider } });
    await db.automationExecution.create({ data: { organizationId: foreignOrg, automationRuleId: foreignRule.id, event: 'fixture', entityType: 'EMPLOYEE', entityId: randomUUID(), status: 'SUCCESS', idempotencyKey: randomUUID() } });
  });

  async function expectDenied(status = 403, bearer = token, organizationId = org) {
    const before = await db.automationExecution.count({ where: { organizationId: org } });
    const tasks = await db.task.count({ where: { organizationId: org } });
    const read = http().get(endpoint('executions', organizationId));
    if (bearer) read.set('Authorization', `Bearer ${bearer}`);
    await read.expect(status);
    const run = http().post(endpoint('run', organizationId)).send({ trigger: AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_7D });
    if (bearer) run.set('Authorization', `Bearer ${bearer}`);
    await run.expect(status);
    expect(await db.automationExecution.count({ where: { organizationId: org } })).toBe(before);
    expect(await db.task.count({ where: { organizationId: org } })).toBe(tasks);
  }

  it('requires a valid session and rejects outsiders, foreign and malformed organization context before side effects', async () => {
    await expectDenied(401, '');
    await expectDenied(403, outsiderToken);
    await expectDenied(403, token, foreignOrg);
    await expectDenied(403, token, 'not-an-organization');
  });

  it.each(['membership', 'organization', 'role', 'grant'] as const)('rejects inactive or ungranted %s', async (state) => {
    if (state === 'membership') await db.organizationMembership.update({ where: { id: membership }, data: { status: 'INACTIVE' } });
    if (state === 'organization') await db.organization.update({ where: { id: org }, data: { status: 'SUSPENDED' } });
    if (state === 'role') await db.role.update({ where: { id: role }, data: { isActive: false } });
    if (state === 'grant') await db.rolePermission.deleteMany({ where: { roleId: role } });
    await expectDenied();
  });

  it('allows read-only execution discovery in the current tenant without permitting a manual scan', async () => {
    const manage = await db.permission.findUniqueOrThrow({ where: { key: PERMISSIONS.AUTOMATION_MANAGE } });
    await db.rolePermission.deleteMany({ where: { roleId: role, permissionId: manage.id } });
    const response = await http().get(endpoint('executions?limit=1')).set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(execution);
    expect(response.body[0].organizationId).toBe(org);
    await scan().expect(403);
    expect(await db.task.count({ where: { organizationId: org } })).toBe(0);
  });

  it('runs a scan with automation:manage and preserves the existing response and execution behavior', async () => {
    const response = await scan().expect(201);
    expect(response.body.triggersFired).toBe(1);
    expect(response.body.details[0].results[0].status).toBe('SUCCESS');
    expect(await db.task.count({ where: { organizationId: org, title: 'Authorized scan task' } })).toBe(1);
    const reads = await http().get(endpoint('executions')).set('Authorization', `Bearer ${token}`).expect(200);
    expect(reads.body).toHaveLength(2);
    expect(reads.body.every((row: { organizationId: string }) => row.organizationId === org)).toBe(true);
  });

  it('rechecks authorization in services after the HTTP guard and prevents direct untrusted calls', async () => {
    const auth = app.get(AuthorizationService); const originalCan = auth.can.bind(auth);
    let calls = 0;
    const check = jest.spyOn(auth, 'can').mockImplementation(async (...args) => ++calls === 1 ? originalCan(...args) : false);
    try {
      await http().get(endpoint('executions')).set('Authorization', `Bearer ${token}`).expect(403);
      expect(calls).toBe(2); calls = 0;
      await scan().expect(403);
      expect(calls).toBe(2);
    } finally { check.mockRestore(); }
    await expect(app.get(AutomationEngineService).listExecutions(outsider, org)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(app.get(AutomationSchedulerService).runScan(org, outsider)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(app.get(AutomationSchedulerService).runScan(org, 'system')).rejects.toBeInstanceOf(ForbiddenException);
    expect(await db.task.count({ where: { organizationId: org } })).toBe(0);
  });
});

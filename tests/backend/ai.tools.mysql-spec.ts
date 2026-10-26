// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { AiToolRegistry } from '../../backend/src/modules/ai/tools/tool-registry';
import type { ToolContext } from '../../backend/src/modules/ai/tools/tool.types';
import { PERMISSIONS, type PermissionKey } from '../../backend/src/modules/rbac/permission-catalog';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const DAY = 86_400_000;

mysqlDescribe('AI agent tools on real MySQL (tenant isolation, permissions, read models)', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let registry: AiToolRegistry;
  let actor: string, colleague: string, foreign: string, outsider: string, users: string[];
  let orgA: string, orgB: string, deptA: string, deptB: string, empActor: string, empColleague: string;
  const now = new Date('2026-10-24T03:00:00Z');

  const ctx = (userId = actor, organizationId = orgA, permissions: PermissionKey[] = [PERMISSIONS.EMPLOYEE_READ, PERMISSIONS.DEPARTMENT_READ]): ToolContext =>
    ({ userId, organizationId, requestId: 'test', now, permissions: new Set<PermissionKey>(permissions) });
  const run = async (name: string, args: object, context = ctx()) =>
    JSON.parse((await registry.execute({ id: 'c1', name, arguments: JSON.stringify(args) }, context)).content);
  async function grant(organizationId: string, keys: PermissionKey[]) {
    const role = await db.role.findFirstOrThrow({ where: { organizationId } });
    for (const key of keys) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {},
        create: { roleId: role.id, permissionId: permission.id } });
    }
  }
  const revoke = (key: string) => db.rolePermission.deleteMany({ where: { role: { organizationId: orgA }, permission: { key } } });

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => undefined));
    await app.init();
    registry = app.get(AiToolRegistry);
  });

  beforeEach(async () => {
    [actor, colleague, foreign, outsider] = Array.from({ length: 4 }, () => randomUUID());
    users = [actor, colleague, foreign, outsider];
    await db.user.createMany({ data: users.map((id) => ({ id, email: `${id}@example.test`, passwordHash: 'fixture-hash' })) });
    const orgs = app.get(OrganizationsService);
    orgA = (await orgs.create(actor, { name: 'A', slug: `a-${randomUUID()}` })).id;
    orgB = (await orgs.create(foreign, { name: 'B', slug: `b-${randomUUID()}` })).id;
    await db.organizationMembership.createMany({ data: [colleague, outsider].map((userId) => ({ userId, organizationId: orgA })) });
    await grant(orgA, [PERMISSIONS.AI_USE, PERMISSIONS.DEPARTMENT_READ, PERMISSIONS.EMPLOYEE_READ, PERMISSIONS.TASK_READ]);
    await grant(orgB, [PERMISSIONS.AI_USE, PERMISSIONS.DEPARTMENT_READ, PERMISSIONS.EMPLOYEE_READ, PERMISSIONS.TASK_READ]);
    deptA = (await db.department.create({ data: { organizationId: orgA, code: 'ENG', name: 'Kỹ thuật' } })).id;
    await db.department.create({ data: { organizationId: orgA, code: 'OLD', name: 'Phòng cũ', status: 'INACTIVE' } });
    deptB = (await db.department.create({ data: { organizationId: orgB, code: 'CANARY', name: 'CANARY_DEPT_B' } })).id;
    const employee = (organizationId: string, userId: string, code: string, departmentId: string | null, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') =>
      db.employee.create({ data: { organizationId, userId, employeeCode: code, displayName: code, departmentId, status } });
    empActor = (await employee(orgA, actor, 'ACTOR', deptA)).id;
    empColleague = (await employee(orgA, colleague, 'COLLEAGUE', deptA, 'INACTIVE')).id;
    const empB = (await employee(orgB, foreign, 'CANARY_EMP_B', deptB)).id;
    const task = (organizationId: string, creator: string, title: string, extra: object) =>
      db.task.create({ data: { organizationId, creatorEmployeeId: creator, title, ...extra } });
    await task(orgA, empActor, 'Overdue mine', { assigneeEmployeeId: empActor, departmentId: deptA, dueAt: new Date(now.getTime() - 4 * DAY), priority: 'HIGH' });
    await task(orgA, empActor, 'Overdue colleague', { assigneeEmployeeId: empColleague, dueAt: new Date(now.getTime() - DAY / 2), status: 'IN_PROGRESS' });
    await task(orgA, empActor, 'Overdue but done', { dueAt: new Date(now.getTime() - 2 * DAY), status: 'DONE' });
    await task(orgA, empActor, 'Due in two days', { departmentId: deptA, dueAt: new Date(now.getTime() + 2 * DAY) });
    await task(orgA, empActor, 'No due date', { priority: 'URGENT' });
    await task(orgB, empB, 'CANARY_TASK_B', { assigneeEmployeeId: empB, departmentId: deptB, dueAt: new Date(now.getTime() - 3 * DAY) });
  });

  afterEach(async () => {
    const organizationId = { in: [orgA, orgB] };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: users } }] } });
    await db.task.deleteMany({ where: { organizationId } }); await db.employee.deleteMany({ where: { organizationId } });
    await db.department.deleteMany({ where: { organizationId } }); await db.membershipRole.deleteMany({ where: { organizationId } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId } } }); await db.role.deleteMany({ where: { organizationId } });
    await db.organizationMembership.deleteMany({ where: { organizationId } }); await db.organization.deleteMany({ where: { id: organizationId } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });

  afterAll(async () => { await app?.close(); await db.$disconnect(); });

  it('list_departments counts active employees and open tasks inside the tenant only', async () => {
    const result = await run('list_departments', {});
    expect(result).toMatchObject({ status: 'OK', total: 1, statusFilter: 'ACTIVE' });
    expect(result.items).toEqual([{ id: deptA, code: 'ENG', name: 'Kỹ thuật', status: 'ACTIVE', activeEmployees: 1, openTasks: 2 }]);
    expect((await run('list_departments', { departmentStatus: 'ALL' })).total).toBe(2);
    expect(JSON.stringify(await run('list_departments', { departmentStatus: 'ALL' }))).not.toContain('CANARY');
  });

  it('list_departments hides counts the caller may not see and denies without department:read', async () => {
    await revoke(PERMISSIONS.EMPLOYEE_READ); await revoke(PERMISSIONS.TASK_READ);
    expect((await run('list_departments', {})).items[0]).toMatchObject({ activeEmployees: null, openTasks: null });
    await revoke(PERMISSIONS.DEPARTMENT_READ);
    await expect(run('list_departments', {})).resolves.toEqual({ status: 'DENIED', requiredPermission: 'department:read' });
  });

  it('list_tasks returns only open overdue tasks of the tenant, oldest first, with Vietnam time', async () => {
    const result = await run('list_tasks', { view: 'overdue' });
    expect(result).toMatchObject({ status: 'OK', total: 2, overdueTotal: 2, truncated: false, asOf: '24/10/2026 10:00' });
    expect(result.items.map((t: { title: string }) => t.title)).toEqual(['Overdue mine', 'Overdue colleague']);
    expect(result.items[0]).toMatchObject({ overdue: true, overdueDays: 4, due: '20/10/2026 10:00', assignee: 'ACTOR', department: 'Kỹ thuật', priority: 'HIGH' });
    expect(result.items[1]).toMatchObject({ overdue: true, overdueHours: 12 });
    expect(result.items[1]).not.toHaveProperty('overdueDays');
    expect(JSON.stringify(result)).not.toContain('CANARY');
  });

  it('list_tasks supports mine, due_soon and open views', async () => {
    expect((await run('list_tasks', { view: 'mine' })).items.map((t: { title: string }) => t.title)).toEqual(['Overdue mine']);
    expect((await run('list_tasks', { view: 'due_soon', withinDays: 3 })).items.map((t: { title: string }) => t.title)).toEqual(['Due in two days']);
    const open = await run('list_tasks', { view: 'open', limit: 2 });
    expect(open).toMatchObject({ total: 4, overdueTotal: 2, truncated: true });
    expect(open.items[0]).toMatchObject({ overdue: false });
    expect((await run('list_tasks', { view: 'open', limit: 500 })).items).toHaveLength(4);
    expect(open.items[0].title).toBe('No due date');
    // Finding a task by name: case- and accent-insensitive (column collation).
    expect((await run('list_tasks', { view: 'open', titleContains: 'DUE IN TWO' })).items.map((t: { title: string }) => t.title)).toEqual(['Due in two days']);
  });

  it('list_tasks never crosses tenants, even with another organization\'s ids', async () => {
    const result = await run('list_tasks', { view: 'overdue', departmentId: deptB });
    expect(result).toMatchObject({ status: 'EMPTY', total: 0 });
    const foreignView = await run('list_tasks', { view: 'overdue' }, ctx(foreign, orgB));
    expect(foreignView.items.map((t: { title: string }) => t.title)).toEqual(['CANARY_TASK_B']);
    await expect(run('list_tasks', { view: 'overdue' }, ctx(actor, orgB))).resolves.toMatchObject({ status: 'DENIED' });
  });

  it('list_tasks reports NOT_AN_EMPLOYEE for view=mine without a profile and DENIED without task:read', async () => {
    await grant(orgA, []);
    const role = await db.role.findFirstOrThrow({ where: { organizationId: orgA } });
    const membership = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: orgA, userId: outsider } });
    await db.membershipRole.create({ data: { organizationId: orgA, membershipId: membership.id, roleId: role.id } });
    await expect(run('list_tasks', { view: 'mine' }, ctx(outsider))).resolves.toMatchObject({ status: 'EMPTY', reason: 'NOT_AN_EMPLOYEE' });
    await revoke(PERMISSIONS.TASK_READ);
    await expect(run('list_tasks', { view: 'overdue' })).resolves.toEqual({ status: 'DENIED', requiredPermission: 'task:read' });
  });
});

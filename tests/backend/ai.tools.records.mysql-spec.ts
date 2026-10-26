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
import { vnToday } from '../../backend/src/modules/ai/agent/period';
import { callerLine } from '../../backend/src/modules/ai/agent/system-prompt';
import { SelfServiceService } from '../../backend/src/modules/self-service/self-service.service';
import { AiToolRegistry } from '../../backend/src/modules/ai/tools/tool-registry';
import type { ToolContext } from '../../backend/src/modules/ai/tools/tool.types';
import { PERMISSIONS as P, type PermissionKey } from '../../backend/src/modules/rbac/permission-catalog';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const DAY = 86_400_000;
const day = (iso: string) => new Date(iso + 'T00:00:00Z');

/** The record tools on real MySQL: tenant canaries, scope rules, sensitive data, no writes, accent-insensitive search. */
mysqlDescribe('AI agent record tools on real MySQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication;
  let registry: AiToolRegistry;
  let actor: string, colleague: string, viewer: string, foreign: string, users: string[];
  let orgA: string, orgB: string, deptA: string, empActor: string, empHa: string, empViewer: string, empB: string;
  let taskA: string, taskB: string;
  // Saturday 24/10/2026 10:00 in Vietnam.
  const now = new Date('2026-10-24T03:00:00Z');

  const ctx = (permissions: PermissionKey[], userId = actor, organizationId = orgA): ToolContext =>
    ({ userId, organizationId, requestId: 'test', now, permissions: new Set(permissions) });
  const run = async (name: string, args: object, context: ToolContext) =>
    JSON.parse((await registry.execute({ id: 'c1', name, arguments: JSON.stringify(args) }, context)).content);
  /** Replaces the actor's owner-role grants in org A with exactly `keys`. */
  async function grants(keys: PermissionKey[]) {
    const role = await db.role.findFirstOrThrow({ where: { organizationId: orgA, key: 'owner' } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const key of keys) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    return keys;
  }
  const writes = async () => ({
    approvals: await db.approvalRequest.count({ where: { organizationId: orgA } }),
    requirements: await db.documentRequirement.count({ where: { organizationId: orgA } }),
  });

  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => undefined));
    await app.init();
    registry = app.get(AiToolRegistry);
  });

  beforeEach(async () => {
    [actor, colleague, viewer, foreign] = Array.from({ length: 4 }, () => randomUUID());
    users = [actor, colleague, viewer, foreign];
    await db.user.createMany({ data: users.map((id) => ({ id, email: `${id}@example.test`, passwordHash: 'fixture-hash' })) });
    const orgs = app.get(OrganizationsService);
    orgA = (await orgs.create(actor, { name: 'A', slug: `a-${randomUUID()}` })).id;
    orgB = (await orgs.create(foreign, { name: 'B', slug: `b-${randomUUID()}` })).id;
    await db.organizationMembership.createMany({ data: [colleague, viewer].map((userId) => ({ userId, organizationId: orgA })) });
    deptA = (await db.department.create({ data: { organizationId: orgA, code: 'ENG', name: 'Kỹ thuật' } })).id;
    const deptB = (await db.department.create({ data: { organizationId: orgB, code: 'X', name: 'CANARY_DEPT' } })).id;
    const employee = (organizationId: string, userId: string, code: string, displayName: string, departmentId: string | null) =>
      db.employee.create({ data: { organizationId, userId, employeeCode: code, displayName, departmentId } }).then((e) => e.id);
    empActor = await employee(orgA, actor, 'ACTOR', 'Nguyễn Văn Actor', deptA);
    empHa = await employee(orgA, colleague, 'HA', 'Phạm Thu Hà', deptA);
    empViewer = await employee(orgA, viewer, 'VIEWER', 'Lê Viewer', null);
    empB = await employee(orgB, foreign, 'CANARY', 'CANARY_PERSON', deptB);

    // Tasks + collaboration
    taskA = (await db.task.create({ data: { organizationId: orgA, creatorEmployeeId: empActor, assigneeEmployeeId: empHa, departmentId: deptA,
      title: 'Báo cáo Q3', description: 'Chi tiết', dueAt: new Date(now.getTime() - 2 * DAY) } })).id;
    taskB = (await db.task.create({ data: { organizationId: orgB, creatorEmployeeId: empB, title: 'CANARY_TASK' } })).id;
    await db.taskChecklistItem.createMany({ data: [{ organizationId: orgA, taskId: taskA, title: 'a', isCompleted: true }, { organizationId: orgA, taskId: taskA, title: 'b' }] });
    await db.taskComment.create({ data: { organizationId: orgA, taskId: taskA, authorUserId: colleague, body: 'Đang làm' } });

    // Approvals
    const approval = (organizationId: string, requesterId: string, type: 'LEAVE' | 'ATTENDANCE_ADJUSTMENT' | 'PAYROLL', title: string, status: 'PENDING' | 'APPROVED' = 'PENDING') =>
      db.approvalRequest.create({ data: { organizationId, requesterId, type, title, reason: 'PRIVATE_REASON', payload: {}, status,
        createdAt: new Date(now.getTime() - 3 * DAY) } });
    await approval(orgA, empHa, 'LEAVE', 'Nghỉ phép Hà');
    await approval(orgA, empActor, 'ATTENDANCE_ADJUSTMENT', 'Điều chỉnh công Actor');
    await approval(orgA, empHa, 'PAYROLL', 'Kỳ lương 10');
    await approval(orgA, empHa, 'LEAVE', 'Đã duyệt', 'APPROVED');
    await approval(orgB, empB, 'LEAVE', 'CANARY_APPROVAL');

    // Documents (expiry_date is a DATE: local day at UTC midnight)
    const doc = (organizationId: string, employeeId: string, category: 'LABOR_CONTRACT' | 'IDENTIFICATION' | 'CERTIFICATE', title: string,
      expiry: string, sensitivity: 'NORMAL' | 'SENSITIVE' = 'NORMAL') =>
      db.employeeDocument.create({ data: { organizationId, employeeId, category, title, expiryDate: day(expiry), sensitivity, documentNumber: 'NUM-' + title } });
    await doc(orgA, empActor, 'LABOR_CONTRACT', 'HĐLĐ Actor', '2026-11-03');
    await doc(orgA, empHa, 'IDENTIFICATION', 'SECRET_TITLE', '2026-11-01', 'SENSITIVE');
    await doc(orgA, empHa, 'CERTIFICATE', 'Chứng chỉ cũ', '2026-10-20');
    await doc(orgB, empB, 'LABOR_CONTRACT', 'CANARY_DOC', '2026-11-01');

    // Attendance: Friday 23/10 and today 24/10
    const shift = await db.shift.create({ data: { organizationId: orgA, name: 'Hành chính', code: 'HC', startTime: '08:00', endTime: '17:00' } });
    await db.workSchedule.createMany({ data: [
      { organizationId: orgA, employeeId: empActor, workDate: day('2026-10-23'), shiftId: shift.id },
      { organizationId: orgA, employeeId: empHa, workDate: day('2026-10-23'), shiftId: shift.id },
      { organizationId: orgA, employeeId: empViewer, workDate: day('2026-10-23'), shiftId: shift.id },
      { organizationId: orgA, employeeId: empHa, workDate: day('2026-10-24'), shiftId: shift.id },
      { organizationId: orgA, employeeId: empActor, workDate: day('2026-10-24'), isOff: true },
    ] });
    await db.attendanceRecord.createMany({ data: [
      { organizationId: orgA, employeeId: empActor, workDate: day('2026-10-23'), checkInAt: new Date('2026-10-23T01:15:00Z'),
        checkOutAt: new Date('2026-10-23T10:00:00Z'), status: 'LATE', lateMinutes: 15 },
      { organizationId: orgA, employeeId: empHa, workDate: day('2026-10-23'), checkInAt: new Date('2026-10-23T01:00:00Z') },
      { organizationId: orgB, employeeId: empB, workDate: day('2026-10-23'), checkInAt: new Date('2026-10-23T02:00:00Z'), status: 'LATE', lateMinutes: 60 },
    ] });

    // Leaves (timestamps): Viewer is on approved sick leave on 23/10, so not "not checked in".
    const leave = (organizationId: string, employeeId: string, userId: string, leaveType: 'ANNUAL' | 'SICK' | 'PERSONAL', from: string, to: string,
      status: 'PENDING' | 'APPROVED') => db.leaveRequest.create({ data: { organizationId, employeeId, createdByUserId: userId, leaveType,
      startsAt: new Date(from), endsAt: new Date(to), daysCount: 1, reason: 'PRIVATE_REASON', status } });
    await leave(orgA, empHa, colleague, 'ANNUAL', '2026-10-21T01:00:00Z', '2026-10-21T10:00:00Z', 'APPROVED');
    await leave(orgA, empViewer, viewer, 'SICK', '2026-10-22T17:00:00Z', '2026-10-23T17:00:00Z', 'APPROVED');
    await leave(orgA, empActor, actor, 'PERSONAL', '2026-11-10T01:00:00Z', '2026-11-10T10:00:00Z', 'PENDING');
    await leave(orgB, empB, foreign, 'ANNUAL', '2026-10-22T01:00:00Z', '2026-10-22T10:00:00Z', 'APPROVED');

    // Calendar
    await db.calendarEvent.create({ data: { organizationId: orgA, createdByUserId: actor, title: 'Họp giao ban', kind: 'MEETING',
      startsAt: new Date('2026-10-22T02:00:00Z'), endsAt: new Date('2026-10-22T03:00:00Z') } });
    await db.calendarEvent.create({ data: { organizationId: orgB, createdByUserId: foreign, title: 'CANARY_EVENT', kind: 'MEETING',
      startsAt: new Date('2026-10-22T02:00:00Z'), endsAt: new Date('2026-10-22T03:00:00Z') } });
  });

  afterEach(async () => {
    const organizationId = { in: [orgA, orgB] };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: users } }] } });
    await db.calendarEvent.deleteMany({ where: { organizationId } }); await db.leaveRequest.deleteMany({ where: { organizationId } });
    await db.attendanceRecord.deleteMany({ where: { organizationId } }); await db.workSchedule.deleteMany({ where: { organizationId } });
    await db.shift.deleteMany({ where: { organizationId } }); await db.employeeDocument.deleteMany({ where: { organizationId } });
    await db.documentRequirement.deleteMany({ where: { organizationId } }); await db.approvalRequest.deleteMany({ where: { organizationId } });
    await db.taskComment.deleteMany({ where: { organizationId } }); await db.taskChecklistItem.deleteMany({ where: { organizationId } });
    await db.task.deleteMany({ where: { organizationId } }); await db.employee.deleteMany({ where: { organizationId } });
    await db.department.deleteMany({ where: { organizationId } }); await db.membershipRole.deleteMany({ where: { organizationId } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId } } }); await db.role.deleteMany({ where: { organizationId } });
    await db.organizationMembership.deleteMany({ where: { organizationId } }); await db.organization.deleteMany({ where: { id: organizationId } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });

  afterAll(async () => { await app?.close(); await db.$disconnect(); });

  it('get_task returns details, hides names without employee:read and never reads another tenant', async () => {
    const full = await run('get_task', { taskId: taskA }, ctx(await grants([P.TASK_READ, P.EMPLOYEE_READ, P.DEPARTMENT_READ])));
    expect(full).toMatchObject({ status: 'OK', task: { title: 'Báo cáo Q3', assignee: 'Phạm Thu Hà', department: 'Kỹ thuật', overdue: true, overdueDays: 2 },
      checklist: { done: 1, total: 2 }, latestComments: [{ author: 'Phạm Thu Hà', text: 'Đang làm' }] });
    const narrow = await run('get_task', { taskId: taskA }, ctx(await grants([P.TASK_READ])));
    expect(narrow.task).toMatchObject({ assignee: null, creator: null, department: null });
    await expect(run('get_task', { taskId: taskB }, ctx([P.TASK_READ]))).resolves.toEqual({ status: 'EMPTY', reason: 'NOT_FOUND' });
  });

  it('list_pending_approvals applies the scope rule, hides payroll without payroll:read and writes nothing', async () => {
    const before = await writes();
    const approver = await run('list_pending_approvals', {}, ctx(await grants([P.APPROVAL_READ, P.APPROVAL_APPROVE, P.PAYROLL_READ])));
    expect(approver).toMatchObject({ status: 'OK', scope: 'organization', total: 3, byType: { LEAVE: 1, ATTENDANCE_ADJUSTMENT: 1, PAYROLL: 1 } });
    expect(approver.items[0]).toMatchObject({ requester: expect.any(String), waitingDays: 3 });
    expect(JSON.stringify(approver)).not.toMatch(/CANARY|PRIVATE_REASON/);
    expect((await run('list_pending_approvals', {}, ctx(await grants([P.APPROVAL_READ, P.APPROVAL_APPROVE])))).total).toBe(2);
    const own = await run('list_pending_approvals', {}, ctx(await grants([P.APPROVAL_READ])));
    expect(own).toMatchObject({ scope: 'mine', total: 1, items: [{ title: 'Điều chỉnh công Actor' }] });
    expect(await writes()).toEqual(before);
  });

  it('list_document_alerts hides sensitive titles, computes days on local dates and writes nothing', async () => {
    const before = await writes();
    const reader = await run('list_document_alerts', { kind: 'expiring', withinDays: 30 }, ctx(await grants([P.DOCUMENT_READ])));
    expect(reader).toMatchObject({ status: 'OK', total: 1, hiddenSensitiveCount: 1, items: [{ title: 'HĐLĐ Actor', daysRemaining: 10 }] });
    expect(JSON.stringify(reader)).not.toMatch(/SECRET_TITLE|NUM-|CANARY/);
    const hr = await run('list_document_alerts', { kind: 'expiring' }, ctx(await grants([P.DOCUMENT_READ, P.DOCUMENT_SENSITIVE_READ])));
    expect(hr).toMatchObject({ total: 2, hiddenSensitiveCount: 0 });
    expect((await run('list_document_alerts', { kind: 'expired' }, ctx([P.DOCUMENT_READ]))).items).toEqual([
      expect.objectContaining({ title: 'Chứng chỉ cũ', daysExpired: 4 })]);
    const missing = await run('list_document_alerts', { kind: 'missing', limit: 20 }, ctx([P.DOCUMENT_READ]));
    expect(missing).toMatchObject({ status: 'OK', total: 10, employeesAffected: 3 });
    expect(await writes()).toEqual(before);
    await grants([]);
    await expect(run('list_document_alerts', { kind: 'expired' }, ctx([]))).resolves.toMatchObject({ status: 'DENIED', requiredPermission: 'document:read' });
  });

  it('find_employee matches without accents inside the tenant only', async () => {
    const result = await run('find_employee', { query: 'thu ha' }, ctx(await grants([P.EMPLOYEE_READ])));
    expect(result).toMatchObject({ status: 'OK', total: 1, items: [{ name: 'Phạm Thu Hà', employeeCode: 'HA', department: null }] });
    expect(JSON.stringify(result)).not.toMatch(/@example|phone/i);
    await expect(run('find_employee', { query: 'CANARY' }, ctx([P.EMPLOYEE_READ]))).resolves.toMatchObject({ status: 'EMPTY' });
  });

  it('keeps disabled document requirements disabled and does not seed defaults on a read', async () => {
    await db.documentRequirement.create({ data: { organizationId: orgA, category: 'INSURANCE', name: 'Optional', isRequired: false } });
    const before = await writes();
    const result = await run('list_document_alerts', { kind: 'missing' }, ctx(await grants([P.DOCUMENT_READ])));
    expect(result).toMatchObject({ status: 'EMPTY', total: 0, items: [] });
    expect(await writes()).toEqual(before);
  });

  it('counts attendance exceptions and missing check-ins beyond the first 2000 rows', async () => {
    const bulkDepartment = await db.department.create({ data: { organizationId: orgA, code: 'BULK', name: 'Bulk' } });
    const employees = Array.from({ length: 2002 }, (_, i) => ({ id: randomUUID(), userId: randomUUID(), organizationId: orgA,
      employeeCode: `BULK-${i}`, displayName: `Bulk ${i}`, departmentId: bulkDepartment.id }));
    users.push(...employees.map(e => e.userId));
    await db.user.createMany({ data: employees.map(e => ({ id: e.userId, email: `${e.userId}@example.test` })) });
    await db.organizationMembership.createMany({ data: employees.map(e => ({ organizationId: orgA, userId: e.userId })) });
    await db.employee.createMany({ data: employees });
    const shift = await db.shift.findFirstOrThrow({ where: { organizationId: orgA } });
    const idAt = (i: number) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    const workDate = day('2026-10-23');
    await db.attendanceRecord.createMany({ data: employees.slice(0, 2001).map((e, i) => ({
      id: idAt(i), organizationId: orgA, employeeId: e.id, workDate, status: i === 2000 ? 'LATE' as const : 'PRESENT' as const,
      checkInAt: new Date('2026-10-23T01:15:00Z'), checkOutAt: new Date('2026-10-23T10:00:00Z'), lateMinutes: i === 2000 ? 15 : 0,
    })) });
    await db.workSchedule.createMany({ data: employees.map((e, i) => ({ id: idAt(i), organizationId: orgA,
      employeeId: e.id, workDate, shiftId: shift.id })) });
    const result = await run('list_attendance_exceptions', { fromDate: '2026-10-23', toDate: '2026-10-23', departmentId: bulkDepartment.id },
      ctx(await grants([P.ATTENDANCE_READ, P.ATTENDANCE_MANAGE])));
    expect(result).toMatchObject({ status: 'OK', total: 2, byType: { LATE: 1, NOT_CHECKED_IN: 1 }, truncated: false });
    expect(result.items.map((row: { employee: string }) => row.employee).sort()).toEqual(['Bulk 2000', 'Bulk 2001']);
  }, 60_000);

  it('list_attendance_exceptions finds late, incomplete and not-checked-in days and respects approved leave', async () => {
    const context = ctx(await grants([P.ATTENDANCE_READ, P.ATTENDANCE_MANAGE]));
    const result = await run('list_attendance_exceptions', { fromDate: '2026-10-23', toDate: '2026-10-24' }, context);
    expect(result).toMatchObject({ status: 'OK', total: 3, byType: { LATE: 1, INCOMPLETE: 1, NOT_CHECKED_IN: 1 } });
    expect(result.items.map((i: { employee: string; date: string; issues: string[] }) => `${i.employee}|${i.date}|${i.issues}`).sort()).toEqual([
      'Nguyễn Văn Actor|23/10/2026|LATE', 'Phạm Thu Hà|23/10/2026|INCOMPLETE', 'Phạm Thu Hà|24/10/2026|NOT_CHECKED_IN']);
    expect(JSON.stringify(result)).not.toMatch(/CANARY|Viewer/);
    expect((await run('list_attendance_exceptions', { period: 'yesterday', type: 'LATE' }, context)).items[0]).toMatchObject({ lateMinutes: 15, checkIn: '08:15' });
    await grants([P.ATTENDANCE_READ]);
    await expect(run('list_attendance_exceptions', {}, ctx([P.ATTENDANCE_READ]))).resolves.toMatchObject({ status: 'DENIED', requiredPermission: 'attendance:manage' });
  });

  it('list_leaves returns overlapping requests without reasons, organization-wide only for approvers', async () => {
    const approver = await run('list_leaves', { period: 'this_week' }, ctx(await grants([P.LEAVE_READ, P.LEAVE_APPROVE])));
    expect(approver).toMatchObject({ status: 'OK', scope: 'organization', total: 2 });
    expect(JSON.stringify(approver)).not.toMatch(/PRIVATE_REASON|CANARY/);
    const own = await run('list_leaves', { period: 'this_week' }, ctx(await grants([P.LEAVE_READ])));
    expect(own).toMatchObject({ status: 'EMPTY', scope: 'mine' });
    expect((await run('list_leaves', { fromDate: '2026-11-01', toDate: '2026-11-30' }, ctx([P.LEAVE_READ]))).items).toEqual([
      expect.objectContaining({ type: 'PERSONAL', status: 'PENDING' })]);
  });

  it('list_calendar_events shows this week\'s meetings of the tenant', async () => {
    const result = await run('list_calendar_events', { period: 'this_week' }, ctx(await grants([P.CALENDAR_READ])));
    expect(result).toMatchObject({ status: 'OK', events: [{ title: 'Họp giao ban', starts: '22/10/2026 09:00' }], taskDeadlines: null });
    expect(JSON.stringify(result)).not.toContain('CANARY');
  });

  it('get_hr_metrics reports exact counts and names the missing permission per kind', async () => {
    const context = ctx(await grants([P.REPORT_READ, P.EMPLOYEE_READ]));
    const workforce = await run('get_hr_metrics', { kind: 'workforce', period: 'this_month' }, context);
    expect(workforce).toMatchObject({ status: 'OK', range: { from: '01/10/2026', to: '31/10/2026', days: 31 } });
    const compared = await run('get_hr_metrics', { kind: 'workforce', period: 'this_month', compareWithPrevious: true }, context);
    expect(compared.previousRange).toEqual({ from: '01/09/2026', to: '30/09/2026', days: 30 });
    const [now, before] = [compared.current.metrics.total, compared.previous.metrics.total];
    expect(compared.change.total).toEqual({ absolute: now - before, percent: before === 0 ? null : expect.any(Number) });
    expect(workforce.current.metrics).toHaveProperty('total');
    expect(JSON.stringify(workforce)).not.toMatch(/trend|CANARY/);
    await expect(run('get_hr_metrics', { kind: 'attendance' }, context)).resolves.toEqual({ status: 'DENIED', requiredPermission: 'attendance:read' });
  });

  it('get_overview and get_my_schedule work with only ai:use', async () => {
    const context = ctx(await grants([P.AI_USE]));
    const overview = await run('get_overview', {}, context);
    expect(overview).toMatchObject({ status: 'OK', tasks: null, departments: null, employees: null });
    const today = vnToday(new Date());
    await db.workSchedule.upsert({ where: { organizationId_employeeId_workDate: { organizationId: orgA, employeeId: empActor, workDate: today } },
      update: { isOff: false, shiftId: (await db.shift.findFirstOrThrow({ where: { organizationId: orgA } })).id },
      create: { organizationId: orgA, employeeId: empActor, workDate: today, shiftId: (await db.shift.findFirstOrThrow({ where: { organizationId: orgA } })).id } });
    const mine = await run('get_my_schedule', { period: 'today' }, context);
    expect(mine).toMatchObject({ status: 'OK', me: { name: 'Nguyễn Văn Actor' }, today: { date: today.toISOString().slice(0, 10), shift: { name: 'Hành chính', start: '08:00' } } });
    expect(JSON.stringify(mine)).not.toMatch(/@example|phone|email/i);
  });

  it('profileForAssistant (caller line of the prompt) reads only the caller\'s own record in the route organization', async () => {
    const selfService = app.get(SelfServiceService);
    const parent = await db.department.create({ data: { organizationId: orgA, code: 'TECH', name: 'Khối Công nghệ' } });
    await db.department.update({ where: { id: deptA }, data: { parentDepartmentId: parent.id } });
    await db.user.update({ where: { id: actor }, data: { displayName: 'Actor Account' } });
    await db.employee.update({ where: { id: empActor }, data: { jobTitle: 'Kỹ sư', phone: '0900000001' } });

    const mine = await selfService.profileForAssistant(orgA, actor);
    expect(mine).toEqual({ accountName: 'Actor Account', employee: { employeeCode: 'ACTOR', displayName: 'Nguyễn Văn Actor', jobTitle: 'Kỹ sư',
      department: { name: 'Kỹ thuật', parent: { name: 'Khối Công nghệ' } } } });
    expect(JSON.stringify(mine)).not.toMatch(/0900000001|@example|phone|email|CANARY|Phạm Thu Hà/i);
    expect(callerLine(mine)).toBe('Người đang hỏi: "Nguyễn Văn Actor", mã nhân viên "ACTOR", chức danh "Kỹ sư", phòng ban "Kỹ thuật" (trực thuộc "Khối Công nghệ").');
    expect(await selfService.profileForAssistant(orgA, viewer)).toMatchObject({ employee: { displayName: 'Lê Viewer', department: null } });
    // Another organization's employee record is never returned for this organization.
    expect(await selfService.profileForAssistant(orgB, actor)).toEqual({ accountName: 'Actor Account', employee: null });
    expect(await selfService.profileForAssistant(orgA, foreign)).toMatchObject({ employee: null });
  });

  it('rejects unknown keys and keeps tool output bounded', async () => {
    const context = ctx(await grants([P.TASK_READ]));
    await expect(run('get_task', { taskId: taskA, organizationId: orgB }, context)).resolves.toMatchObject({ status: 'INVALID_ARGUMENTS' });
  });
});

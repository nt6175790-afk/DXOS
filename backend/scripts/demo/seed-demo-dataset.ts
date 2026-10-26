// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../src/database/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';
import { AuthorizationService } from '../../src/modules/rbac/authorization.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AUDIT_EVENTS } from '../../src/modules/audit/audit-catalog';
import { NOTIFICATION_TYPES, notificationContent } from '../../src/modules/notifications/notification-catalog';
import { validateFileMetadata, validateFileSignature } from '../../src/modules/files/file-policy';
import { LocalStorageService } from '../../src/modules/files/local-storage.service';
import type { StorageService } from '../../src/modules/files/storage.service';
import { DEMO_ADMIN_EMAIL, DEMO_ORGANIZATION_SLUG, DEMO_DEPARTMENTS, DEMO_PEOPLE, DEMO_TASKS, DEMO_DOCUMENTS, DEMO_AI_REQUEST, demoId, demoPdf } from './demo-fixtures';

export class DemoSeedError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'DemoSeedError'; }
}

export function localDemoDatabase(source: NodeJS.ProcessEnv) {
  if (!['development', 'test'].includes(source.NODE_ENV ?? 'development')) throw new DemoSeedError('LOCAL_DEMO_ONLY');
  let url: URL;
  try { url = new URL(source.DATABASE_URL ?? ''); } catch { throw new DemoSeedError('LOCAL_MYSQL_REQUIRED'); }
  const testDatabase = source.NODE_ENV === 'test' && /^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(url.pathname);
  if (url.protocol !== 'mysql:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    (url.pathname !== '/dx_os' && !testDatabase)) throw new DemoSeedError('LOCAL_DEMO_DATABASE_REQUIRED');
  return url.toString();
}

export function demoConfiguration(source: NodeJS.ProcessEnv) {
  const databaseUrl = localDemoDatabase(source);
  const password = source.DEMO_ADMIN_PASSWORD;
  if (!password || password.length < 16 || password.length > 1024) throw new DemoSeedError('DEMO_ADMIN_PASSWORD_REQUIRED_16_TO_1024_CHARS');
  if (source.DEMO_ADMIN_EMAIL && source.DEMO_ADMIN_EMAIL.trim().toLowerCase() !== DEMO_ADMIN_EMAIL) {
    throw new DemoSeedError('EXPECTED_EXISTING_DEMO_ADMIN');
  }
  return { databaseUrl, password };
}

// Explicit local provisioning only. It never creates/grants roles or changes the permission catalog.
// Existing records and operator edits are retained; identity/scope conflicts fail closed.
export async function seedDemoDataset(source: NodeJS.ProcessEnv, storageOverride?: StorageService) {
  const { databaseUrl, password } = demoConfiguration(source);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const storage = storageOverride ?? new LocalStorageService(new ConfigService(source));
  const auth = new AuthorizationService(db as PrismaService);
  const audit = new AuditService(db as PrismaService);
  const passwords = new PasswordService();
  const requireState = (condition: unknown, code: string): void => { if (!condition) throw new DemoSeedError(code); };
  const created = { users: 0, memberships: 0, departments: 0, employees: 0, tasks: 0, notifications: 0, documents: 0, aiRequests: 0, shifts: 0, schedules: 0 };
  try {
    const actor = await db.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } });
    requireState(actor?.passwordHash && await passwords.verify(password, actor.passwordHash), 'RUN_SEED_DEMO_ADMIN_FIRST_OR_CHECK_PASSWORD');
    const passwordHash = await passwords.hash(password);
    const now = new Date();
    const dataset = await db.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({ where: { slug: DEMO_ORGANIZATION_SLUG } });
      requireState(organization?.status === 'ACTIVE' && actor?.accountStatus === 'ACTIVE', 'ACTIVE_DEMO_ORGANIZATION_AND_ADMIN_REQUIRED');
      const org = organization!.id;
      const admin = actor!.id;
      const role = await tx.role.findUnique({ where: { organizationId_key: { organizationId: org, key: 'admin' } } });
      requireState(role?.isActive && await tx.membershipRole.findFirst({ where: {
        roleId: role.id, organizationId: org, membership: { userId: admin, status: 'ACTIVE' },
      } }), 'EXISTING_ACTIVE_ADMIN_ROLE_REQUIRED');
      for (const permission of ['department:create', 'employee:create', 'task:create', 'task:assign', 'file:upload', 'shift:create', 'schedule:create'] as const) {
        requireState(await auth.can(admin, permission, org, tx), 'EXISTING_ADMIN_PERMISSIONS_REQUIRED');
      }

      const departments = new Map<string, string>();
      for (const item of DEMO_DEPARTMENTS) {
        let row = await tx.department.findUnique({ where: { organizationId_code: { organizationId: org, code: item.code } } });
        if (!row) {
          row = await tx.department.create({ data: { id: demoId(org, 'department', item.code), organizationId: org,
            ...item, description: `DXOS-DEMO-002: ${item.name}. Dữ liệu minh họa.`, status: 'ACTIVE' } });
          await audit.record({ event: AUDIT_EVENTS.DEPARTMENT_CREATED, organizationId: org, actorUserId: admin, resourceId: row.id }, tx);
          created.departments++;
        }
        requireState(row.status === 'ACTIVE', 'DEMO_DEPARTMENT_INACTIVE_PRESERVED');
        departments.set(item.code, row.id);
      }

      const people = new Map<string, { userId: string; employeeId: string; departmentId: string | null }>();
      for (const item of DEMO_PEOPLE) {
        let user = item.key === 'admin' ? actor! : await tx.user.findUnique({ where: { email: item.email } });
        if (!user) {
          user = await tx.user.create({ data: { id: demoId(org, 'user', item.key), email: item.email,
            displayName: item.name, passwordHash, accountStatus: 'ACTIVE' } });
          created.users++;
        }
        requireState(item.key === 'admin' || user.id === demoId(org, 'user', item.key), 'EXISTING_EMAIL_COLLISION_PRESERVED');
        requireState(user.accountStatus === 'ACTIVE', 'DEMO_USER_INACTIVE_PRESERVED');
        let membership = await tx.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: org, userId: user.id } } });
        if (!membership) {
          membership = await tx.organizationMembership.create({ data: {
            id: demoId(org, 'membership', item.key), organizationId: org, userId: user.id, status: 'ACTIVE',
          } });
          await audit.record({ event: AUDIT_EVENTS.MEMBERSHIP_CREATED, organizationId: org, actorUserId: admin, resourceId: membership.id }, tx);
          created.memberships++;
        }
        requireState(membership.status === 'ACTIVE', 'DEMO_MEMBERSHIP_INACTIVE_PRESERVED');
        let employee = await tx.employee.findUnique({ where: { organizationId_userId: { organizationId: org, userId: user.id } } });
        if (!employee) {
          employee = await tx.employee.create({ data: { id: demoId(org, 'employee', item.key), organizationId: org,
            userId: user.id, employeeCode: item.code, displayName: item.name, jobTitle: item.jobTitle,
            departmentId: departments.get(item.department)!, status: 'ACTIVE' } });
          await audit.record({ event: AUDIT_EVENTS.EMPLOYEE_CREATED, organizationId: org, actorUserId: admin, resourceId: employee.id }, tx);
          created.employees++;
        }
        requireState(employee.status === 'ACTIVE', 'DEMO_EMPLOYEE_INACTIVE_PRESERVED');
        people.set(item.key, { userId: user.id, employeeId: employee.id, departmentId: employee.departmentId });
      }

      // Rolling seven-day demo schedule in Vietnam time. Preserve every operator edit.
      // No office location or employee attendance/GPS is fabricated by this seed.
      const shiftCode = 'DEMO-DAY';
      let shift = await tx.shift.findUnique({ where: { organizationId_code: { organizationId: org, code: shiftCode } } });
      if (!shift) {
        shift = await tx.shift.create({ data: { id: demoId(org, 'shift', shiftCode), organizationId: org,
          code: shiftCode, name: 'Ca hành chính demo', startTime: '09:00', endTime: '18:00',
          breakStart: '12:00', breakEnd: '13:00', gracePeriodMinutes: 5 } });
        await audit.record({ event: AUDIT_EVENTS.SHIFT_CREATED, organizationId: org, actorUserId: admin, resourceId: shift.id }, tx);
        created.shifts++;
      }
      requireState(shift.isActive, 'DEMO_SHIFT_INACTIVE_PRESERVED');
      const vietnamDate = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      for (let offset = 0; offset < 7; offset++) {
        const workDate = new Date(vietnamDate + 'T00:00:00.000Z');
        workDate.setUTCDate(workDate.getUTCDate() + offset);
        const isOff = [0, 6].includes(workDate.getUTCDay());
        for (const person of people.values()) {
          const existing = await tx.workSchedule.findUnique({ where: { organizationId_employeeId_workDate: {
            organizationId: org, employeeId: person.employeeId, workDate } } });
          if (existing) continue;
          const schedule = await tx.workSchedule.create({ data: {
            id: demoId(org, 'schedule', person.employeeId + ':' + workDate.toISOString().slice(0, 10)),
            organizationId: org, employeeId: person.employeeId, workDate,
            isOff, shiftId: isOff ? null : shift.id, notes: 'Lịch demo; quản lý có thể điều chỉnh.' } });
          await audit.record({ event: AUDIT_EVENTS.SCHEDULE_CREATED, organizationId: org, actorUserId: admin, resourceId: schedule.id }, tx);
          created.schedules++;
        }
      }

      for (const item of DEMO_TASKS) {
        const id = demoId(org, 'task', item.code);
        const assignee = people.get(item.assignee)!;
        let task = await tx.task.findUnique({ where: { id } });
        if (!task) {
          task = await tx.task.create({ data: { id, organizationId: org,
            creatorEmployeeId: people.get('admin')!.employeeId, assigneeEmployeeId: assignee.employeeId,
            departmentId: assignee.departmentId, title: item.title,
            description: `${item.code} — Dữ liệu demo DX-OS. Mở chi tiết, lọc trạng thái và kiểm tra phân công theo tổ chức.`,
            priority: item.priority, status: item.status, progressPercent: item.status === 'DONE' ? 100 : 0,
            dueAt: new Date(now.getTime() + item.dueDays * 86400000) } });
          await audit.record({ event: AUDIT_EVENTS.TASK_CREATED, organizationId: org, actorUserId: admin, resourceId: id }, tx);
          await audit.record({ event: AUDIT_EVENTS.TASK_ASSIGNED, organizationId: org, actorUserId: admin, resourceId: id }, tx);
          created.tasks++;
        }
        requireState(task.organizationId === org, 'TASK_IDENTIFIER_COLLISION_PRESERVED');
        const notificationId = demoId(org, 'notification', item.code);
        const notification = await tx.notification.findUnique({ where: { id: notificationId } });
        if (notification) {
          requireState(notification.organizationId === org && notification.recipientUserId === assignee.userId, 'NOTIFICATION_IDENTIFIER_COLLISION_PRESERVED');
        } else if (task.assigneeEmployeeId === assignee.employeeId) {
          // Existing catalog renders safe text. No invented order/stock notification type.
          const content = notificationContent({ organizationId: org, recipientUserId: assignee.userId,
            type: NOTIFICATION_TYPES.TASK_ASSIGNED, metadata: { taskId: id } });
          await tx.notification.create({ data: { id: notificationId, organizationId: org,
            recipientUserId: assignee.userId, type: NOTIFICATION_TYPES.TASK_ASSIGNED, ...content,
            createdAt: now, readAt: item.read ? now : null } });
          await audit.record({ event: AUDIT_EVENTS.NOTIFICATION_CREATED, organizationId: org, resourceId: notificationId }, tx);
          created.notifications++;
        }
      }

      for (const item of DEMO_DOCUMENTS) {
        validateFileMetadata(item.filename, 'application/pdf');
        const id = demoId(org, 'document', item.code);
        const existing = await tx.fileObject.findUnique({ where: { id } });
        if (existing) requireState(existing.organizationId === org && existing.uploadedByUserId === admin &&
          existing.storageKey === demoId(org, 'storage', item.code) && existing.storageProvider === storage.provider &&
          ['UPLOADING', 'AVAILABLE'].includes(existing.status), 'EXISTING_DOCUMENT_CONFLICT_PRESERVED');
        else {
          await tx.fileObject.create({ data: { id, organizationId: org, uploadedByUserId: admin,
            originalFilename: item.filename, contentType: 'application/pdf', storageProvider: storage.provider,
            storageKey: demoId(org, 'storage', item.code), status: 'UPLOADING' } });
          created.documents++;
        }
      }

      const aiRequestId = demoId(org, 'ai-request', DEMO_AI_REQUEST.key);
      const aiRequest = await tx.aiRequest.findUnique({ where: { id: aiRequestId } });
      if (aiRequest) {
        requireState(aiRequest.organizationId === org && aiRequest.userId === admin &&
          aiRequest.provider === DEMO_AI_REQUEST.provider && aiRequest.model === DEMO_AI_REQUEST.model &&
          aiRequest.requestId === DEMO_AI_REQUEST.requestId, 'EXISTING_AI_REQUEST_CONFLICT_PRESERVED');
      } else {
        await tx.aiRequest.create({ data: { id: aiRequestId, organizationId: org, userId: admin,
          provider: DEMO_AI_REQUEST.provider, model: DEMO_AI_REQUEST.model, status: 'SUCCEEDED',
          requestId: DEMO_AI_REQUEST.requestId, inputTokens: DEMO_AI_REQUEST.inputTokens,
          outputTokens: DEMO_AI_REQUEST.outputTokens, latencyMs: DEMO_AI_REQUEST.latencyMs,
          completedAt: now } });
        created.aiRequests++;
      }
      return { organization: { id: org, name: organization!.name, slug: organization!.slug }, admin };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

    // Metadata is AVAILABLE only after real bytes exist and match. UPLOADING is resumable after a crash.
    for (const item of DEMO_DOCUMENTS) {
      const id = demoId(dataset.organization.id, 'document', item.code);
      const row = await db.fileObject.findUniqueOrThrow({ where: { id } });
      const bytes = demoPdf(item.title, item.lines);
      validateFileSignature(bytes.subarray(0, 8), 'application/pdf');
      const checksum = createHash('sha256').update(bytes).digest('hex');
      if (!(await storage.exists(row.storageKey))) {
        requireState(row.status === 'UPLOADING', 'AVAILABLE_DOCUMENT_BYTES_MISSING');
        await storage.put(row.storageKey, Readable.from(bytes));
      }
      const stored = await storage.get(row.storageKey);
      const hash = createHash('sha256'); let size = 0;
      for await (const chunk of stored) { size += Buffer.byteLength(chunk); hash.update(chunk); }
      requireState(size === bytes.length && hash.digest('hex') === checksum, 'EXISTING_DOCUMENT_BYTES_CONFLICT_PRESERVED');
      if (row.status === 'AVAILABLE') requireState(row.size === size && row.checksum === checksum, 'EXISTING_DOCUMENT_METADATA_CONFLICT_PRESERVED');
      else await db.$transaction(async (tx) => {
        requireState(await auth.can(dataset.admin, 'file:upload', dataset.organization.id, tx), 'EXISTING_ADMIN_PERMISSIONS_REQUIRED');
        const result = await tx.fileObject.updateMany({ where: { id, organizationId: dataset.organization.id, status: 'UPLOADING' },
          data: { status: 'AVAILABLE', size, checksum } });
        if (result.count) await audit.record({ event: AUDIT_EVENTS.FILE_UPLOADED, organizationId: dataset.organization.id,
          actorUserId: dataset.admin, resourceId: id }, tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
    return { status: 'ok', organization: dataset.organization, created,
      dataset: { departments: DEMO_DEPARTMENTS.length, employees: DEMO_PEOPLE.length, tasks: DEMO_TASKS.length,
        notifications: await db.notification.count({ where: { id: { in: DEMO_TASKS.map(t => demoId(dataset.organization.id, 'notification', t.code)) } } }),
        documents: DEMO_DOCUMENTS.length, aiRequests: await db.aiRequest.count({ where: { id: demoId(dataset.organization.id, 'ai-request', DEMO_AI_REQUEST.key) } }) },
      users: DEMO_PEOPLE.map(({ email, name }) => ({ email, name })), passwordSource: 'DEMO_ADMIN_PASSWORD',
      additionalMemberRoles: 'none; assign existing roles through the authorized role administration API' };
  } finally { await db.$disconnect(); }
}

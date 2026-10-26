import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { PrismaClient } from '@prisma/client';
import { PasswordService } from '../../backend/src/modules/auth/password.service';
import { PERMISSION_CATALOG } from '../../backend/src/modules/rbac/permission-catalog';
import { StorageService } from '../../backend/src/modules/files/storage.service';
import { seedDemoDataset } from '../../backend/scripts/demo/seed-demo-dataset';
import { DEMO_ROLES, seedDemoRoles } from '../../backend/scripts/demo/seed-demo-roles';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import type { PrismaService } from '../../backend/src/database/prisma.service';
import { DEMO_ADMIN_EMAIL, DEMO_PEOPLE, demoId } from '../../backend/scripts/demo/demo-fixtures';

class TestStorage extends StorageService {
  readonly provider = 'LOCAL';
  readonly bytes = new Map<string, Buffer>();
  failNextPut = false;
  async put(key: string, stream: Readable) {
    if (this.failNextPut) { this.failNextPut = false; throw new Error('Simulated interrupted upload'); }
    if (this.bytes.has(key)) throw new Error('Exclusive create required');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks); this.bytes.set(key, bytes);
    return { size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex'), prefix: bytes.subarray(0, 8) };
  }
  async get(key: string) { const bytes = this.bytes.get(key); if (!bytes) throw new Error('Missing object'); return Readable.from(bytes); }
  async exists(key: string) { return this.bytes.has(key); }
  async delete(key: string) { this.bytes.delete(key); }
}

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
mysqlDescribe('demo dataset with real MySQL constraints', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://localhost/unused' } } });
  let org: string, admin: string, role: string, foreignOrg: string;
  let source: NodeJS.ProcessEnv;
  let storage: TestStorage;
  const run = () => seedDemoDataset(source, storage);
  beforeAll(() => { if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required'); });
  beforeEach(async () => {
    source = { NODE_ENV: 'test', DATABASE_URL: url, DEMO_ADMIN_PASSWORD: randomBytes(24).toString('base64url') };
    storage = new TestStorage();
    admin = (await db.user.create({ data: { email: DEMO_ADMIN_EMAIL, displayName: 'DX-OS Demo Admin',
      passwordHash: await new PasswordService().hash(source.DEMO_ADMIN_PASSWORD!) } })).id;
    org = (await db.organization.create({ data: { slug: 'dxos-demo', name: 'DX-OS Demo Organization' } })).id;
    foreignOrg = (await db.organization.create({ data: { slug: `untouched-${randomUUID()}`, name: 'Unrelated organization' } })).id;
    role = (await db.role.create({ data: { organizationId: org, key: 'admin', name: 'Administrator' } })).id;
    const member = await db.organizationMembership.create({ data: { organizationId: org, userId: admin } });
    await db.membershipRole.create({ data: { organizationId: org, membershipId: member.id, roleId: role } });
    for (const key of PERMISSION_CATALOG) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role, permissionId: permission.id } });
    }
  });
  afterEach(async () => {
    const userIds = (await db.user.findMany({ where: { email: { in: DEMO_PEOPLE.map(p => p.email) } }, select: { id: true } })).map(x => x.id);
    const scope = { organizationId: { in: [org, foreignOrg] } };
    await db.auditEvent.deleteMany({ where: scope }); await db.notification.deleteMany({ where: scope });
    await db.aiRequest.deleteMany({ where: scope });
    await db.fileObject.deleteMany({ where: scope }); await db.task.deleteMany({ where: scope });
    await db.workSchedule.deleteMany({ where: scope }); await db.shift.deleteMany({ where: scope });
    await db.employee.deleteMany({ where: scope }); await db.department.deleteMany({ where: scope });
    await db.membershipRole.deleteMany({ where: scope });
    await db.rolePermission.deleteMany({ where: { role: scope } }); await db.role.deleteMany({ where: scope });
    await db.organizationMembership.deleteMany({ where: scope });
    await db.organization.deleteMany({ where: { id: { in: [org, foreignOrg] } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });
  afterAll(async () => db.$disconnect());

  it('seeds twice without duplicates or changes to existing records, roles, catalog or audit history', async () => {
    const foreignBefore = await db.organization.findUnique({ where: { id: foreignOrg } });
    const grantsBefore = await db.rolePermission.findMany({ where: { roleId: role }, orderBy: { id: 'asc' } });
    const permissionsBefore = await db.permission.findMany({ orderBy: { id: 'asc' } });
    const first = await run();
    expect(first.created).toEqual({ users: 4, memberships: 4, departments: 5, employees: 5, tasks: 8, notifications: 8, documents: 3, aiRequests: 1, shifts: 1, schedules: 35 });
    expect(await db.workSchedule.count({ where: { organizationId: org } })).toBe(35);
    expect(await db.workSchedule.count({ where: { organizationId: foreignOrg } })).toBe(0);
    expect(await db.attendanceLocation.count({ where: { organizationId: org } })).toBe(0);
    const schedulesBefore = await db.workSchedule.findMany({ where: { organizationId: org }, orderBy: { id: 'asc' } });
    const before = await db.task.findMany({ where: { organizationId: org }, orderBy: { id: 'asc' } });
    const auditsBefore = await db.auditEvent.count({ where: { organizationId: org } });
    const second = await run();
    expect(Object.values(second.created).every(n => n === 0)).toBe(true);
    expect(await db.task.findMany({ where: { organizationId: org }, orderBy: { id: 'asc' } })).toEqual(before);
    expect(await db.workSchedule.findMany({ where: { organizationId: org }, orderBy: { id: 'asc' } })).toEqual(schedulesBefore);
    expect(await db.auditEvent.count({ where: { organizationId: org } })).toBe(auditsBefore);
    expect(await db.rolePermission.findMany({ where: { roleId: role }, orderBy: { id: 'asc' } })).toEqual(grantsBefore);
    expect(await db.permission.findMany({ orderBy: { id: 'asc' } })).toEqual(permissionsBefore);
    expect(await db.organization.findUnique({ where: { id: foreignOrg } })).toEqual(foreignBefore);
    expect(await db.membershipRole.count({ where: { organizationId: org } })).toBe(1);
    expect(await db.employee.count({ where: { organizationId: org, userId: admin, status: 'ACTIVE', departmentId: { not: null } } })).toBe(1);
    expect(await db.fileObject.count({ where: { organizationId: org, status: 'AVAILABLE' } })).toBe(3);
    expect(await db.aiRequest.count({ where: { organizationId: org, status: 'SUCCEEDED', model: 'mock-v1' } })).toBe(1);
    expect(await db.notification.count({ where: { organizationId: org, recipientUserId: admin, readAt: null } })).toBe(1);
    expect(await db.notification.count({ where: { organizationId: org, recipientUserId: admin, readAt: { not: null } } })).toBe(1);
    for (const user of await db.user.findMany({ where: { memberships: { some: { organizationId: org } } } })) {
      expect(await new PasswordService().verify(source.DEMO_ADMIN_PASSWORD!, user.passwordHash!)).toBe(true);
    }
  });
  it('retains operator edits, read states and changed member credentials on reseed', async () => {
    await run();
    const schedule = await db.workSchedule.findFirstOrThrow({ where: { organizationId: org } });
    await db.workSchedule.update({ where: { id: schedule.id }, data: { isOff: true, shiftId: null, notes: 'Operator leave' } });
    const shift = await db.shift.findFirstOrThrow({ where: { organizationId: org } });
    await db.shift.update({ where: { id: shift.id }, data: { name: 'Operator shift', startTime: '08:00' } });
    const id = demoId(org, 'task', 'DEMO-TASK-001');
    await db.task.update({ where: { id }, data: { title: 'Operator edit', status: 'IN_PROGRESS' } });
    const notice = demoId(org, 'notification', 'DEMO-TASK-006');
    const readAt = new Date(); await db.notification.update({ where: { id: notice }, data: { readAt } });
    const newHash = await new PasswordService().hash(randomBytes(24).toString('base64url'));
    await db.user.update({ where: { email: 'an.demo@dxos.local' }, data: { passwordHash: newHash } });
    await run();
    expect(await db.workSchedule.findUnique({ where: { id: schedule.id } })).toMatchObject({ isOff: true, shiftId: null, notes: 'Operator leave' });
    expect(await db.shift.findUnique({ where: { id: shift.id } })).toMatchObject({ name: 'Operator shift', startTime: '08:00' });
    expect(await db.task.findUnique({ where: { id } })).toMatchObject({ title: 'Operator edit', status: 'IN_PROGRESS' });
    expect((await db.notification.findUniqueOrThrow({ where: { id: notice } })).readAt).toEqual(readAt);
    expect((await db.user.findUniqueOrThrow({ where: { email: 'an.demo@dxos.local' } })).passwordHash === newHash).toBe(true);
  });

  it('provisions exactly the agreed four business roles, preserves admin/foreign data and is idempotent', async () => {
    await run();
    const adminBefore = await db.user.findUniqueOrThrow({ where: { id: admin } });
    const grantsBefore = await db.rolePermission.findMany({ where: { roleId: role }, orderBy: { id: 'asc' } });
    const permissionsBefore = await db.permission.findMany({ orderBy: { id: 'asc' } });
    const foreignBefore = await db.organization.findUnique({ where: { id: foreignOrg } });
    const seeded = await seedDemoRoles(source);
    expect(seeded.created).toEqual({ roles: 4, grants: 70, assignments: 4 });
    const auth = new AuthorizationService(db as unknown as PrismaService);
    for (const definition of DEMO_ROLES) {
      const user = await db.user.findUniqueOrThrow({ where: { email: definition.members[0] } });
      expect(await auth.effectivePermissions(user.id, org)).toEqual([...definition.permissions].sort());
      for (const permission of ['task:update', 'task:assign', 'role:assign', 'approval:approve', 'approval:reject',
        'payroll:read', 'payroll:approve', 'compensation:read', 'document:sensitive:read', 'file:delete', 'document:delete'] as const) {
        expect(await auth.can(user.id, permission, org)).toBe(false);
      }
      expect(await auth.can(user.id, 'ai:use', org)).toBe(definition.key === 'demo-engineering');
      expect(await auth.can(user.id, 'task:read', foreignOrg)).toBe(false);
    }
    const auditCount = await db.auditEvent.count({ where: { organizationId: org } });
    expect((await seedDemoRoles(source)).created).toEqual({ roles: 0, grants: 0, assignments: 0 });
    expect(await db.auditEvent.count({ where: { organizationId: org } })).toBe(auditCount);
    expect(await db.user.findUnique({ where: { id: admin } })).toEqual(adminBefore);
    expect(await db.rolePermission.findMany({ where: { roleId: role }, orderBy: { id: 'asc' } })).toEqual(grantsBefore);
    expect(await db.permission.findMany({ orderBy: { id: 'asc' } })).toEqual(permissionsBefore);
    expect(await db.organization.findUnique({ where: { id: foreignOrg } })).toEqual(foreignBefore);
  });

  it('rejects legacy assignments atomically rather than accumulating demo privileges', async () => {
    await run();
    const membership = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: org,
      user: { email: 'minh-anh.demo@dxos.local' } } });
    const legacy = await db.role.create({ data: { organizationId: org, key: 'demo-manager', name: 'Legacy manager' } });
    await db.membershipRole.create({ data: { organizationId: org, membershipId: membership.id, roleId: legacy.id } });
    const before = await db.auditEvent.count({ where: { organizationId: org } });
    await expect(seedDemoRoles(source)).rejects.toThrow('EXISTING_DEMO_ASSIGNMENT_CONFLICT');
    expect(await db.role.count({ where: { organizationId: org } })).toBe(2);
    expect(await db.membershipRole.count({ where: { organizationId: org } })).toBe(2);
    expect(await db.auditEvent.count({ where: { organizationId: org } })).toBe(before);
  });

  it('does not overwrite operator edits to a role or silently keep excessive grants', async () => {
    await run(); await seedDemoRoles(source);
    const engineering = await db.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org, key: 'demo-engineering' } } });
    const extra = await db.permission.findUniqueOrThrow({ where: { key: 'task:update' } });
    await db.rolePermission.create({ data: { roleId: engineering.id, permissionId: extra.id } });
    await expect(seedDemoRoles(source)).rejects.toThrow('EXISTING_DEMO_ROLE_POLICY_CONFLICT');
    expect(await db.rolePermission.count({ where: { roleId: engineering.id, permissionId: extra.id } })).toBe(1);
  });

  it('requires active administrator authority and does not create missing catalog entries', async () => {
    await run();
    await db.rolePermission.deleteMany({ where: { roleId: role, permission: { key: 'role:assign' } } });
    await expect(seedDemoRoles(source)).rejects.toThrow('EXISTING_ADMIN_PERMISSIONS_REQUIRED');
    expect(await db.role.count({ where: { organizationId: org } })).toBe(1);
  });
  it('rolls back provisioning on an existing email collision without touching that user', async () => {
    const existing = await db.user.create({ data: { email: 'an.demo@dxos.local', displayName: 'Existing user' } });
    await expect(run()).rejects.toThrow('EXISTING_EMAIL_COLLISION_PRESERVED');
    expect(await db.user.findUnique({ where: { id: existing.id } })).toEqual(existing);
    expect(await db.department.count({ where: { organizationId: org } })).toBe(0);
  });
  it('rejects insufficient existing admin permissions without provisioning', async () => {
    await db.rolePermission.deleteMany({ where: { roleId: role, permission: { key: 'task:assign' } } });
    await expect(run()).rejects.toThrow('EXISTING_ADMIN_PERMISSIONS_REQUIRED');
    expect(await db.employee.count({ where: { organizationId: org } })).toBe(0);
  });
  it('rejects a foreign-tenant deterministic identifier and rolls back demo inserts', async () => {
    await db.organizationMembership.create({ data: { organizationId: foreignOrg, userId: admin } });
    const employee = await db.employee.create({ data: { organizationId: foreignOrg, userId: admin, employeeCode: 'FOREIGN', displayName: 'Foreign' } });
    const row = await db.task.create({ data: { id: demoId(org, 'task', 'DEMO-TASK-001'), organizationId: foreignOrg, creatorEmployeeId: employee.id, title: 'Foreign task' } });
    await expect(run()).rejects.toThrow('TASK_IDENTIFIER_COLLISION_PRESERVED');
    expect(await db.task.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(await db.department.count({ where: { organizationId: org } })).toBe(0);
  });
  it('resumes an interrupted storage write without duplicate rows or broken AVAILABLE files', async () => {
    storage.failNextPut = true;
    await expect(run()).rejects.toThrow('Simulated interrupted upload');
    expect(await db.fileObject.count({ where: { organizationId: org, status: 'AVAILABLE' } })).toBe(0);
    await run();
    expect(await db.fileObject.count({ where: { organizationId: org } })).toBe(3);
    expect(await db.fileObject.count({ where: { organizationId: org, status: 'AVAILABLE' } })).toBe(3);
    expect(await db.task.count({ where: { organizationId: org } })).toBe(8);
  });
  it('refuses to replace bytes for an existing AVAILABLE document', async () => {
    await run(); const row = await db.fileObject.findFirstOrThrow({ where: { organizationId: org } });
    storage.bytes.set(row.storageKey, Buffer.from('Operator replacement'));
    await expect(run()).rejects.toThrow('EXISTING_DOCUMENT_BYTES_CONFLICT_PRESERVED');
    expect(storage.bytes.get(row.storageKey)?.toString()).toBe('Operator replacement');
  });
});

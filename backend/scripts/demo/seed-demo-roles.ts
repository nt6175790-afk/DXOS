// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Prisma, PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../src/database/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AUDIT_EVENTS } from '../../src/modules/audit/audit-catalog';
import { AuthorizationService } from '../../src/modules/rbac/authorization.service';
import { isPermissionKey, PERMISSIONS, type PermissionKey } from '../../src/modules/rbac/permission-catalog';
import { DEMO_ADMIN_EMAIL, DEMO_ORGANIZATION_SLUG } from './demo-fixtures';
import { DemoSeedError, localDemoDatabase } from './seed-demo-dataset';

const P = PERMISSIONS;
const STAFF: PermissionKey[] = [P.ORGANIZATION_READ, P.DEPARTMENT_READ, P.TASK_READ, P.TASK_CREATE, P.CALENDAR_READ,
  P.ATTENDANCE_READ, P.ATTENDANCE_CHECK_IN, P.ATTENDANCE_CHECK_OUT, P.LEAVE_READ, P.LEAVE_CREATE, P.FILE_READ];

/** Agreed business policy: no extra grants merely to demonstrate AI. */
export const DEMO_ROLES = [
  { key: 'demo-sales', name: 'Nhân viên kinh doanh', department: 'DEMO-SALES',
    permissions: [...STAFF, P.CALENDAR_CREATE, P.FILE_UPLOAD], members: ['an.demo@dxos.local'] },
  { key: 'demo-engineering', name: 'Nhân viên kỹ thuật', department: 'DEMO-TECH',
    permissions: [...STAFF, P.FILE_UPLOAD, P.AI_USE], members: ['minh-anh.demo@dxos.local'] },
  { key: 'demo-warehouse', name: 'Nhân viên kho vận', department: 'DEMO-OPS',
    permissions: [...STAFF, P.FILE_UPLOAD], members: ['hoang-nam.demo@dxos.local'] },
  { key: 'demo-hr', name: 'Chuyên viên nhân sự', department: 'DEMO-HR',
    permissions: [...STAFF, P.FILE_UPLOAD, P.EMPLOYEE_READ, P.EMPLOYEE_CREATE, P.EMPLOYEE_UPDATE, P.ROLE_READ,
      P.DOCUMENT_READ, P.DOCUMENT_CREATE, P.DOCUMENT_UPDATE, P.DOCUMENT_DOWNLOAD, P.DOCUMENT_MANAGE,
      P.ATTENDANCE_MANAGE, P.SHIFT_READ, P.SHIFT_CREATE, P.SHIFT_UPDATE,
      P.SCHEDULE_READ, P.SCHEDULE_CREATE, P.SCHEDULE_UPDATE, P.SCHEDULE_MANAGE, P.LEAVE_APPROVE, P.REPORT_READ, P.REPORT_EXPORT],
    members: ['thu-ha.demo@dxos.local'] },
] as const;

/**
 * Explicit local-only provisioning. Exact matches are idempotent; unexpected grants/assignments abort atomically
 * instead of accumulating privileges or overwriting operator edits. Admin, passwords, other tenants and the catalog
 * are unchanged. Every role, permission grant and assignment is audited. Never run on ordinary application startup.
 */
export async function seedDemoRoles(source: NodeJS.ProcessEnv) {
  const databaseUrl = localDemoDatabase(source);
  for (const role of DEMO_ROLES) for (const key of role.permissions) if (!isPermissionKey(key)) throw new DemoSeedError('UNKNOWN_PERMISSION');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const audit = new AuditService(db as unknown as PrismaService);
  const authorization = new AuthorizationService(db as unknown as PrismaService);
  const created = { roles: 0, grants: 0, assignments: 0 };
  try {
    const result = await db.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({ where: { slug: DEMO_ORGANIZATION_SLUG }, select: { id: true, status: true } });
      const actor = await tx.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL }, select: { id: true, accountStatus: true } });
      if (organization?.status !== 'ACTIVE' || actor?.accountStatus !== 'ACTIVE') throw new DemoSeedError('ACTIVE_DEMO_ORGANIZATION_AND_ADMIN_REQUIRED');
      const org = organization.id;
      for (const key of new Set<PermissionKey>([P.ROLE_CREATE, P.ROLE_ASSIGN, ...DEMO_ROLES.flatMap(r => r.permissions)])) {
        if (!(await authorization.can(actor.id, key, org, tx))) throw new DemoSeedError('EXISTING_ADMIN_PERMISSIONS_REQUIRED');
      }
      const summary: { role: string; status: 'created' | 'kept'; permissions: number; members: string[] }[] = [];
      for (const definition of DEMO_ROLES) {
        let role = await tx.role.findUnique({ where: { organizationId_key: { organizationId: org, key: definition.key } }, select: { id: true, isActive: true, name: true } });
        const status = role ? 'kept' as const : 'created' as const;
        if (role) {
          const grants = await tx.rolePermission.findMany({ where: { roleId: role.id }, select: { permission: { select: { key: true } } } });
          if (!role.isActive || role.name !== definition.name ||
            JSON.stringify(grants.map(g => g.permission.key).sort()) !== JSON.stringify([...definition.permissions].sort())) {
            throw new DemoSeedError('EXISTING_DEMO_ROLE_POLICY_CONFLICT');
          }
        }
        if (!role) {
          role = await tx.role.create({ data: { organizationId: org, key: definition.key, name: definition.name, isActive: true,
            description: 'Vai trò nghiệp vụ demo; tạo bởi seed:demo-roles.' }, select: { id: true, isActive: true, name: true } });
          await audit.record({ event: AUDIT_EVENTS.ROLE_CREATED, organizationId: org, actorUserId: actor.id, resourceId: role.id }, tx);
          created.roles++;
          for (const key of definition.permissions) {
            const permission = await tx.permission.findUnique({ where: { key }, select: { id: true } });
            if (!permission) throw new DemoSeedError('EXISTING_PERMISSION_CATALOG_REQUIRED');
            await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
            await audit.record({ event: AUDIT_EVENTS.PERMISSION_GRANTED, organizationId: org, actorUserId: actor.id,
              resourceId: role.id, metadata: { permission: key } }, tx);
            created.grants++;
          }
        }
        if (!role.isActive) throw new DemoSeedError('DEMO_ROLE_INACTIVE_PRESERVED');
        const members: string[] = [];
        for (const email of definition.members) {
          const membership = await tx.organizationMembership.findFirst({ where: { organizationId: org, status: 'ACTIVE', user: { email, accountStatus: 'ACTIVE' } },
            select: { id: true, employee: { select: { status: true, department: { select: { code: true } } } } } });
          if (!membership || membership.employee?.status !== 'ACTIVE' || membership.employee.department?.code !== definition.department) {
            throw new DemoSeedError('RUN_SEED_DEMO_FIRST_OR_CHECK_EMPLOYEE');
          }
          if (await tx.membershipRole.count({ where: { membershipId: membership.id, roleId: { not: role.id } } })) {
            throw new DemoSeedError('EXISTING_DEMO_ASSIGNMENT_CONFLICT');
          }
          const existing = await tx.membershipRole.findUnique({ where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } } });
          if (!existing) {
            await tx.membershipRole.create({ data: { organizationId: org, membershipId: membership.id, roleId: role.id } });
            await audit.record({ event: AUDIT_EVENTS.ROLE_ASSIGNED, organizationId: org, actorUserId: actor.id, resourceId: role.id }, tx);
            created.assignments++;
          }
          members.push(email);
        }
        const permissions = await tx.rolePermission.count({ where: { roleId: role.id } });
        summary.push({ role: definition.key, status, permissions, members });
      }
      return summary;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    return { created, roles: result };
  } finally {
    await db.$disconnect();
  }
}

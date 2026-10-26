// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MembershipStatus, OrganizationStatus, PrismaClient, UserAccountStatus } from '@prisma/client';
import { localDemoDatabase } from './demo/seed-demo-dataset';
import { PasswordService } from '../src/modules/auth/password.service';
import { PERMISSION_CATALOG } from '../src/modules/rbac/permission-catalog';

const envPath = resolve(__dirname, '../.env');
if (!process.env.DATABASE_URL && existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const email = (process.env.DEMO_ADMIN_EMAIL ?? 'admin.demo@dxos.local').trim().toLowerCase();
const password = process.env.DEMO_ADMIN_PASSWORD;
const organizationSlug = 'dxos-demo';
const organizationName = 'DX-OS Demo Organization';
const displayName = 'DX-OS Demo Admin';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('DEMO_ADMIN_EMAIL is invalid.');
}

if (!password || password.length < 16 || password.length > 1_024) {
  throw new Error('DEMO_ADMIN_PASSWORD must be configured with 16-1024 characters.');
}
const passwordForHash = password;
// Refuse privileged demo provisioning against production or a remote database.
localDemoDatabase(process.env);

async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const passwordService = new PasswordService();

  try {
    const passwordHash = await passwordService.hash(passwordForHash);
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        update: { displayName, passwordHash, accountStatus: UserAccountStatus.ACTIVE },
        create: { email, displayName, passwordHash, accountStatus: UserAccountStatus.ACTIVE },
        select: { id: true, email: true },
      });

      const organization = await tx.organization.upsert({
        where: { slug: organizationSlug },
        update: { name: organizationName, status: OrganizationStatus.ACTIVE },
        create: { slug: organizationSlug, name: organizationName, status: OrganizationStatus.ACTIVE },
        select: { id: true, slug: true, name: true },
      });

      const role = await tx.role.upsert({
        where: { organizationId_key: { organizationId: organization.id, key: 'admin' } },
        update: { name: 'Administrator', description: 'Demo administrator role with the existing permission catalog.', isActive: true },
        create: { organizationId: organization.id, key: 'admin', name: 'Administrator', description: 'Demo administrator role with the existing permission catalog.', isActive: true },
        select: { id: true, key: true, name: true },
      });

      let permissionCount = 0;
      for (const key of PERMISSION_CATALOG) {
        const permission = await tx.permission.upsert({
          where: { key },
          update: {},
          create: { key, name: key },
          select: { id: true },
        });
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
        permissionCount += 1;
      }

      const membership = await tx.organizationMembership.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
        update: { status: MembershipStatus.ACTIVE },
        create: { organizationId: organization.id, userId: user.id, status: MembershipStatus.ACTIVE },
        select: { id: true, status: true },
      });

      await tx.membershipRole.upsert({
        where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
        update: {},
        create: { organizationId: organization.id, membershipId: membership.id, roleId: role.id },
      });

      return { user, organization, role, membership, permissionCount };
    });

    console.log(JSON.stringify({
      status: 'ok',
      user: result.user,
      organization: result.organization,
      role: result.role,
      membership: result.membership,
      permissionCount: result.permissionCount,
      passwordSource: 'DEMO_ADMIN_PASSWORD',
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : 'Demo seed failed.');
  process.exitCode = 1;
});

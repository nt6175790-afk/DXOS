// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Explicit operator provisioning; never grants membership or permissions.
const { PrismaClient } = require('@prisma/client');
const { resolve } = require('node:path');
const { existsSync } = require('node:fs');
const envFile = resolve(__dirname, '../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
async function main() {
  const { SSO_ISSUER: issuer, SSO_SUBJECT: subject, SSO_USER_ID: userId } = process.env;
  if (!issuer || issuer.length > 191 || !subject || subject.length > 191 || !/^[0-9a-f-]{36}$/i.test(userId ?? ''))
    throw new Error('Set SSO_ISSUER, SSO_SUBJECT and SSO_USER_ID locally.');
  const db = new PrismaClient();
  try {
    await db.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
      if (user?.accountStatus !== 'ACTIVE') throw new Error('An active DX-OS user is required.');
      const existing = await tx.oidcIdentity.findUnique({ where: { issuer_subject: { issuer, subject } } });
      if (existing && existing.userId !== userId) throw new Error('Identity already linked; reassignment is forbidden.');
      if (!existing) await tx.oidcIdentity.create({ data: { issuer, subject, userId } });
    });
    console.log('OIDC identity linked. No privileges granted.');
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('OIDC identity provisioning failed. Check local configuration and existing mapping.'); process.exitCode = 1; });

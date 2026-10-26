// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Link only the existing, explicitly named demo account. Never creates DX-OS privileges.
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const root = resolve(__dirname, '../..');
async function main() {
  for (const file of ['.env', 'backend/.env']) { const path = resolve(root, file); if (existsSync(path)) process.loadEnvFile(path); }
  const dbUrl = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname) || !['development', undefined].includes(process.env.NODE_ENV)) throw new Error();
  const db = new PrismaClient(); let createdSubject; let adminToken;
  const issuer = 'http://localhost:8180/realms/dxos';
  const file = resolve(root, '.secrets/demo-sso-account.json');
  try {
    const email = process.env.DEMO_ADMIN_EMAIL || 'admin.demo@dxos.local';
    const user = await db.user.findUnique({ where: { email }, select: { id: true, accountStatus: true } });
    if (user?.accountStatus !== 'ACTIVE') throw new Error();
    if (existsSync(file)) {
      const local = JSON.parse(readFileSync(file, 'utf8'));
      const mapping = await db.oidcIdentity.findUnique({ where: { issuer_subject: { issuer, subject: local.subject } } });
      if (local.email !== email || mapping?.userId !== user.id) throw new Error();
      console.log('Existing demo SSO identity preserved.'); return;
    }
    const stack = readFileSync(resolve(root, '.security.local.env'), 'utf8');
    const adminPassword = /^KEYCLOAK_ADMIN_PASSWORD=(.+)$/m.exec(stack)?.[1]?.trim();
    const tokenResponse = await fetch('http://localhost:8180/realms/master/protocol/openid-connect/token', { method: 'POST',
      body: new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username: 'dxos-operator', password: adminPassword ?? '' }) });
    if (!tokenResponse.ok) throw new Error(); adminToken = (await tokenResponse.json()).access_token;
    const username = 'dxos-demo-' + user.id;
    const password = randomBytes(32).toString('base64url');
    const response = await fetch('http://localhost:8180/admin/realms/dxos/users', { method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, firstName: 'DXOS', lastName: 'Demo', enabled: true, emailVerified: true,
        credentials: [{ type: 'password', value: password, temporary: false }] }) });
    if (response.status !== 201) throw new Error(); createdSubject = response.headers.get('location').split('/').pop();
    await db.oidcIdentity.create({ data: { issuer, subject: createdSubject, userId: user.id } });
    mkdirSync(resolve(root, '.secrets'), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify({ email, username, password, subject: createdSubject }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log('Existing demo account linked to SSO. Credentials stored only in ignored private file. No roles granted.');
  } catch (error) {
    if (createdSubject && adminToken) {
      await db.oidcIdentity.deleteMany({ where: { issuer, subject: createdSubject } }).catch(() => undefined);
      await fetch('http://localhost:8180/admin/realms/dxos/users/' + createdSubject, { method: 'DELETE', headers: { Authorization: 'Bearer ' + adminToken } });
    }
    throw error;
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Demo SSO provisioning blocked: verify existing demo account, migration and local IdP. No identity reassigned.'); process.exitCode = 1; });

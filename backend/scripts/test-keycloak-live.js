// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Live local Keycloak + actual DX-OS HTTP/session flow on an isolated MySQL database.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const root = resolve(__dirname, '../..');
const issuer = 'http://localhost:8180/realms/dxos';
const origin = 'http://localhost:5173';

async function main() {
  if (existsSync(resolve(root, 'backend/.env'))) process.loadEnvFile(resolve(root, 'backend/.env'));
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl || !['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('Local MySQL required');
  const name = 'dx_os_security_test_' + randomBytes(8).toString('hex');
  const url = new URL(baseUrl); url.pathname = '/' + name;
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  let db, app, adminToken, keycloakUserId, created = false;
  const username = 'dxos-live-' + randomUUID(); const password = randomBytes(32).toString('base64url');
  const stack = readFileSync(resolve(root, '.security.local.env'), 'utf8');
  const adminPassword = /^KEYCLOAK_ADMIN_PASSWORD=(.+)$/m.exec(stack)?.[1]?.trim();
  if (!adminPassword) throw new Error('Private Keycloak configuration required');
  const jsonFetch = async (path, options = {}) => {
    const response = await fetch('http://localhost:8180' + path, { ...options, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Keycloak fixture operation failed');
    return response;
  };
  try {
    const tokenResponse = await jsonFetch('/realms/master/protocol/openid-connect/token', { method: 'POST',
      body: new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username: 'dxos-operator', password: adminPassword }) });
    adminToken = (await tokenResponse.json()).access_token;
    const userResponse = await jsonFetch('/admin/realms/dxos/users', { method: 'POST', headers: {
      Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ username, firstName: 'DXOS', lastName: 'Fixture', email: username + '@example.test', emailVerified: true,
      enabled: true, credentials: [{ type: 'password', value: password, temporary: false }] }) });
    keycloakUserId = userResponse.headers.get('location').split('/').pop();
    await admin.$executeRawUnsafe(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true;
    const migration = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'database/schema.prisma'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: url.href } });
    if (migration.status !== 0) throw new Error('Disposable migration replay failed');
    Object.assign(process.env, { DATABASE_URL: url.href, NODE_ENV: 'test', AI_PROVIDER: 'mock', AI_MODEL: 'mock-v1', AI_API_KEY: 'test-only-not-a-real-provider-key',
      JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'), REDIS_URL: '', FILE_SCAN_ENABLED: 'false', VAULT_ENABLED: 'false',
      SSO_ENABLED: 'true', SSO_ISSUER: issuer, SSO_CLIENT_ID: 'dxos-web', SSO_REDIRECT_URI: origin + '/auth/sso/callback', SSO_BACKCHANNEL_ORIGIN: '' });
    const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../dist/app.module');
    const { configureApplication } = require('../dist/app.setup'); const { getAppConfiguration } = require('../dist/config/environment');
    const { StructuredLogger } = require('../dist/common/logging/structured-logger');
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false }); configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => undefined));
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    db = new PrismaClient({ datasources: { db: { url: url.href } } });
    const user = await db.user.create({ data: { email: username + '@example.test', displayName: 'SSO Fixture' } });
    await db.oidcIdentity.create({ data: { issuer, subject: keycloakUserId, userId: user.id } });
    let checks = 0;
    const post = (path, body) => fetch(base + '/api/v1/' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const start = await (await post('auth/sso/start', {})).json();
    assert.equal(new URL(start.authorizationUrl).searchParams.get('code_challenge_method'), 'S256'); checks++;
    const cookies = new Map();
    const absorb = response => { for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0]; const i = pair.indexOf('='); cookies.set(pair.slice(0,i), pair.slice(i+1)); } };
    const login = await fetch(start.authorizationUrl, { redirect: 'manual' }); absorb(login);
    const html = await login.text(); const action = /<form\b[^>]*\baction="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
    if (!action || new URL(action).origin !== 'http://localhost:8180') throw new Error('Keycloak login form unavailable');
    const loggedIn = await fetch(action, { method: 'POST', redirect: 'manual', headers: { Cookie: [...cookies].map(([k,v])=>k+'='+v).join('; ') },
      body: new URLSearchParams({ username, password, credentialId: '' }) });
    assert.equal(loggedIn.status, 302); const callback = new URL(loggedIn.headers.get('location'));
    assert.equal(callback.origin, origin); assert.equal(callback.searchParams.get('state'), start.state); checks++;
    const input = { code: callback.searchParams.get('code'), state: start.state, challenge: start.challenge, iss: callback.searchParams.get('iss') };
    const complete = await post('auth/sso/complete', input); assert.equal(complete.status, 200); const tokens = await complete.json(); checks++;
    assert.ok(tokens.accessToken && tokens.refreshToken); assert.equal(tokens.tokenType, 'Bearer'); checks++;
    const headers = { Authorization: 'Bearer ' + tokens.accessToken };
    const me = await fetch(base + '/api/v1/auth/me', { headers }); assert.equal(me.status, 200); assert.equal((await me.json()).id, user.id); checks++;
    assert.equal((await post('auth/sso/complete', input)).status, 401); checks++;
    const foreignOrg = randomUUID(); assert.equal((await fetch(base + '/api/v1/organizations/' + foreignOrg + '/roles', { headers })).status, 403); checks++;
    const badOrigin = await fetch(base + '/api/v1/auth/sso/start', { method: 'POST', headers: { Origin: 'https://foreign.test', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(badOrigin.status, 401); checks++;
    await fetch(base + '/api/v1/auth/logout', { method: 'POST', headers });
    assert.equal((await fetch(base + '/api/v1/auth/me', { headers })).status, 401); checks++;
    const bypass = await fetch(issuer + '/protocol/openid-connect/token', { method: 'POST',
      body: new URLSearchParams({ client_id: 'dxos-web', grant_type: 'password', username, password }) });
    assert.equal(bypass.ok, false); checks++;
    console.log(`LIVE Keycloak + DX-OS HTTP + isolated MySQL: ${checks} checks PASS. No credentials printed.`);
  } finally {
    await app?.close(); await db?.$disconnect();
    if (keycloakUserId && adminToken) await fetch('http://localhost:8180/admin/realms/dxos/users/' + keycloakUserId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + adminToken } });
    if (created && /^dx_os_security_test_[a-f0-9]{16}$/.test(name)) await admin.$executeRawUnsafe(`DROP DATABASE \`${name}\``);
    await admin.$disconnect();
  }
}
main().catch(error => { console.error('Live Keycloak verification failed:', error instanceof assert.AssertionError ? `assertion (${error.actual} vs ${error.expected})` : error.name); process.exitCode = 1; });

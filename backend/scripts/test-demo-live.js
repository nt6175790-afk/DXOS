// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Runs against the isolated demo only. Never prints passwords, tokens or HTTP bodies.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const checks = [];
let phase = 'configuration';
let token;
let base;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function ok(name, actual, expected) { assert.equal(actual, expected); checks.push({ name, status: 'PASS' }); }
async function request(route, options = {}) {
  const response = await fetch(base + route, { ...options, signal: AbortSignal.timeout(15000) });
  return response;
}
async function main() {
  const env = Object.fromEntries(fs.readFileSync(path.join(root, '.secrets/demo/compose.env'), 'utf8').trim().split('\n').map(line => {
    const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
  }));
  base = process.env.DEMO_BASE_URL ?? `http://127.0.0.1:${env.DEMO_HTTP_PORT}`;
  const url = new URL(base);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search) throw new Error();
  base = url.origin;
  phase = 'readiness'; let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if ((await request('/api/v1/health')).status === 200) { ready = true; break; } } catch { /* bounded readiness */ }
    await delay(1000);
  }
  assert(ready); checks.push({ name: 'Backend health through frontend proxy', status: 'PASS' });
  phase = 'frontend'; const page = await request('/'); ok('Frontend HTML', page.status, 200);
  const html = await page.text(); const asset = /src="(\/assets\/[^"<>]+\.js)"/.exec(html)?.[1]; assert(asset);
  ok('Compiled frontend asset', (await request(asset)).status, 200);
  for (const resource of ['/.env', '/.secrets/demo/compose.env']) {
    const text = await (await request(resource)).text();
    for (const key of ['MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'DEMO_ADMIN_PASSWORD', 'JWT_ACCESS_SECRET']) assert(!text.includes(env[key]));
  }
  checks.push({ name: 'Private configuration is not served', status: 'PASS' });
  phase = 'authentication';
  ok('Anonymous organization discovery', (await request('/api/v1/organizations')).status, 401);
  const response = await request('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.DEMO_ADMIN_EMAIL, password: env.DEMO_ADMIN_PASSWORD }) });
  ok('Seeded demo administrator login', response.status, 200);
  const auth = await response.json(); assert(auth.accessToken); token = auth.accessToken;
  const headers = { Authorization: 'Bearer ' + token };
  ok('Authenticated profile', (await request('/api/v1/auth/me', { headers })).status, 200);
  phase = 'organization';
  const orgResponse = await request('/api/v1/organizations', { headers }); ok('Organization discovery', orgResponse.status, 200);
  const organization = (await orgResponse.json()).items.find(item => item.slug === 'dxos-demo'); assert(organization);
  const prefix = '/api/v1/organizations/' + organization.id;
  for (const resource of ['permissions', 'dashboard', 'departments', 'employees', 'tasks', 'files', 'notifications', 'roles']) {
    phase = resource; const result = await request(prefix + '/' + resource, { headers }); ok(resource + ' API', result.status, 200);
    const data = await result.json();
    if (resource === 'roles') {
      const text = JSON.stringify(data); assert(!/"(?:password|passwordHash|refreshToken|accessToken|sessions|secret)"\s*:/i.test(text));
      checks.push({ name: 'Role metadata excludes security secrets', status: 'PASS' });
    }
    if (resource === 'files') {
      const file = data.items.find(item => item.status === 'AVAILABLE'); assert(file);
      const bytes = await request(prefix + '/files/' + file.id + '/content', { headers });
      ok('Seeded document download', bytes.status, 200); assert((await bytes.arrayBuffer()).byteLength > 0);
    }
  }
  phase = 'attendance';
  const policyResponse = await request(prefix + '/attendance/location', { headers });
  ok('Attendance location policy', policyResponse.status, 200);
  const policy = await policyResponse.json();
  ok('Fixed 100 metre attendance radius', policy.radiusMeters, 100);
  assert(policy.office === null || (typeof policy.office.label === 'string' && Number.isFinite(policy.office.latitude) && Number.isFinite(policy.office.longitude)));
  checks.push({ name: 'Attendance office configuration has a safe shape', status: 'PASS' });
  const todayResponse = await request(prefix + '/attendance/today', { headers });
  ok('Attendance today API', todayResponse.status, 200);
  const today = await todayResponse.json();
  assert(today.isEmployee && today.todaySchedule);
  checks.push({ name: 'Current Vietnam-date demo employee schedule exists', status: 'PASS' });
  ok('Missing GPS rejected', (await request(prefix + '/attendance/check-in', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
  ok('Foreign attendance location rejected', (await request('/api/v1/organizations/' + randomUUID() + '/attendance/location', { headers })).status, 403);
  phase = 'tenant isolation';
  ok('Foreign organization rejected', (await request('/api/v1/organizations/' + randomUUID() + '/roles', { headers })).status, 403);
  phase = 'logout'; ok('Logout', (await request('/api/v1/auth/logout', { method: 'POST', headers })).status, 204); token = undefined;
  ok('Revoked session rejected', (await request('/api/v1/auth/me', { headers })).status, 401);
  phase = 'unprivileged member';
  const member = await request('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'an.demo@dxos.local', password: env.DEMO_ADMIN_PASSWORD }) });
  ok('Unprivileged member login', member.status, 200); token = (await member.json()).accessToken;
  ok('Membership alone does not grant role:read', (await request(prefix + '/roles', { headers: { Authorization: 'Bearer ' + token } })).status, 403);
  await request('/api/v1/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); token = undefined;
  phase = 'business role policy';
  for (const [email, count, canUseAi] of [
    ['an.demo@dxos.local', 13, false], ['minh-anh.demo@dxos.local', 13, true],
    ['hoang-nam.demo@dxos.local', 12, false], ['thu-ha.demo@dxos.local', 32, false],
  ]) {
    const login = await request('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: env.DEMO_ADMIN_PASSWORD }) });
    ok(email + ' login', login.status, 200); token = (await login.json()).accessToken;
    const memberHeaders = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const permissionResponse = await request(prefix + '/permissions', { headers: memberHeaders });
    ok(email + ' permission discovery', permissionResponse.status, 200);
    const permissions = (await permissionResponse.json()).permissions;
    ok(email + ' permission count', permissions.length, count);
    for (const denied of ['task:update', 'task:assign', 'role:assign', 'approval:approve', 'approval:reject',
      'payroll:read', 'payroll:approve', 'compensation:read', 'document:sensitive:read']) assert(!permissions.includes(denied));
    ok(email + ' explicit AI permission', permissions.includes('ai:use'), canUseAi);
    const answer = await request(prefix + '/ai/generate', { method: 'POST', headers: memberHeaders,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Xin chào' }], maxOutputTokens: 256 }) });
    ok(email + ' AI authorization', answer.status, canUseAi ? 200 : 403);
    ok(email + ' foreign organization denied', (await request('/api/v1/organizations/' + randomUUID() + '/tasks', { headers: memberHeaders })).status, 403);
    ok(email + ' logout', (await request('/api/v1/auth/logout', { method: 'POST', headers: memberHeaders })).status, 204);
    token = undefined;
  }
  fs.mkdirSync(path.join(root, 'security-artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'security-artifacts/demo-smoke.json'), JSON.stringify({ status: 'PASS', aiMode: 'mock', checks }, null, 2) + '\n');
  console.log('Isolated demo smoke PASS:', checks.length, 'checks. No credentials printed.');
}
main().catch(() => { console.error('Demo smoke FAIL at:', phase, '(response bodies and credentials suppressed)'); process.exitCode = 1; }).finally(async () => {
  if (token && base) await request('/api/v1/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(() => undefined);
});

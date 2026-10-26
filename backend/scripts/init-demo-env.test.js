// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initializeDemo } = require('./init-demo-env');
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dxos-demo-env-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function values(root) {
  return Object.fromEntries(fs.readFileSync(path.join(root, '.secrets/demo/compose.env'), 'utf8').trim().split('\n').map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
  }));
}
test('creates unique local demo secrets and loopback seed URL, without exposing values', t => {
  const dir = temporary(t), result = initializeDemo(dir), env = values(dir);
  assert.deepEqual(result, { created: true, file: '.secrets/demo/compose.env' });
  for (const key of ['MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'JWT_ACCESS_SECRET', 'DEMO_ADMIN_PASSWORD']) assert.match(env[key], /^[\w-]{48}$/);
  assert.equal(new Set([env.MYSQL_ROOT_PASSWORD, env.MYSQL_PASSWORD, env.JWT_ACCESS_SECRET, env.DEMO_ADMIN_PASSWORD]).size, 4);
  assert.equal(new URL(env.DATABASE_URL).hostname, 'mysql');
  assert.equal(new URL(env.DEMO_DATABASE_URL).hostname, 'localhost');
  assert.equal(new URL(env.DEMO_DATABASE_URL).pathname, '/dx_os');
  assert.equal(env.DEMO_HTTP_PORT, '8090');
});
test('rerunning setup never rotates credentials or overwrites existing configuration', t => {
  const dir = temporary(t); initializeDemo(dir); const before = values(dir);
  assert.equal(initializeDemo(dir).created, false); assert.deepEqual(values(dir), before);
});
test('separate installations have different credentials', t => {
  const a = temporary(t), b = temporary(t); initializeDemo(a); initializeDemo(b);
  assert.notEqual(values(a).JWT_ACCESS_SECRET, values(b).JWT_ACCESS_SECRET);
  assert.notEqual(values(a).DEMO_ADMIN_PASSWORD, values(b).DEMO_ADMIN_PASSWORD);
});
test('port validation fails before creating local secret files', t => {
  const root = temporary(t);
  for (const port of ['80', '65536', '8090\nATTACK=value']) assert.throws(() => initializeDemo(root, { port }));
  assert.equal(fs.existsSync(path.join(root, '.secrets')), false);
});
test('operator environment and application source are not imported or modified', t => {
  const dir = temporary(t); fs.mkdirSync(path.join(dir, 'backend'));
  fs.writeFileSync(path.join(dir, 'backend/.env'), 'JWT_ACCESS_SECRET=operator-local-value\n');
  initializeDemo(dir, { port: '8091' });
  assert.equal(fs.readFileSync(path.join(dir, 'backend/.env'), 'utf8'), 'JWT_ACCESS_SECRET=operator-local-value\n');
  assert.equal(values(dir).DEMO_HTTP_PORT, '8091');
});

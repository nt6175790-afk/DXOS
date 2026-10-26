// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { check } = require('./check-source-licenses');
test('checks file licenses without changing migration checksums, JSON or third-party notices', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dxos-license-'));
  try {
    fs.mkdirSync(path.join(dir, 'licenses'));
    const originals = { 'migration.sql': 'CREATE TABLE example(id INT);\n', 'config.json': '{"v":1}\n', 'script.sh': '#!/bin/sh\necho ok\n', 'app.ts': 'export const value = 1;\n', 'licenses/third-party.json': '{"license":"MIT"}\n' };
    for (const [file, text] of Object.entries(originals)) fs.writeFileSync(path.join(dir, file), text);
    assert.equal(check(Object.keys(originals), false, dir).status, 'FAIL');
    check(Object.keys(originals), true, dir);
    assert.equal(check(Object.keys(originals), false, dir).status, 'PASS');
    for (const f of ['migration.sql', 'config.json', 'licenses/third-party.json']) assert.equal(fs.readFileSync(path.join(dir, f), 'utf8'), originals[f]);
    assert(fs.readFileSync(path.join(dir, 'script.sh'), 'utf8').startsWith('#!/bin/sh\n# SPDX-'));
    const before = fs.readFileSync(path.join(dir, 'app.ts'), 'utf8');
    check(Object.keys(originals), true, dir);
    assert.equal(fs.readFileSync(path.join(dir, 'app.ts'), 'utf8'), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

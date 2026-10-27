// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { unsealExisting } = require('./resume-local-security');
test('refuses initialization or unexpected threshold before reading any private material', async () => {
  const read = () => { throw Error('must not read'); };
  await assert.rejects(() => unsealExisting({ initialized: false }, read));
  await assert.rejects(() => unsealExisting({ initialized: true, sealed: true, t: 20 }, read));
});
test('already unsealed store never reads or transmits shares', async () => {
  await unsealExisting({ initialized: true, sealed: false }, () => { throw Error('must not read'); });
});
test('uses only the existing threshold shares and verifies recovery without modifying policies', async () => {
  const sent = [];
  await unsealExisting({ initialized: true, sealed: true, t: 2 }, () => ['fixture-a', 'fixture-b', 'fixture-c'], async v => sent.push(v), async () => ({ sealed: false }));
  assert.deepEqual(sent, ['fixture-a', 'fixture-b']);
  await assert.rejects(() => unsealExisting({ initialized: true, sealed: true, t: 2 }, () => ['a', 'b'], async () => {}, async () => ({ sealed: true })));
});

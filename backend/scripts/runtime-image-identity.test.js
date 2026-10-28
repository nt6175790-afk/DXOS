// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyRuntimeImages } = require('./runtime-image-identity');
const reviewed = 'sha256:' + 'a'.repeat(64);
test('matching immutable images permit recovery without inspecting secret configuration', () => {
  const calls = [];
  verifyRuntimeImages(args => { calls.push(args); return reviewed; });
  assert.equal(calls.length, 18);
  assert(calls.every(args => ['{{.Id}}', '{{.Image}}'].includes(args.at(-1))));
});
test('an old vendor Keycloak container is rejected even if the reviewed image tag exists', () => {
  assert.throws(() => verifyRuntimeImages(args => args.includes('dxos-security-keycloak-1') ? 'sha256:' + 'b'.repeat(64) : reviewed), /Local image mismatch: keycloak/);
});
test('missing or malformed immutable identity fails closed', () => {
  assert.throws(() => verifyRuntimeImages(() => ''), /identity unavailable/);
});

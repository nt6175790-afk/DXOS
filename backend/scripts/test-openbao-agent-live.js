// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Prove renewal beyond a deliberately short initial TTL; restore the local role.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const address = require('./openbao-local-context')(__filename);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const admin = JSON.parse(fs.readFileSync(path.join(root, '.secrets/openbao-bootstrap.json'), 'utf8')).root_token;
  const call = (endpoint, token, method = 'GET', body) => fetch(address + '/v1/' + endpoint, {
    method, redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { 'X-Vault-Token': token, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const role = 'auth/approle/role/dxos-local-backend';
  const originalResponse = await call(role, admin); assert.equal(originalResponse.status, 200);
  const original = (await originalResponse.json()).data;
  const currentToken = () => {
    const r = spawnSync('docker', ['exec', 'dxos-security-backend-1', 'cat', '/run/secrets/openbao/token'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('Agent sink unavailable');
    return r.stdout.trim(); // Keep token in memory, never print it.
  };
  const restart = () => { const r = spawnSync('docker', ['restart', 'dxos-security-openbao-agent-1'], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('Agent restart failed'); };
  const awaitNew = async previous => {
    for (let i = 0; i < 20; i++) { const token = currentToken(); if (token && token !== previous) return token; await pause(500); }
    throw new Error('Agent token was not refreshed');
  };
  const before = currentToken(); let testToken;
  try {
    assert.equal((await call(role, admin, 'POST', { token_ttl: '8s', token_max_ttl: '40s' })).status, 204);
    restart(); testToken = await awaitNew(before);
    const lookup = async token => { const r = await call('auth/token/lookup', admin, 'POST', { token }); assert.equal(r.status, 200); return (await r.json()).data; };
    const initial = await lookup(testToken); assert(initial.creation_ttl <= 8); assert.deepEqual(initial.policies, ['dxos-agent']);
    await pause(12000);
    assert.equal(currentToken(), testToken); const renewed = await lookup(testToken); assert(renewed.ttl > 0);
    const secret = await call('secret/data/dxos-container', testToken); assert.equal(secret.status, 200); await secret.body?.cancel();
    assert.equal((await call('secret/data/dxos', testToken)).status, 403);
    assert.equal((await call('secret/data/dxos-container', testToken, 'POST', { data: { invalid: true } })).status, 403);
  } finally {
    const restored = await call(role, admin, 'POST', {
      token_ttl: original.token_ttl, token_max_ttl: original.token_max_ttl,
      token_policies: original.token_policies, token_no_default_policy: original.token_no_default_policy,
      secret_id_ttl: original.secret_id_ttl, secret_id_num_uses: original.secret_id_num_uses,
    });
    assert.equal(restored.status, 204); const previous = currentToken(); restart();
    const finalToken = await awaitNew(previous);
    const r = await call('auth/token/lookup', admin, 'POST', { token: finalToken }); assert.equal(r.status, 200);
    assert((await r.json()).data.ttl > 300);
  }
  console.log('LIVE OpenBao agent: renewable short-TTL token, policy isolation, denied write, and restored normal TTL PASS.');
}
main().catch(() => { console.error('OpenBao agent verification failed; no tokens or credentials printed.'); process.exitCode = 1; });

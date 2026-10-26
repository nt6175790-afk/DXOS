// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { loadVaultSecrets } = require('../dist/config/vault');
const root = resolve(__dirname, '../..');
const localAddress = require('./openbao-local-context')(__filename);
async function main() {
  const bootstrap = JSON.parse(readFileSync(resolve(root, '.secrets/openbao-bootstrap.json'), 'utf8'));
  const appToken = readFileSync(resolve(root, '.secrets/openbao-app-token'), 'utf8');
  const temporaryPath = 'dxos-live-' + randomBytes(8).toString('hex');
  const address = localAddress + '/v1/';
  const call = async (path, token, method = 'GET', body) => fetch(address + path, { method,
    headers: { 'X-Vault-Token': token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  // Do not replace an operator's real dxos secret; use a temporary path/policy/token.
  const fixtureValue = randomBytes(48).toString('base64url'); let testToken;
  try {
    assert.equal((await call('secret/data/' + temporaryPath, bootstrap.root_token, 'POST', { data: { JWT_ACCESS_SECRET: fixtureValue } })).status, 200);
    await call('sys/policies/acl/' + temporaryPath, bootstrap.root_token, 'PUT', {
      policy: `path "secret/data/${temporaryPath}" { capabilities = ["read"] }`,
    });
    const tokenResponse = await call('auth/token/create', bootstrap.root_token, 'POST', { policies: [temporaryPath], no_default_policy: true, ttl: '5m' });
    testToken = (await tokenResponse.json()).auth.client_token;
    // Pass the temporary token through a temporary file, matching the production loader boundary.
    const { writeFileSync, unlinkSync } = require('node:fs'); const tokenFile = resolve(root, '.secrets/' + temporaryPath);
    writeFileSync(tokenFile, testToken, { flag: 'wx', mode: 0o600 });
    try {
      const env = { VAULT_ENABLED: 'true', VAULT_ADDR: localAddress, VAULT_TOKEN_FILE: tokenFile,
        VAULT_SECRET_PATH: 'secret/data/' + temporaryPath, NODE_ENV: 'test' };
      await loadVaultSecrets(env); assert.equal(env.JWT_ACCESS_SECRET, fixtureValue);
    } finally { unlinkSync(tokenFile); }
    assert.equal((await call('secret/data/' + temporaryPath, appToken)).status, 403);
    assert.equal((await call('secret/data/dxos', appToken, 'POST', { data: { invalid: true } })).status, 403);
    console.log('LIVE OpenBao: KV-v2 read and application least-privilege isolation PASS (3 checks).');
  } finally {
    if (testToken) await call('auth/token/revoke', bootstrap.root_token, 'POST', { token: testToken });
    await call('secret/metadata/' + temporaryPath, bootstrap.root_token, 'DELETE');
    await call('sys/policies/acl/' + temporaryPath, bootstrap.root_token, 'DELETE');
  }
}
main().catch(() => { console.error('Live OpenBao verification failed; no credentials printed.'); process.exitCode = 1; });

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Initializes only the dedicated local dxos-security OpenBao instance.
// Bootstrap material stays in ignored .secrets; never printed or added to Git.
const { existsSync, readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
const address = require('./openbao-local-context')(__filename);
const directory = resolve(root, '.secrets');
const bootstrapPath = resolve(directory, 'openbao-bootstrap.json');
async function main() {
  let token;
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(address + '/v1/' + path, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Vault-Token': token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`OpenBao ${path} failed: HTTP ${response.status}`);
    return response.status === 204 ? {} : response.json();
  };
  const status = await call('sys/init'); let bootstrap;
  if (!status.initialized) {
    if (existsSync(bootstrapPath)) throw new Error('Existing bootstrap material must be inspected by operator');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    bootstrap = await call('sys/init', 'POST', { secret_shares: 3, secret_threshold: 2 });
    writeFileSync(bootstrapPath, JSON.stringify(bootstrap), { flag: 'wx', mode: 0o600 });
  } else {
    if (!existsSync(bootstrapPath)) throw new Error('Initialized instance requires its original operator material');
    bootstrap = JSON.parse(readFileSync(bootstrapPath, 'utf8'));
  }
  token = bootstrap.root_token;
  const seal = await call('sys/seal-status');
  if (seal.sealed) { for (const key of bootstrap.keys.slice(0, 2)) await call('sys/unseal', 'POST', { key }); }
  let active = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(address + '/v1/sys/health', { redirect: 'error', signal: AbortSignal.timeout(3000) });
    if (response.status === 200) { active = true; break; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!active) throw new Error('OpenBao active-node readiness failed');
  const mounts = await call('sys/mounts');
  if (!mounts['secret/']) await call('sys/mounts/secret', 'POST', { type: 'kv', options: { version: '2' } });
  await call('sys/policies/acl/dxos-read', 'PUT', { policy: 'path "secret/data/dxos" { capabilities = ["read"] }\npath "secret/data/dxos-container" { capabilities = ["read"] }' });
  await call('sys/policies/acl/dxos-agent', 'PUT', { policy: 'path "secret/data/dxos-container" { capabilities = ["read"] }\npath "auth/token/lookup-self" { capabilities = ["read"] }\npath "auth/token/renew-self" { capabilities = ["update"] }' });
  const authMethods = await call('sys/auth');
  if (!authMethods['approle/']) await call('sys/auth/approle', 'POST', { type: 'approle' });
  await call('auth/approle/role/dxos-local-backend', 'POST', {
    token_policies: ['dxos-agent'], token_no_default_policy: true,
    token_ttl: '10m', token_max_ttl: '1h', secret_id_ttl: '0', secret_id_num_uses: 0,
  });
  const roleDirectory = resolve(directory, 'openbao-approle');
  mkdirSync(roleDirectory, { recursive: true, mode: 0o700 });
  const roleId = await call('auth/approle/role/dxos-local-backend/role-id');
  writeFileSync(resolve(roleDirectory, 'role_id'), roleId.data.role_id, { mode: 0o600 });
  const secretIdPath = resolve(roleDirectory, 'secret_id');
  let validSecretId = false;
  if (existsSync(secretIdPath)) {
    try { await call('auth/approle/role/dxos-local-backend/secret-id/lookup', 'POST', { secret_id: readFileSync(secretIdPath, 'utf8').trim() }); validSecretId = true; } catch { /* Recreate only revoked/invalid local agent identity. */ }
  }
  if (!validSecretId) {
    const id = await call('auth/approle/role/dxos-local-backend/secret-id', 'POST', {});
    writeFileSync(secretIdPath, id.data.secret_id, { mode: 0o600 });
  }
  const file = resolve(directory, 'openbao-app-token');
  let validToken = false;
  if (existsSync(file)) {
    try {
      const current = readFileSync(file, 'utf8').trim();
      const lookup = await call('auth/token/lookup', 'POST', { token: current });
      if (lookup.data.ttl > 300) validToken = true;
      else { await call('auth/token/renew', 'POST', { token: current, increment: '1h' }); validToken = true; }
    } catch { /* Only replace an expired/unrenewable application token, never bootstrap material. */ }
  }
  if (!validToken) {
    const result = await call('auth/token/create', 'POST', { policies: ['dxos-read'], no_default_policy: true,
      ttl: '1h', explicit_max_ttl: '24h', renewable: true, display_name: 'dxos-local-backend' });
    writeFileSync(file, result.auth.client_token, { mode: 0o600 });
  }
  console.log('OpenBao initialized/unsealed; read-only application token stored privately. No secrets printed.');
  console.log('Local AppRole agent identity prepared; renewable container token is managed in a private named volume.');
  console.log('Local demo uses private TLS; production requires separate seal custodians and managed workload authentication.');
}
main().catch(error => { console.error('Local OpenBao setup failed:', error.code ?? (error.message.startsWith('OpenBao ') ? error.message : error.name)); process.exitCode = 1; });

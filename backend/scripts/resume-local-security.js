// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Recovery of an existing local stack only. Never initializes or changes keys/policies.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
async function unsealExisting(status, readShares, sendShare, readStatus) {
  if (!status.initialized) throw new Error('Existing initialized store required; use the first-install runbook');
  if (!status.sealed) return;
  if (!Number.isInteger(status.t) || status.t < 1 || status.t > 5) throw new Error('Unexpected seal threshold');
  const shares = readShares();
  if (!Array.isArray(shares) || shares.length < status.t) throw new Error('Original operator material required');
  for (const key of shares.slice(0, status.t)) await sendShare(key);
  if ((await readStatus()).sealed) throw new Error('Original material did not unseal store');
}
async function main() {
  const root = path.resolve(__dirname, '../..');
  const ca = path.join(root, '.secrets/openbao-tls/ca.crt');
  if (!fs.existsSync(ca)) throw new Error('Existing local TLS/operator setup required');
  if (process.env.NODE_EXTRA_CA_CERTS !== ca) {
    const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, NODE_EXTRA_CA_CERTS: ca }, stdio: 'inherit' });
    process.exitCode = r.status ?? 1; return;
  }
  const run = args => { const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 }); if (r.status !== 0) throw new Error('Docker operation failed; start Docker Desktop/Engine and check existing containers'); };
  run(['info', '--format', '{{.ServerVersion}}']);
  run(['start', 'dxos-security-keycloak-1', 'dxos-security-clamav-1', 'dxos-security-redis-1', 'dxos-security-openbao-1', 'dxos-security-frontend-1', 'dxos-security-apisix-1', 'dxos-security-waf-1']);
  const call = async (route, body) => {
    const r = await fetch('https://localhost:8200/v1/' + route, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('Local secret-store request rejected'); return r.json();
  };
  let status;
  for (let i = 0; i < 30; i++) { try { status = await call('sys/seal-status'); break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
  if (!status) throw new Error('Local secret store unavailable');
  await unsealExisting(status, () => JSON.parse(fs.readFileSync(path.join(root, '.secrets/openbao-bootstrap.json'), 'utf8')).keys,
    key => call('sys/unseal', { key }), () => call('sys/seal-status'));
  run(['restart', 'dxos-security-openbao-agent-1', 'dxos-security-backend-1']);
  for (const url of ['http://localhost:8180/realms/dxos/.well-known/openid-configuration', 'http://localhost:8088/api/v1/health']) {
    let ready = false;
    for (let i = 0; i < 60; i++) { try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) { ready = true; break; } } catch { /* bounded startup */ } await new Promise(r => setTimeout(r, 1000)); }
    if (!ready) throw new Error('Local SSO/edge readiness did not complete');
  }
  console.log('Local SSO and edge ready. Existing credentials, policies, volumes and ACLs preserved.');
}
module.exports = { unsealExisting };
if (require.main === module) main().catch(error => { console.error('Local security recovery stopped:', /^(Existing |Original |Unexpected |Docker operation|Local )/.test(error.message) ? error.message : 'Check local operator material; values suppressed'); process.exitCode = 1; });

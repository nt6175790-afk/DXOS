// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Adds or rotates AI_API_KEY in the local OpenBao secrets after publish-openbao-local-secrets.js has run.
// Reads the key from AI_API_KEY (environment, .env or backend/.env), writes it with check-and-set to secret/dxos and
// secret/dxos-container, and removes any plaintext copy from .security.backend.env. Never prints the key.
// Restart the backend container afterwards so it reads the new value.
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
const address = require('./openbao-local-context')(__filename);
let stage = 'local-configuration';
async function main() {
  if (!address.startsWith('https:')) throw new Error('TLS required');
  const preset = process.env.AI_API_KEY;
  for (const file of ['.env', 'backend/.env']) { const path = resolve(root, file); if (existsSync(path)) process.loadEnvFile(path); }
  const key = preset || process.env.AI_API_KEY;
  if (!key || key.length > 16384 || /\s/.test(key) || key === 'replace-with-a-local-secret') { stage = 'AI_API_KEY-missing'; throw new Error(); }
  const bootstrap = JSON.parse(readFileSync(resolve(root, '.secrets/openbao-bootstrap.json'), 'utf8'));
  const call = async (path, method = 'GET', body) => fetch(address + '/v1/' + path, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'X-Vault-Token': bootstrap.root_token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  stage = 'audit-list';
  const audits = await call('sys/audit'); if (!audits.ok) throw new Error('HTTP ' + audits.status);
  const auditBody = await audits.json();
  if (!(auditBody.data ?? auditBody)['file/']) { stage = 'declarative-audit-not-active'; throw new Error(); }
  let changed = 0;
  for (const name of ['dxos-container', 'dxos']) {
    stage = 'secret-read-' + name;
    const current = await call('secret/data/' + name);
    if (current.status === 404) {
      // The container secret is required (run publish-openbao-local-secrets.js first); the native one is optional.
      if (name === 'dxos-container') { stage = 'run-publish-openbao-local-secrets-first'; throw new Error(); }
      continue;
    }
    if (!current.ok) throw new Error('HTTP ' + current.status);
    const { data, metadata } = (await current.json()).data;
    if (data.AI_API_KEY === key) continue;
    stage = 'secret-update-' + name;
    const updated = await call('secret/data/' + name, 'POST', { options: { cas: metadata.version }, data: { ...data, AI_API_KEY: key } });
    if (!updated.ok) throw new Error('HTTP ' + updated.status);
    changed++;
  }
  const envPath = resolve(root, '.security.backend.env');
  if (existsSync(envPath)) {
    stage = 'private-env-update';
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    const kept = lines.filter((line) => !line.startsWith('AI_API_KEY='));
    if (kept.length !== lines.length) writeFileSync(envPath, kept.join('\n').trimEnd() + '\n');
  }
  console.log(changed ? 'AI_API_KEY stored in local OpenBao with check-and-set. Restart the backend container. No secret printed.'
    : 'AI_API_KEY already up to date in local OpenBao. No secret printed.');
}
main().catch((error) => { console.error('OpenBao AI key update blocked at', stage, /^HTTP \d+$/.test(error.message) ? error.message : ''); process.exitCode = 1; });

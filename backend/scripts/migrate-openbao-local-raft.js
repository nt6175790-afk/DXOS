// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Controlled local file -> Raft copy; original encrypted source volume stays intact.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const address = require('./openbao-local-context')(__filename);
const configPath = path.join(root, 'backend/deploy/vault/vault.hcl');
const composePath = path.join(root, 'backend/deploy/compose.security.yml');
const resultPath = path.join(root, 'security-artifacts/openbao-raft-migration.json');
const oldVolume = 'dxos-security_openbao_data', targetVolume = 'dxos-security_openbao_raft_data';
const copyVolume = 'dxos-security_openbao_filecopy_' + randomBytes(6).toString('hex');
const run = args => { const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }); if (r.status !== 0) throw new Error('Controlled Docker operation failed'); return r.stdout; };
const compose = ['compose', '--env-file', '.security.local.env', '-f', 'backend/deploy/compose.security.yml'];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function canonical(value) { return JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b,'en'))) : v); }
async function main() {
  if (fs.existsSync(resultPath) && JSON.parse(fs.readFileSync(resultPath)).status === 'PASS') { console.log('Raft migration already verified; no storage overwritten.'); return; }
  const previousConfig = fs.readFileSync(configPath, 'utf8'), previousCompose = fs.readFileSync(composePath, 'utf8');
  if (!previousConfig.includes('storage "file"') || !previousCompose.includes('openbao_data:/openbao/file')) throw new Error('Unexpected source storage');
  const exists = spawnSync('docker', ['volume', 'inspect', targetVolume], { encoding: 'utf8' });
  const adopting = process.argv.includes('--adopt-verified-copy');
  if (exists.status === 0 && !adopting) throw new Error('Existing destination requires inspection; overwrite refused');
  if (adopting && exists.status !== 0) throw new Error('Verified destination absent');
  const token = JSON.parse(fs.readFileSync(path.join(root, '.secrets/openbao-bootstrap.json'), 'utf8')).root_token;
  const call = async endpoint => {
    const r = await fetch(address + '/v1/' + endpoint, { headers: { 'X-Vault-Token': token }, redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('Secret-state verification unavailable'); return r.json();
  };
  const fingerprint = async () => {
    const result = {};
    for (const endpoint of ['secret/data/dxos', 'secret/data/dxos-container', 'sys/policies/acl/dxos-agent', 'auth/approle/role/dxos-local-backend/role-id']) {
      const response = await call(endpoint);
      const stable = endpoint.startsWith('secret/') ? { data: response.data.data, version: response.data.metadata.version } : endpoint.includes('/policies/') ? response.data.policy : response.data.role_id;
      if (stable === undefined) throw new Error('Missing expected stable fingerprint field');
      result[endpoint] = createHash('sha256').update(canonical(stable)).digest('hex');
    }
    return result;
  };
  const before = await fingerprint(); let stopped = false;
  if (adopting) {
    const checked = JSON.parse(fs.readFileSync(path.join(root, 'security-artifacts/openbao-copy-verification.json'), 'utf8'));
    if (!checked.healthy || Object.entries(before).some(([endpoint, hash]) => checked.results[endpoint]?.before !== hash || checked.results[endpoint]?.after !== hash || !checked.results[endpoint]?.equal)) throw new Error('Verified copy is stale or mismatched');
    const metadata = JSON.parse(exists.stdout)[0];
    if (metadata.Name !== targetVolume || metadata.Labels?.['com.docker.compose.project'] !== 'dxos-security') throw new Error('Unexpected destination ownership');
    run(['stop', 'dxos-security-openbao-raft-check']); run(['rm', 'dxos-security-openbao-raft-check']);
  }
  try {
    run(['stop', 'dxos-security-backend-1', 'dxos-security-openbao-agent-1', 'dxos-security-openbao-1']); stopped = true;
    if (!adopting) {
    run(['volume', 'create', copyVolume]);
    run(['volume', 'create', '--label', 'com.docker.compose.project=dxos-security', '--label', 'com.docker.compose.volume=openbao_raft_data', targetVolume]);
    run(['run', '--rm', '--network', 'none', '-v', oldVolume + ':/source:ro', '-v', copyVolume + ':/clone', 'alpine:3.23', 'sh', '-c', 'cp -a /source/. /clone/']);
    const migrationFile = path.join(root, 'outputs/openbao-migrate-raft.hcl');
    fs.writeFileSync(migrationFile, 'storage_source "file" {\n  path = "/source"\n}\nstorage_destination "raft" {\n  path = "/openbao/file"\n  node_id = "dxos-local-1"\n}\ncluster_addr = "https://openbao:8201"\n');
    run(['run', '--rm', '--network', 'none', '--add-host', 'openbao:127.0.0.1', '-v', copyVolume + ':/source', '-v', targetVolume + ':/openbao/file', '-v', migrationFile + ':/run/migrate.hcl:ro', 'quay.io/openbao/openbao:2.4.0', 'operator', 'migrate', '-config=/run/migrate.hcl']);
    }
    const updatedConfig = previousConfig.replace('storage "file" {', 'cluster_addr = "https://openbao:8201"\nstorage "raft" {\n  node_id = "dxos-local-1"');
    const updatedCompose = previousCompose.replace('openbao_data:/openbao/file', 'openbao_raft_data:/openbao/file').replace('  openbao_data: {}', '  openbao_data: {}\n  openbao_raft_data: {}');
    fs.writeFileSync(configPath, updatedConfig); fs.writeFileSync(composePath, updatedCompose);
    run([...compose, 'up', '-d', '--no-build', 'openbao']);
    let ready = false;
    for (let i = 0; i < 25; i++) {
      try { const r = await fetch(address + '/v1/sys/init', { signal: AbortSignal.timeout(1500) }); if (r.ok && (await r.json()).initialized === true) { ready = true; break; } } catch { /* bounded startup wait */ }
      await pause(500);
    }
    if (!ready) throw new Error('Migrated store not initialized; refusing fresh initialization');
    const unseal = spawnSync(process.execPath, [path.join(root, 'backend/scripts/init-openbao-local.js')], { cwd: root, env: process.env, encoding: 'utf8' });
    if (unseal.status !== 0) throw new Error('Original seal material did not unseal migrated store');
    const after = await fingerprint();
    if (canonical(before) !== canonical(after)) throw new Error('Migrated data fingerprint mismatch');
    run([...compose, '--profile', 'app', 'up', '-d', '--no-build', 'openbao-agent', 'backend']);
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify({ status: 'PASS', completedAt: new Date().toISOString(), sourceVolume: oldVolume, migrationClone: adopting ? null : copyVolume, adoptedVerifiedCopy: adopting, targetVolume, originalSourcePreserved: true, fingerprintBefore: before, fingerprintAfter: after, applicationDatabaseChanged: false }, null, 2));
    console.log('OpenBao Raft migration PASS: original volume preserved; KV/policy/role fingerprints identical; original seal material reused.');
  } catch {
    if (stopped) {
      fs.writeFileSync(configPath, previousConfig); fs.writeFileSync(composePath, previousCompose);
      run([...compose, '-f', 'outputs/openbao-temporary-restore.yml', 'up', '-d', '--no-build', 'openbao']);
      await pause(1000);
      spawnSync(process.execPath, [path.join(root, 'backend/scripts/init-openbao-local.js')], { cwd: root, env: process.env, encoding: 'utf8' });
      run([...compose, '-f', 'outputs/openbao-temporary-restore.yml', '--profile', 'app', 'up', '-d', '--no-build', 'openbao-agent', 'backend']);
    }
    throw new Error('Raft migration verification failed; original source retained and rollback attempted');
  }
}
main().catch(() => { console.error('Raft migration blocked/rolled back; inspect state without printing secret values. No source volume deleted.'); process.exitCode = 1; });

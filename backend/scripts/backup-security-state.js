// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Consistent snapshots of only this task's Keycloak/OpenBao volumes before upgrade.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'outputs/security-backups', new Date().toISOString().replace(/[:.]/g, '-'));
const backupRoot = path.resolve(root, 'outputs/security-backups');
if (!path.resolve(output).startsWith(backupRoot + path.sep)) throw new Error('Unexpected backup path');
fs.mkdirSync(output, { recursive: true });
const run = args => { const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }); if (r.status !== 0) throw new Error('Docker backup operation failed'); return r.stdout; };
try {
  const mounts = JSON.parse(run(['inspect', 'dxos-security-openbao-1', '--format', '{{json .Mounts}}']));
  const active = mounts.find(m => m.Destination === '/openbao/file' && m.Type === 'volume');
  if (!active || !['dxos-security_openbao_data', 'dxos-security_openbao_raft_data'].includes(active.Name)) throw new Error('Unexpected active secret store');
  run(['stop', 'dxos-security-backend-1', 'dxos-security-openbao-agent-1', 'dxos-security-openbao-1', 'dxos-security-keycloak-1']);
  const rows = [];
  for (const [volume, file] of [['dxos-security_keycloak_data', 'keycloak-data.tar.gz'], [active.Name, 'openbao-data.tar.gz'], ['dxos-security_openbao_logs', 'openbao-audit.tar.gz']]) {
    if (run(['volume', 'inspect', volume, '--format', '{{.Name}}']).trim() !== volume) throw new Error('Unexpected volume');
    run(['run', '--rm', '--network', 'none', '-v', volume + ':/source:ro', '-v', output + ':/backup', 'alpine:3.23', 'tar', '-czf', '/backup/' + file, '-C', '/source', '.']);
    const bytes = fs.readFileSync(path.join(output, file)); rows.push({ volume, file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), private: true, requiredForRestore: 'Keep original ignored .secrets/openbao-bootstrap.json and TLS material. Never publish these archives.', rows }, null, 2));
  console.log('Consistent private security-state backup completed:', rows.length, 'volumes. Services remain stopped for controlled upgrade.');
} catch {
  // Do not leave the old stack down if snapshot creation failed.
  spawnSync('docker', ['start', 'dxos-security-openbao-1', 'dxos-security-keycloak-1'], { encoding: 'utf8' });
  console.error('Security-state backup failed; original data was not deleted. Unseal/restart with the local setup helper.'); process.exitCode = 1;
}

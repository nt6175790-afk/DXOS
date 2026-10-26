// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Fixed upstream sources only; downloads are legal texts, not project/runtime secrets.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const entries = [
  ['gosu', 'gosu (rebuilt with Go 1.27.2)', '1.19', 'Apache-2.0', 'https://raw.githubusercontent.com/tianon/gosu/6456aaa0f3c854d199d0f037f068eb97515b7513/LICENSE'],
  ['apache-2.0', 'Apache License 2.0', '2.0', 'Apache-2.0', 'https://www.apache.org/licenses/LICENSE-2.0.txt'],
  ['keycloak', 'Keycloak', '26.8.1', 'Apache-2.0', 'https://raw.githubusercontent.com/keycloak/keycloak/26.8.1/LICENSE.txt'],
  ['apisix', 'Apache APISIX', '3.19.0', 'Apache-2.0', 'https://raw.githubusercontent.com/apache/apisix/3.19.0/LICENSE'],
  ['apisix-notice', 'Apache APISIX notices', '3.19.0', 'NOTICE', 'https://raw.githubusercontent.com/apache/apisix/3.19.0/NOTICE'],
  ['openbao', 'OpenBao', '2.7.1', 'MPL-2.0', 'https://raw.githubusercontent.com/openbao/openbao/v2.7.1/LICENSE'],
  ['valkey', 'Valkey', '9.1.2', 'BSD-3-Clause', 'https://raw.githubusercontent.com/valkey-io/valkey/9.1.2/COPYING'],
  ['clamav', 'ClamAV', '1.4.4', 'GPL-2.0', 'https://raw.githubusercontent.com/Cisco-Talos/clamav/clamav-1.4.4/COPYING.txt'],
  ['trivy', 'Trivy', '0.76.0', 'Apache-2.0', 'https://raw.githubusercontent.com/aquasecurity/trivy/v0.76.0/LICENSE'],
  ['inter', 'Inter font', '4.1', 'OFL-1.1', 'https://raw.githubusercontent.com/rsms/inter/v4.1/LICENSE.txt'],
  ['node', 'Node.js container runtime and bundled components', '22.23.3', 'MIT and bundled licenses', 'https://raw.githubusercontent.com/nodejs/node/v22.23.3/LICENSE'],
  ['node-local', 'Node.js local tooling and bundled components', '22.21.1', 'MIT and bundled licenses', 'https://raw.githubusercontent.com/nodejs/node/v22.21.1/LICENSE'],
];
async function main() {
  const directory = path.join(root, 'licenses', 'infrastructure'); fs.mkdirSync(directory, { recursive: true });
  const results = await Promise.all(entries.map(async ([id, component, version, license, source]) => {
    try {
      const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error();
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 2 * 1024 * 1024 || /<html/i.test(bytes.toString())) throw new Error();
      const file = `infrastructure/${id}.txt`; fs.writeFileSync(path.join(root, 'licenses', file), bytes);
      if (id === 'apache-2.0') fs.writeFileSync(path.join(root, 'LICENSE'), bytes);
      return { component, version, license, source, file, sha256: createHash('sha256').update(bytes).digest('hex'), status: 'TEXT_COLLECTED' };
    } catch { return { component, version, license, source, status: 'MISSING_TEXT' }; }
  }));
  fs.writeFileSync(path.join(directory, 'inventory.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ collected: results.filter(r => r.status === 'TEXT_COLLECTED').length, missing: results.filter(r => r.status !== 'TEXT_COLLECTED') }, null, 2));
  if (results.some(r => r.status !== 'TEXT_COLLECTED')) process.exitCode = 1;
}
main().catch(() => { console.error('Upstream license collection failed.'); process.exitCode = 1; });

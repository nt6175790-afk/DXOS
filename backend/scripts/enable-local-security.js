// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Add local SSO/scanning settings after validation. Existing passwords/JWT keys are preserved.
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
async function main() {
  const discovery = await fetch('http://localhost:8180/realms/dxos/.well-known/openid-configuration');
  if (!discovery.ok || (await discovery.json()).issuer !== 'http://localhost:8180/realms/dxos') throw new Error();
  const settings = { SSO_ENABLED: 'true', SSO_ISSUER: 'http://localhost:8180/realms/dxos', SSO_CLIENT_ID: 'dxos-web',
    SSO_REDIRECT_URI: 'http://localhost:5173/auth/sso/callback', FILE_SCAN_ENABLED: 'true',
    CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '3310', CLAMAV_TIMEOUT_MS: '30000' };
  for (const file of ['.env', 'backend/.env']) {
    const path = resolve(root, file); if (!existsSync(path)) continue;
    const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(line => !Object.keys(settings).some(key => line.startsWith(key + '=')));
    writeFileSync(path, lines.join('\n').trimEnd() + '\n' + Object.entries(settings).map(([k,v])=>k+'='+v).join('\n') + '\n');
  }
  console.log('Local SSO and antivirus enabled; existing credentials preserved. Restart backend to load settings.');
}
main().catch(() => { console.error('Local security activation failed. Check local IdP readiness.'); process.exitCode = 1; });

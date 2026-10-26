// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Update only the existing local public client's allowlisted logout return URLs.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
async function main() {
  const env = fs.readFileSync(path.join(root, '.security.local.env'), 'utf8');
  const password = /^KEYCLOAK_ADMIN_PASSWORD=(.+)$/m.exec(env)?.[1]?.trim();
  if (!password) throw new Error('Missing operator material');
  const base = 'http://localhost:8180';
  const auth = await fetch(base + '/realms/master/protocol/openid-connect/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username: 'dxos-operator', password }),
  });
  if (!auth.ok) throw new Error('Operator authentication failed');
  const token = (await auth.json()).access_token;
  const call = (url, options = {}) => fetch(base + url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
  const response = await call('/admin/realms/dxos/clients?clientId=dxos-web');
  if (!response.ok) throw new Error('Client lookup failed');
  const clients = await response.json();
  if (clients.length !== 1 || !clients[0].publicClient || clients[0].clientId !== 'dxos-web') throw new Error('Unexpected client');
  const client = clients[0];
  client.attributes = { ...client.attributes, 'post.logout.redirect.uris': 'http://localhost:5173/login##http://localhost:8088/login' };
  const updated = await call('/admin/realms/dxos/clients/' + encodeURIComponent(client.id), { method: 'PUT', body: JSON.stringify(client) });
  if (updated.status !== 204) throw new Error('Client update failed');
  console.log('Existing Keycloak client logout return URLs configured; credentials/users/roles preserved.');
}
main().catch(() => { console.error('Local Keycloak configuration failed; no tokens/passwords printed.'); process.exitCode = 1; });

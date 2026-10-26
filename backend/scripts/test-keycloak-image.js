// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Real S256/OIDC login against a disposable Keycloak image. Never uses operator config, realms, users or secrets.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes, createHash, createPublicKey, verify } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const image = 'dxos-security-keycloak';
const name = 'dxos-keycloak-probe-' + randomBytes(6).toString('hex');
const password = randomBytes(32).toString('base64url');
const environment = { ...process.env, KC_BOOTSTRAP_ADMIN_USERNAME: 'runtime-probe-admin', KC_BOOTSTRAP_ADMIN_PASSWORD: password };
const checks = [];
let container;
let phase = 'image-version';
// AbortSignal.timeout is unref'ed; keep a standalone probe alive while a fetch is pending.
const keepAlive = setInterval(() => {}, 1000);
const deadline = setTimeout(() => {
  console.error('Live Keycloak image timed out at:', phase, '(credentials suppressed)');
  if (container && /^[a-f0-9]{64}$/.test(container)) { try { docker(['rm', '-f', container]); } catch { /* fail closed */ } }
  process.exit(1);
}, 180000);
function docker(args) { return execFileSync('docker', args, { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }).trim(); }
function checked(name, actual, expected) { assert.deepEqual(actual, expected); checks.push(name); }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(url, options = {}) { return fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(10000) }); }
async function main() {
  const version = docker(['run', '--rm', image, '--version']);
  assert(version.includes('Keycloak 26.8.1') && /21\.0\.13/.test(version)); checks.push('Keycloak 26.8.1 on patched Java 21');
  phase = 'disposable-start';
  container = docker(['run', '-d', '--name', name, '--label', 'dxos.validation=keycloak-runtime',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/opt/keycloak/data:uid=1000,gid=0,mode=0770',
    '-p', '127.0.0.1::8080', '-e', 'KC_BOOTSTRAP_ADMIN_USERNAME', '-e', 'KC_BOOTSTRAP_ADMIN_PASSWORD', image,
    'start-dev', '--hostname-strict=false']);
  assert(/^[a-f0-9]{64}$/.test(container));
  const address = docker(['port', container, '8080/tcp']); assert(/^127\.0\.0\.1:\d+$/.test(address));
  const base = 'http://' + address;
  phase = 'readiness';
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await request(base + '/realms/master/.well-known/openid-configuration')).status === 200) { ready = true; break; } } catch { /* bounded startup */ }
    await pause(1000);
  }
  assert(ready); checks.push('Disposable server discovery ready');
  phase = 'ephemeral-realm';
  const admin = await request(base + '/realms/master/protocol/openid-connect/token', { method: 'POST',
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: environment.KC_BOOTSTRAP_ADMIN_USERNAME, password }) });
  assert.equal(admin.status, 200); const adminToken = (await admin.json()).access_token; assert(adminToken);
  const headers = { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' };
  const realm = 'dxos-runtime-probe';
  checked('Ephemeral realm created', (await request(base + '/admin/realms', { method: 'POST', headers,
    body: JSON.stringify({ realm, enabled: true, sslRequired: 'none' }) })).status, 201);
  const clientId = 'dxos-runtime-probe';
  const redirectUri = 'http://127.0.0.1:58081/callback';
  checked('Public client requires S256', (await request(base + '/admin/realms/' + realm + '/clients', { method: 'POST', headers,
    body: JSON.stringify({ clientId, enabled: true, publicClient: true, standardFlowEnabled: true, directAccessGrantsEnabled: false,
      redirectUris: [redirectUri], attributes: { 'pkce.code.challenge.method': 'S256' } }) })).status, 201);
  const username = 'runtime-probe-user';
  checked('Ephemeral test user created', (await request(base + '/admin/realms/' + realm + '/users', { method: 'POST', headers,
    body: JSON.stringify({ username, enabled: true, emailVerified: true, email: 'runtime-probe@example.test',
      firstName: 'Runtime', lastName: 'Probe', requiredActions: [], credentials: [{ type: 'password', value: password, temporary: false }] }) })).status, 201);
  const issuer = base + '/realms/' + realm;
  const discovery = await (await request(issuer + '/.well-known/openid-configuration')).json();
  assert.equal(new URL(discovery.token_endpoint).origin, base); assert.equal(new URL(discovery.jwks_uri).origin, base);
  checked('Issuer and S256 discovery', [discovery.issuer, discovery.code_challenge_methods_supported.includes('S256')], [issuer, true]);
  phase = 'pkce-required';
  const state = randomBytes(24).toString('base64url'); const nonce = randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const authorization = new URL(discovery.authorization_endpoint);
  assert.equal(authorization.origin, base);
  for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid', state, nonce })) authorization.searchParams.set(key, value);
  const withoutPkce = await request(authorization);
  let denied = withoutPkce.status === 400;
  if (withoutPkce.status === 302) {
    const rejected = new URL(withoutPkce.headers.get('location'));
    denied = rejected.origin + rejected.pathname === redirectUri && rejected.searchParams.get('error') === 'invalid_request' && !rejected.searchParams.has('code');
  }
  checked('Authorization without PKCE denied', denied, true);
  authorization.searchParams.set('code_challenge_method', 'S256');
  authorization.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
  phase = 's256-login';
  const page = await request(authorization); assert.equal(page.status, 200);
  const cookies = page.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const html = await page.text();
  const form = (html.match(/<form\b[^>]*>/gi) ?? []).find(tag => tag.includes('kc-form-login')); assert(form);
  const action = /\baction="([^"]+)"/.exec(form)?.[1]; assert(action);
  const actionUrl = new URL(action.replace(/&amp;/g, '&')); assert.equal(actionUrl.origin, base);
  const login = await request(actionUrl, { method: 'POST', headers: { Cookie: cookies }, body: new URLSearchParams({ username, password }) });
  assert.equal(login.status, 302);
  const callback = new URL(login.headers.get('location')); assert.equal(callback.origin + callback.pathname, redirectUri);
  checked('Login state preserved', callback.searchParams.get('state'), state);
  const code = callback.searchParams.get('code'); assert(code);
  phase = 'token-exchange';
  const formBody = { grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri, code, code_verifier: verifier };
  const exchange = await request(discovery.token_endpoint, { method: 'POST', body: new URLSearchParams(formBody) });
  checked('S256 code exchange succeeds', exchange.status, 200);
  const token = (await exchange.json()).id_token; assert(token);
  const [encodedHeader, encodedClaims, signature] = token.split('.');
  const tokenHeader = JSON.parse(Buffer.from(encodedHeader, 'base64url'));
  const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url'));
  assert.equal(tokenHeader.alg, 'RS256');
  const jwks = await (await request(discovery.jwks_uri)).json(); const key = jwks.keys.find(k => k.kid === tokenHeader.kid); assert(key);
  assert(verify('RSA-SHA256', Buffer.from(encodedHeader + '.' + encodedClaims), createPublicKey({ key, format: 'jwk' }), Buffer.from(signature, 'base64url')));
  assert.equal(claims.iss, issuer); assert.equal(claims.nonce, nonce);
  assert((Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(clientId));
  assert(claims.sub && claims.exp > Date.now() / 1000); checks.push('ID token signature, issuer, audience, nonce and expiry valid');
  checked('Authorization code replay denied', (await request(discovery.token_endpoint, { method: 'POST', body: new URLSearchParams(formBody) })).status, 400);
  const artifact = path.resolve(__dirname, '../../security-artifacts/keycloak-live-smoke.json');
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, JSON.stringify({ status: 'PASS', image: docker(['image', 'inspect', image, '--format', '{{.Id}}']), checks }, null, 2));
  console.log('Live Keycloak image:', checks.length, 'checks PASS (S256 login and signed ID token; no credentials printed).');
}
main().catch(() => { console.error('Live Keycloak image FAIL at:', phase, '(response bodies and credentials suppressed)'); process.exitCode = 1; })
  .finally(() => { clearInterval(keepAlive); clearTimeout(deadline);
    if (container && /^[a-f0-9]{64}$/.test(container) && /^dxos-keycloak-probe-[a-f0-9]{12}$/.test(name)) {
    try { docker(['rm', '-f', container]); } catch { console.error('Disposable Keycloak cleanup failed'); process.exitCode = 1; }
  } });

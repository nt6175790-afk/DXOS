// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Real OIDC HTTP/JWKS/signature checks against a disposable protocol fixture, not a live IdP.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { generateKeyPairSync, createHash, randomBytes } = require('node:crypto');
const { sign } = require('jsonwebtoken');
const { OidcProvider } = require('../dist/modules/auth/oidc.provider');

async function main() {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const verifier = randomBytes(32).toString('base64url');
  let issuer; let count = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/.well-known/openid-configuration')) {
      res.end(JSON.stringify({ issuer, authorization_endpoint: issuer + '/auth', token_endpoint: issuer + '/token', jwks_uri: issuer + '/jwks',
        response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] }));
    } else if (req.url.endsWith('/jwks')) {
      res.end(JSON.stringify({ keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'fixture-key', use: 'sig', alg: 'RS256' }] }));
    } else if (req.url.endsWith('/token')) {
      let body = ''; for await (const chunk of req) body += chunk;
      const form = new URLSearchParams(body); const code = form.get('code');
      if (form.get('code_verifier') !== verifier) { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_grant' })); return; }
      const jwt = sign({ sub: 'external-subject', nonce: code === 'bad-nonce' ? 'foreign' : 'expected-nonce' },
        code === 'bad-signature' ? other.privateKey : keys.privateKey,
        { algorithm: 'RS256', keyid: 'fixture-key', issuer: code === 'bad-issuer' ? issuer + '/foreign' : issuer,
          audience: code === 'bad-audience' ? 'foreign-app' : 'dxos-web', expiresIn: code === 'expired' ? -120 : 120 });
      res.end(JSON.stringify({ token_type: 'Bearer', access_token: 'fixture-access-token', expires_in: 120, id_token: jwt }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${server.address().port}/realms/fixture`;
  const settings = { issuer, clientId: 'dxos-web', redirectUri: 'http://localhost:5173/auth/sso/callback', insecure: true };
  const provider = new OidcProvider();
  try {
    const url = new URL(await provider.authorize(settings, 'expected-state', 'expected-nonce', verifier));
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url')); count++;
    assert.equal(await provider.subject(settings, 'valid', 'expected-state', 'expected-nonce', verifier), 'external-subject'); count++;
    for (const code of ['bad-nonce', 'bad-signature', 'bad-issuer', 'bad-audience', 'expired']) {
      await assert.rejects(provider.subject(settings, code, 'expected-state', 'expected-nonce', verifier)); count++;
    }
    await assert.rejects(provider.subject(settings, 'valid', 'expected-state', 'expected-nonce', 'wrong-verifier')); count++;
    console.log(`OIDC protocol fixture: ${count} checks PASS (not live Keycloak).`);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(() => { console.error('OIDC protocol verification failed. No provider tokens logged.'); process.exitCode = 1; });

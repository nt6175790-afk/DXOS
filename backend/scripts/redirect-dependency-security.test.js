// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Exercise the installed frontend dependency against two loopback HTTP origins.
// All header values are synthetic test data; no operator credential is loaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const path = require('node:path');
const redirectHttp = createRequire(path.resolve(__dirname, '../../frontend/package.json'))('follow-redirects').http;

async function listen(handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, port: server.address().port };
}

function get(port, headers, route = '/') {
  return new Promise((resolve, reject) => {
    const request = redirectHttp.get({ hostname: '127.0.0.1', port, path: route,
      headers, sensitiveHeaders: ['X.Auth+Token'], timeout: 3000 }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Loopback redirect timed out')));
    request.on('error', reject);
  });
}

async function fixture(t) {
  const echo = (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.headers));
  };
  const target = await listen(echo);
  const source = await listen((request, response) => {
    if (request.url === '/destination') return echo(request, response);
    response.writeHead(302, { Location: request.url === '/same-origin' ? '/destination' :
      `http://127.0.0.1:${target.port}/destination` });
    response.end();
  });
  t.after(() => Promise.all([source.server, target.server].map(server => new Promise(resolve => server.close(resolve)))));
  return source.port;
}

test('cross-origin redirect strips configured sensitive header containing regexp metacharacters', async t => {
  const headers = await get(await fixture(t), { 'X.Auth+Token': 'synthetic-value', 'X-Public': 'public-value' });
  assert.equal(headers['x.auth+token'], undefined);
  assert.equal(headers['x-public'], 'public-value');
});

test('cross-origin redirect strips sensitive fields supplied as raw header arrays', async t => {
  const headers = await get(await fixture(t), ['Authorization', 'synthetic-value', 'Cookie', 'fixture=value',
    'Proxy-Authorization', 'synthetic-value', 'X.Auth+Token', 'synthetic-value', 'X-Public', 'public-value']);
  for (const key of ['authorization', 'cookie', 'proxy-authorization', 'x.auth+token']) assert.equal(headers[key], undefined);
  assert.equal(headers['x-public'], 'public-value');
});

test('same-origin redirect preserves intended authentication and public headers', async t => {
  const headers = await get(await fixture(t), { Authorization: 'synthetic-value',
    'X.Auth+Token': 'synthetic-value', 'X-Public': 'public-value' }, '/same-origin');
  assert.equal(headers.authorization, 'synthetic-value');
  assert.equal(headers['x.auth+token'], 'synthetic-value');
  assert.equal(headers['x-public'], 'public-value');
});

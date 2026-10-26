// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Copies required settings into ignored local container configuration; never prints values.
const { existsSync, writeFileSync, appendFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { homedir } = require('node:os');
const root = resolve(__dirname, '../..');
for (const path of [join(root, '.env'), join(root, 'backend/.env')]) if (existsSync(path)) process.loadEnvFile(path);
try {
  const target = join(root, '.security.backend.env');
  if (existsSync(target)) { console.log('Existing container configuration preserved.'); process.exit(0); }
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error();
  database.hostname = 'host.docker.internal';
  if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) throw new Error();
  // AI agent settings (README "Trợ lý AI"); a model server on the host is reached through host.docker.internal.
  const ai = {};
  if (process.env.AI_BASE_URL) {
    const base = new URL(process.env.AI_BASE_URL);
    if (['localhost', '127.0.0.1'].includes(base.hostname)) base.hostname = 'host.docker.internal';
    ai.AI_BASE_URL = base.href.replace(/\/+$/, '');
  }
  // Unset keys keep the backend defaults for the chosen provider (e.g. AI_MODEL gpt-oss:120b for ollama, mock-v1 for mock).
  for (const key of ['AI_MODEL', 'AI_REASONING_EFFORT', 'AI_AGENT_MAX_STEPS', 'AI_AGENT_TOTAL_TIMEOUT_MS', 'AI_TIMEOUT_MS']) if (process.env[key]) ai[key] = process.env[key];
  const env = { NODE_ENV: 'development', DATABASE_URL: database.href, JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
    API_PREFIX: 'api/v1', LOG_LEVEL: 'info', SWAGGER_ENABLED: 'true', CORS_ORIGINS: 'http://localhost:8088',
    AI_PROVIDER: process.env.AI_PROVIDER ?? 'mock', ...ai,
    ...(process.env.AI_API_KEY ? { AI_API_KEY: process.env.AI_API_KEY } : {}),
    SSO_ENABLED: 'true', SSO_ISSUER: 'http://localhost:8180/realms/dxos', SSO_CLIENT_ID: 'dxos-web',
    SSO_REDIRECT_URI: 'http://localhost:8088/auth/sso/callback', SSO_BACKCHANNEL_ORIGIN: 'http://keycloak:8080',
    VAULT_ENABLED: 'false' };
  writeFileSync(target, Object.entries(env).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n', { flag: 'wx', mode: 0o600 });
  const privateRoot = process.env.FILE_STORAGE_ROOT || join(homedir(), '.dx-os/files');
  if (!existsSync(privateRoot)) throw new Error('Configure existing private storage before enabling app profile');
  appendFileSync(join(root, '.security.local.env'), 'DXOS_PRIVATE_FILE_ROOT='+JSON.stringify(privateRoot.replace(/\\/g,'/'))+'\n');
  console.log('Private local container environment created. Existing .env files preserved.');
} catch { console.error('Container configuration failed. Verify local MySQL, JWT and private file storage settings.'); process.exitCode = 1; }

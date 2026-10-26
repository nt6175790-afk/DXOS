// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const allowed = new Set(['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'AI_API_KEY', 'SSO_CLIENT_SECRET']);

export async function loadVaultSecrets(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!env.VAULT_ENABLED || env.VAULT_ENABLED === 'false') return;
  if (env.VAULT_ENABLED !== 'true') throw new Error('Invalid VAULT_ENABLED');
  try {
    const address = new URL(env.VAULT_ADDR ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname);
    if (address.username || address.password || address.search || address.hash || address.pathname !== '/' ||
      (address.protocol !== 'https:' && !(address.protocol === 'http:' && local && env.NODE_ENV !== 'production'))) throw new Error();
    const tokenFile = env.VAULT_TOKEN_FILE;
    if (!tokenFile || !isAbsolute(tokenFile) || (await stat(tokenFile)).size > 8192) throw new Error();
    const token = (await readFile(tokenFile, 'utf8')).trim();
    if (!token || /\s/.test(token)) throw new Error();
    const path = env.VAULT_SECRET_PATH ?? 'secret/data/dxos';
    if (!/^[a-zA-Z0-9_-]+\/data\/[a-zA-Z0-9_/-]+$/.test(path) || path.includes('..')) throw new Error();
    const response = await fetch(new URL('/v1/' + path, address), {
      headers: { 'X-Vault-Token': token }, redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error();
    const body = await response.text();
    if (Buffer.byteLength(body) > 65536) throw new Error();
    const data = (JSON.parse(body) as { data?: { data?: Record<string, unknown> } }).data?.data;
    if (!data || !Object.keys(data).length) throw new Error();
    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!allowed.has(key) || typeof value !== 'string' || !value || value.length > 16384) throw new Error();
      updates[key] = value;
    }
    Object.assign(env, updates);
  } catch { throw new Error('Vault bootstrap failed; startup stopped.'); }
}

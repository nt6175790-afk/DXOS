// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadVaultSecrets } from '../../backend/src/config/vault';

describe('OpenBao/Vault bootstrap boundary', () => {
  let directory: string; let env: NodeJS.ProcessEnv; const originalFetch = global.fetch;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dxos-vault-test-')); const file = join(directory, 'token');
    await writeFile(file, 'unit-test-only-token');
    env = { VAULT_ENABLED: 'true', VAULT_ADDR: 'https://vault.example.test', VAULT_TOKEN_FILE: file, NODE_ENV: 'test' };
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ data: { data: { JWT_ACCESS_SECRET: 'unit-secret-from-vault' } } }), { status: 200 }));
  });
  afterEach(async () => { global.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); });
  it('leaves env unchanged when disabled', async () => {
    await loadVaultSecrets({ VAULT_ENABLED: 'false' }); expect(fetch).not.toHaveBeenCalled();
  });
  it('loads only allowlisted secrets without returning/logging them', async () => {
    await expect(loadVaultSecrets(env)).resolves.toBeUndefined(); expect(env.JWT_ACCESS_SECRET).toBe('unit-secret-from-vault');
    expect(fetch).toHaveBeenCalledWith(new URL('https://vault.example.test/v1/secret/data/dxos'), expect.objectContaining({ redirect: 'error' }));
  });
  it.each(['NODE_ENV', 'PATH', 'SSO_ISSUER'])('rejects provider-controlled environment key %s atomically', async key => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ data: { data: { JWT_ACCESS_SECRET: 'secret', [key]: 'untrusted' } } })));
    await expect(loadVaultSecrets(env)).rejects.toThrow('Vault bootstrap failed'); expect(env.JWT_ACCESS_SECRET).toBeUndefined();
  });
  it('fails closed on denied/malformed provider responses', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('denied', { status: 403 }));
    await expect(loadVaultSecrets(env)).rejects.toThrow('Vault bootstrap failed');
  });
  it('rejects remote HTTP and HTTP in production', async () => {
    for (const settings of [{ VAULT_ADDR: 'http://remote.test:8200' }, { VAULT_ADDR: 'http://localhost:8200', NODE_ENV: 'production' }]) {
      await expect(loadVaultSecrets({ ...env, ...settings })).rejects.toThrow('Vault bootstrap failed');
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

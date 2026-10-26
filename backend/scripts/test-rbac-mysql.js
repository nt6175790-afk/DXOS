// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Creates and removes ONLY uniquely named disposable databases for this run.
const { randomBytes } = require('node:crypto');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const root = resolve(__dirname, '../..');
if (!process.env.DATABASE_URL && existsSync(resolve(root, 'backend/.env'))) {
  process.loadEnvFile(resolve(root, 'backend/.env'));
}
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error('DATABASE_URL is required for isolated MySQL testing.');
const suffix = randomBytes(8).toString('hex');
const names = [`dx_os_rbac_test_${suffix}`, `dx_os_rbac_shadow_${suffix}`];
const created = [];
const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
const urlFor = (name) => {
  const url = new URL(baseUrl);
  url.pathname = '/' + name;
  return url.toString();
};
const env = {
  ...process.env,
  DATABASE_URL: urlFor(names[0]),
  RBAC_TEST_DATABASE_URL: urlFor(names[0]),
  SHADOW_DATABASE_URL: urlFor(names[1]),
  NODE_ENV: 'test',
  AI_PROVIDER: 'mock', AI_MODEL: 'mock-v1', AI_API_KEY: 'test-only-not-a-real-provider-key',
  SSO_ENABLED: 'false', FILE_SCAN_ENABLED: 'false', VAULT_ENABLED: 'false', REDIS_URL: '',
};
function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root, env, encoding: 'utf8',
  });
  // Scrub connection strings defensively before surfacing subprocess diagnostics.
  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output.replace(/mysql:\/\/[^\s"']+/g, '[DATABASE_URL]'));
  if (result.status !== 0) throw new Error('MySQL validation subprocess failed.');
}
async function main() {
  try {
    for (const name of names) {
      if (!/^dx_os_rbac_(test|shadow)_[a-f0-9]{16}$/.test(name)) throw new Error('Invalid disposable database name.');
      await admin.$executeRawUnsafe(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      created.push(name);
    }
    run(resolve(__dirname, 'validate-initial-migration.js'));
    const cli = require.resolve('prisma/build/index.js');
    const schema = resolve(root, 'database/schema.prisma');
    run(cli, ['migrate', 'deploy', '--schema', schema]);
    run(cli, ['migrate', 'status', '--schema', schema]);
    run(cli, ['migrate', 'diff', '--from-schema-datasource', schema,
      '--to-schema-datamodel', schema, '--exit-code']);
    run(require.resolve('jest/bin/jest'), ['--config', 'jest.config.cjs', '--runInBand', ...process.argv.slice(2)]);
  } finally {
    for (const name of created.reverse()) {
      await admin.$executeRawUnsafe(`DROP DATABASE \`${name}\``);
    }
    await admin.$disconnect();
  }
}
main().catch(() => {
  console.error('Isolated MySQL RBAC validation failed; check safe diagnostics above.');
  process.exitCode = 1;
});

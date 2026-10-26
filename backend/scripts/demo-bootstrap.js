// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// The one-shot container shares only the isolated demo MySQL network namespace.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function run(label, args) {
  console.log('Demo setup:', label);
  // Do not forward subprocess output: it may contain connection strings.
  const result = spawnSync(process.execPath, args, { cwd: root, env: process.env, stdio: 'pipe', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) {
    const safe = (result.stderr?.toString() ?? '').split(/\r?\n/).filter(line => /^[A-Z_]+(?: [A-Za-z]+ [A-Z0-9_]+)?$/.test(line));
    for (const code of safe) console.error(code);
    throw new Error(label);
  }
}
try {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'development' || url.hostname !== 'localhost' || url.pathname !== '/dx_os') throw new Error('demo-only context');
  const prisma = require.resolve('prisma/build/index.js');
  const schema = ['--schema', 'database/schema.prisma'];
  run('Prisma validate', [prisma, 'validate', ...schema]);
  run('Migration deploy', [prisma, 'migrate', 'deploy', ...schema]);
  run('Migration status', [prisma, 'migrate', 'status', ...schema]);
  run('Live schema drift', [prisma, 'migrate', 'diff', '--from-schema-datasource', 'database/schema.prisma', '--to-schema-datamodel', 'database/schema.prisma', '--exit-code']);
  const tsx = require.resolve('tsx/cli');
  // Docker starts at /app, unlike npm workspace scripts which start in backend/.
  // Pin the existing backend compiler config so parameter decorators still work.
  const tsconfig = ['--tsconfig', 'backend/tsconfig.json'];
  run('Demo administrator', [tsx, ...tsconfig, 'backend/scripts/seed-demo-admin.ts']);
  run('Demo dataset', [tsx, ...tsconfig, 'backend/scripts/demo-container-seed.ts']);
  run('Agreed business roles', [tsx, ...tsconfig, 'backend/scripts/seed-demo-roles.ts']);
  console.log('Demo migration/status/drift/seed PASS. Use the private local demo password to sign in.');
} catch (error) {
  console.error('Demo bootstrap stopped at a required setup step:', error.message === 'Invalid URL' ? 'database configuration' : error.message);
  process.exitCode = 1;
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateOrGeneratedPath, shouldExcludeFromSourceExport } = require('./source-publication-policy');

test('preserves the work module and its Windows path spelling', () => {
  for (const p of ['backend/src/modules/work/work.module.ts', 'backend\\src\\modules\\work\\task-policy.ts']) {
    assert.equal(isPrivateOrGeneratedPath(p), false);
    assert.equal(shouldExcludeFromSourceExport(p), false);
  }
});
test('excludes root workspace work while retaining nested business work paths', () => {
  assert.equal(shouldExcludeFromSourceExport('work/private-backup.json'), true);
  assert.equal(shouldExcludeFromSourceExport('frontend/src/features/work/Tasks.tsx'), false);
});
test('excludes private environments but preserves configuration templates', () => {
  for (const p of ['backend/.env', 'backend/.env.local', '.security.local.env', '.secrets/key.json']) assert.equal(isPrivateOrGeneratedPath(p), true);
  assert.equal(isPrivateOrGeneratedPath('backend/.env.example'), false);
});
test('excludes generated outputs without excluding nested business outputs', () => {
  assert.equal(isPrivateOrGeneratedPath('outputs/backup.json'), true);
  assert.equal(isPrivateOrGeneratedPath('frontend/node_modules/a/index.js'), true);
  assert.equal(isPrivateOrGeneratedPath('backend/src/modules/outputs/output.dto.ts'), false);
});
test('preserves SQL migrations and excludes database dumps', () => {
  assert.equal(shouldExcludeFromSourceExport('database/migrations/20260910000000_task_v1/migration.sql'), false);
  assert.equal(shouldExcludeFromSourceExport('dx_os.sql.gz'), true);
});
test('preserves legal notices and application assets', () => {
  for (const p of ['LICENSE', 'licenses/infrastructure/openbao.txt', 'frontend/public/fonts/InterVariable.woff2', 'frontend/public/dxos.svg']) assert.equal(shouldExcludeFromSourceExport(p), false);
});

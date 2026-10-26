// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join, resolve } = require('node:path');

const backendDirectory = resolve(__dirname, '..');
const projectRoot = resolve(backendDirectory, '..');
const environmentFile = join(backendDirectory, '.env');
const schemaFile = join(projectRoot, 'database', 'schema.prisma');
const migrationsDirectory = join(projectRoot, 'database', 'migrations');

if (!process.env.DATABASE_URL && existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

const migrationDirectories = readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (migrationDirectories.length === 0) {
  throw new Error('At least one committed Prisma migration is required.');
}

for (const directory of migrationDirectories) {
  const migrationFile = join(migrationsDirectory, directory, 'migration.sql');
  if (!existsSync(migrationFile) || readFileSync(migrationFile, 'utf8').trim().length === 0) {
    throw new Error(`Migration ${directory} must contain a non-empty migration.sql file.`);
  }
}

const migrationLock = readFileSync(join(migrationsDirectory, 'migration_lock.toml'), 'utf8');
if (!migrationLock.includes('provider = "mysql"')) {
  throw new Error('The active migration history must use the MySQL provider.');
}

const mysqlBaselineMigration = readFileSync(
  join(migrationsDirectory, '20260906220000_mysql_baseline', 'migration.sql'),
  'utf8',
);
const requiredMySqlBaselineFragments = [
  'CREATE TABLE `users`',
  'CHAR(36) NOT NULL',
  "ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')",
  'DATETIME(6)',
  'CREATE TABLE `auth_sessions`',
  '`auth_sessions_refresh_token_hash_key`',
  '`auth_sessions_user_id_fkey`',
  'ON DELETE RESTRICT ON UPDATE CASCADE',
];

if (requiredMySqlBaselineFragments.some((fragment) => !mysqlBaselineMigration.includes(fragment))) {
  throw new Error('MySQL baseline migration is missing a required database foundation change.');
}

if (!process.env.SHADOW_DATABASE_URL) {
  process.stdout.write(
    'MySQL migration files pass offline structural validation. Set SHADOW_DATABASE_URL to run the full Prisma history diff.\n',
  );
  process.exit(0);
}

const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    'migrate',
    'diff',
    '--from-migrations',
    migrationsDirectory,
    '--to-schema-datamodel',
    schemaFile,
    '--shadow-database-url',
    process.env.SHADOW_DATABASE_URL,
    '--script',
    '--exit-code',
  ],
  { cwd: backendDirectory, encoding: 'utf8', env: process.env },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

process.stdout.write('Prisma migration history matches database/schema.prisma.\n');

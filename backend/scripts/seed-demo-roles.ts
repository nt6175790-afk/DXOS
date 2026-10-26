// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DemoSeedError } from './demo/seed-demo-dataset';
import { seedDemoRoles } from './demo/seed-demo-roles';

// Local demo only: creates Nhân viên / Quản lý / Nhân sự roles for the AI permission demo. Run after seed:demo.
const envPath = resolve(__dirname, '../.env');
if (!process.env.DATABASE_URL && existsSync(envPath)) process.loadEnvFile(envPath);

seedDemoRoles(process.env).then((result) => {
  console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
}).catch((error: unknown) => {
  console.error(error instanceof DemoSeedError ? error.code : error instanceof Error ? error.name : 'Demo role seed failed.');
  process.exitCode = 1;
});

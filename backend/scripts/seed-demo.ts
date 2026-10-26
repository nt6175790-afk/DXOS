// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DemoSeedError, seedDemoDataset } from './demo/seed-demo-dataset';

// Same local .env convention as seed-demo-admin; explicit process env takes precedence.
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

seedDemoDataset(process.env).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: unknown) => {
  console.error(error instanceof DemoSeedError ? error.code : 'DEMO_SEED_FAILED_CHECK_LOCAL_DATABASE_AND_PRIVATE_STORAGE');
  process.exitCode = 1;
});

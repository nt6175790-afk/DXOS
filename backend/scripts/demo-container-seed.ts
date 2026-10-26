// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Reuse the existing seed; container diagnostics expose only error names/codes.
import { DemoSeedError, seedDemoDataset } from './demo/seed-demo-dataset';

void seedDemoDataset(process.env).then(() => {
  console.log('Container demo dataset ready.');
}).catch((error: unknown) => {
  if (error instanceof DemoSeedError) console.error(error.code);
  else {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'NO_CODE';
    const name = error instanceof Error ? error.name : 'UnknownError';
    console.error('DEMO_DATASET_DIAGNOSTIC', /^[A-Za-z]+$/.test(name) ? name : 'UnknownError', /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'NO_CODE');
  }
  process.exitCode = 1;
});

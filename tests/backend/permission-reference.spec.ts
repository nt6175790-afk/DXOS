// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERMISSION_CATALOG } from '../../backend/src/modules/rbac/permission-catalog';

describe('Published permission reference', () => {
  it('describes every catalog key exactly once in the complete tables', () => {
    const doc = readFileSync(resolve(__dirname, '../../docs/architecture/permission-reference.md'), 'utf8');
    const keys = [...doc.matchAll(/^\| `([^`]+)` \|/gm)].map(m => m[1]);
    expect(keys.sort()).toEqual([...PERMISSION_CATALOG].sort());
  });
});

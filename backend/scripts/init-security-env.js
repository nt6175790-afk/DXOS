// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const { randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const target = resolve(__dirname, '../../.security.local.env');
try {
  writeFileSync(target, 'KEYCLOAK_ADMIN_PASSWORD=' + randomBytes(36).toString('base64url') + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Private security stack environment created; no credentials printed.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('Existing private security configuration preserved.');
  else { console.error('Could not create private security configuration.'); process.exitCode = 1; }
}

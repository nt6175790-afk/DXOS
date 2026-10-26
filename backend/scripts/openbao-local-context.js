// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
module.exports = function localOpenBaoContext(script) {
  const ca = resolve(__dirname, '../../.secrets/openbao-tls/ca.crt');
  if (existsSync(ca) && process.env.NODE_EXTRA_CA_CERTS !== ca) {
    const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { env: { ...process.env, NODE_EXTRA_CA_CERTS: ca }, stdio: 'inherit' });
    process.exit(result.status ?? 1);
  }
  return existsSync(ca) ? 'https://localhost:8200' : 'http://127.0.0.1:8200';
};

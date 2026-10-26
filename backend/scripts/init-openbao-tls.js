// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Local CA is trusted only by the DX-OS processes, never installed in the OS trust store.
const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const directory = resolve(__dirname, '../../.secrets/openbao-tls');
const openssl = process.env.DXOS_OPENSSL_PATH || 'C:/Program Files/Git/usr/bin/openssl.exe';
try {
  if (existsSync(resolve(directory, 'server.crt'))) { console.log('Existing OpenBao local TLS material preserved.'); process.exit(0); }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (existsSync(resolve(directory, 'ca.key')) || existsSync(resolve(directory, 'server.key'))) throw new Error();
  const run = args => { const result = spawnSync(openssl, args, { cwd: directory, encoding: 'utf8' }); if (result.status !== 0) throw new Error(); };
  run(['req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '365',
    '-subj', '/CN=DXOS Local Demo CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
  run(['req', '-new', '-newkey', 'rsa:3072', '-sha256', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=openbao']);
  writeFileSync(resolve(directory, 'server.ext'), 'subjectAltName=DNS:openbao,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=critical,CA:FALSE\n');
  run(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt', '-days', '90', '-sha256', '-extfile', 'server.ext']);
  console.log('OpenBao local TLS generated privately. OS trust store and ACL unchanged.');
} catch { console.error('Local TLS setup failed; existing material was not replaced. Check the installed OpenSSL path.'); process.exitCode = 1; }

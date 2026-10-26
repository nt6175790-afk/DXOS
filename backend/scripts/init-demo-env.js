// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Local demo only. Never print credentials or copy the operator's existing env.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

function initializeDemo(root, options = {}) {
  const port = String(options.port ?? '8090');
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('Invalid demo port');
  const directory = path.join(root, '.secrets', 'demo');
  for (const entry of [path.join(root, '.secrets'), directory]) {
    if (fs.existsSync(entry) && (fs.lstatSync(entry).isSymbolicLink() || !fs.lstatSync(entry).isDirectory())) throw new Error('Unsafe secret directory');
    fs.mkdirSync(entry, { recursive: true, mode: 0o700 });
  }
  const target = path.join(directory, 'compose.env');
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isSymbolicLink() || !fs.lstatSync(target).isFile()) throw new Error('Unsafe secret file');
    return { created: false, file: '.secrets/demo/compose.env' };
  }
  const secret = () => randomBytes(36).toString('base64url');
  const password = secret();
  const values = {
    DEMO_HTTP_PORT: port, MYSQL_ROOT_PASSWORD: secret(), MYSQL_DATABASE: 'dx_os', MYSQL_USER: 'dxos', MYSQL_PASSWORD: password,
    DATABASE_URL: `mysql://dxos:${password}@mysql:3306/dx_os`,
    DEMO_DATABASE_URL: `mysql://dxos:${password}@localhost:3306/dx_os`,
    JWT_ACCESS_SECRET: secret(), DEMO_ADMIN_EMAIL: 'admin.demo@dxos.local', DEMO_ADMIN_PASSWORD: secret(),
  };
  fs.writeFileSync(target, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  return { created: true, file: '.secrets/demo/compose.env' };
}

if (require.main === module) {
  try {
    const result = initializeDemo(path.resolve(__dirname, '../..'), { port: process.env.DEMO_HTTP_PORT });
    console.log(result.created ? 'Local demo configuration created in .secrets/demo/compose.env. No credentials printed.' : 'Existing demo configuration preserved; passwords unchanged.');
  } catch {
    console.error('Demo configuration failed. Check local path and DEMO_HTTP_PORT (1024-65535); no configuration was overwritten.');
    process.exitCode = 1;
  }
}
module.exports = { initializeDemo };

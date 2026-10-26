// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Create a new source-only checkout. Never copy or rewrite the original Git history.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { shouldExcludeFromSourceExport } = require('./source-publication-policy');
const root = path.resolve(__dirname, '../..');
const destinationArg = process.argv[2];
if (!destinationArg || !path.isAbsolute(destinationArg)) throw new Error('Pass a new absolute destination path');
const destination = path.resolve(destinationArg);
if (fs.existsSync(destination) || destination === root || destination.startsWith(root + path.sep)) throw new Error('Destination must be new and outside the original checkout');
const inventory = spawnSync('git', ['--git-dir=.git', '--work-tree=.', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
if (inventory.status !== 0) throw new Error('Source inventory failed');
const excluded = [], copied = [];
fs.mkdirSync(destination, { recursive: true });
for (const name of inventory.stdout.split('\0').filter(Boolean)) {
  if (shouldExcludeFromSourceExport(name)) {
    excluded.push(name); continue;
  }
  const from = path.resolve(root, name), to = path.resolve(destination, name);
  if (!from.startsWith(root + path.sep) || !to.startsWith(destination + path.sep)) throw new Error('Path escaped source boundary');
  if (!fs.existsSync(from)) continue; // A tracked deletion must not resurrect old source.
  if (!fs.lstatSync(from).isFile()) throw new Error('Nonregular source entry refused');
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const expected = hash(fs.readFileSync(from));
  if (hash(fs.readFileSync(to)) !== expected) throw new Error('Source copy verification failed');
  copied.push({ path: name, sha256: expected });
}
const init = spawnSync('git', ['init', '--initial-branch=main', destination], { encoding: 'utf8' });
if (init.status !== 0) throw new Error('Source copied but fresh Git initialization failed');
const check = spawnSync(process.execPath, ['backend/scripts/verify-git-publication.js'], { cwd: destination, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const report = { generatedAt: new Date().toISOString(), destination, status: check.status === 0 ? 'PASS' : 'BLOCKED',
  copiedFiles: copied.length, historyCopied: false, committed: false, pushed: false, excluded, copied };
fs.mkdirSync(path.join(root, 'outputs'), { recursive: true });
fs.writeFileSync(path.join(root, 'outputs/git-source-manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, destination, copiedFiles: copied.length, excludedFiles: excluded.length, historyCopied: false, committed: false, pushed: false }));
if (check.status !== 0) process.exitCode = 1;

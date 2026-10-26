// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Package committed source only. Local env, data, dependencies and history stay out.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isPrivateOrGeneratedPath } = require('./source-publication-policy');
const root = path.resolve(__dirname, '../..');
// Windows core.autocrlf must not rewrite release archive bytes or lockfile hashes.
const git = args => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', ...args], { cwd: root, maxBuffer: 30 * 1024 * 1024 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function packageRelease(tag) {
  if (!/^v\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(tag)) throw new Error('Explicit semantic version tag required');
  if (git(['status', '--porcelain']).toString().trim()) throw new Error('Working tree must be clean');
  const ref = 'refs/tags/' + tag;
  if (git(['cat-file', '-t', ref]).toString().trim() !== 'tag') throw new Error('Annotated tag required');
  const commit = git(['rev-parse', ref + '^{commit}']).toString().trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid commit');
  const files = git(['ls-tree', '-r', '--name-only', commit]).toString().trim().split('\n');
  if (files.some(isPrivateOrGeneratedPath)) throw new Error('Private/generated source path refused');
  for (const file of ['backend/src/modules/work/work.module.ts', 'database/schema.prisma', 'backend/deploy/compose.demo.yml', 'frontend/src/main.tsx', 'package-lock.json', 'frontend/package-lock.json', 'LICENSE']) {
    if (!files.includes(file)) throw new Error('Required source missing: ' + file);
  }
  const directory = path.join(root, 'outputs', 'releases', tag);
  // Refuse overwrite: an existing release asset must never silently change.
  fs.mkdirSync(directory, { recursive: true });
  const filename = `DXOS-${tag}-source.zip`;
  const tarName = `DXOS-${tag}-source.tar.gz`;
  const archive = path.join(directory, filename);
  const tarArchive = path.join(directory, tarName);
  if ([archive, tarArchive, path.join(directory, `DXOS-${tag}-manifest.json`), path.join(directory, 'SHA256SUMS.txt')].some(file => fs.existsSync(file))) throw new Error('Release archive already exists');
  git(['archive', '--format=zip', '--prefix=DXOS-' + tag + '/', '--output=' + archive, commit]);
  git(['archive', '--format=tar.gz', '--prefix=DXOS-' + tag + '/', '--output=' + tarArchive, commit]);
  const manifest = { tag, commit, sourceFileCount: files.length, sourceArchive: filename, sourceSha256: hash(fs.readFileSync(archive)),
    sourceArchives: [filename, tarName].map(name => ({ file: name, sha256: hash(fs.readFileSync(path.join(directory, name))) })),
    lockfiles: Object.fromEntries(['package-lock.json', 'frontend/package-lock.json'].map(file => [file, hash(git(['show', commit + ':' + file]))])),
    requiredEnvironment: { node: '22.21.1 or newer compatible Node 22', prisma: '6.19.3', mysql: '8.0.44', docker: 'Linux containers and Compose v2' },
    deployment: 'Local/demo. Credentials generated per installation; no public hosted demo or production certification.',
  };
  const manifestName = `DXOS-${tag}-manifest.json`;
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, manifestName), manifestBytes, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), manifest.sourceArchives.map(item => `${item.sha256}  ${item.file}\n`).join('') + `${hash(manifestBytes)}  ${manifestName}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ tag, commit, sourceFileCount: files.length, directory: 'outputs/releases/' + tag }));
}
try { packageRelease(process.argv[2]); } catch (error) { console.error('Release packaging stopped:', error.message); process.exitCode = 1; }

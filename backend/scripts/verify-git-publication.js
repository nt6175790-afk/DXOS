// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Read-only publication check. Never print matching contents or credential values.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isPrivateOrGeneratedPath } = require('./source-publication-policy');
const root = path.resolve(__dirname, '../..');
function git(args, input) {
  const r = spawnSync('git', ['--git-dir=.git', '--work-tree=.', ...args], {
    cwd: root, input, maxBuffer: 150 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error('Git inspection failed');
  return r.stdout;
}
const secrets = new Set();
function remember(value) { if (typeof value === 'string' && value.length >= 12) secrets.add(value); }
for (const file of ['backend/.env', '.security.local.env', '.security.backend.env']) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) continue;
  for (const line of fs.readFileSync(absolute, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (/SECRET|PASSWORD|TOKEN|API_KEY/.test(match[1])) remember(value);
    if (match[1] === 'DATABASE_URL') {
      try { remember(decodeURIComponent(new URL(value).password)); } catch { /* Invalid local URL is not printed. */ }
    }
  }
}
for (const file of ['.secrets/openbao-bootstrap.json', '.secrets/demo-sso-account.json']) {
  if (!fs.existsSync(path.join(root, file))) continue;
  function walk(value, sensitive = false) {
    if (typeof value === 'string') { if (sensitive) remember(value); return; }
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, sensitive || /token|key|password/i.test(key));
  }
  walk(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
}
for (const file of ['.secrets/openbao-app-token', '.secrets/openbao-approle/secret_id']) {
  if (fs.existsSync(path.join(root, file))) remember(fs.readFileSync(path.join(root, file), 'utf8').trim());
}
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['openai-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['aws-access-id', /\bAKIA[0-9A-Z]{16}\b/],
];
function findings(bytes) {
  const result = [];
  if ([...secrets].some(value => bytes.includes(Buffer.from(value)))) result.push('known-local-credential');
  const text = bytes.toString('utf8');
  for (const [name, pattern] of rules) if (pattern.test(text)) result.push(name);
  return result;
}
const paths = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean);
const current = [], suspiciousPaths = [], largeFiles = [];
let checked = 0;
for (const name of paths) {
  const file = path.join(root, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  if (isPrivateOrGeneratedPath(name)) suspiciousPaths.push(name);
  const size = fs.statSync(file).size;
  if (size > 10 * 1024 * 1024) largeFiles.push({ path: name, bytes: size });
  const matches = findings(fs.readFileSync(file)); checked++;
  if (matches.length) current.push({ path: name, categories: matches });
}
const objects = git(['rev-list', '--objects', '--all']).toString().trim().split('\n').filter(Boolean);
const history = [];
const raw = git(['cat-file', '--batch'], Buffer.from(objects.map(row => row.split(' ')[0]).join('\n') + '\n'));
let offset = 0, blobs = 0;
for (const row of objects) {
  const end = raw.indexOf(10, offset);
  const header = raw.subarray(offset, end).toString().split(' ');
  const size = Number(header[2]);
  if (end < 0 || !Number.isSafeInteger(size)) throw new Error('Invalid Git object response');
  const bytes = raw.subarray(end + 1, end + 1 + size); offset = end + 1 + size + 1;
  if (header[1] !== 'blob') continue;
  blobs++;
  const matches = findings(bytes);
  if (matches.length) history.push({ object: header[0].slice(0, 12), path: row.slice(row.indexOf(' ') + 1), categories: matches });
}
const status = !current.length && !history.length && !suspiciousPaths.length && !largeFiles.length ? 'PASS' : 'BLOCKED';
const report = { generatedAt: new Date().toISOString(), status, currentFilesChecked: checked, historyBlobsChecked: blobs,
  current, history, suspiciousPaths, largeFiles,
  scope: 'All reachable Git refs plus nonignored working files; known current credentials and selected high-confidence patterns. Not a guarantee against unknown secrets, image content or personal data.' };
fs.mkdirSync(path.join(root, 'outputs'), { recursive: true });
fs.writeFileSync(path.join(root, 'outputs/git-publication-check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (status !== 'PASS') process.exitCode = 1;

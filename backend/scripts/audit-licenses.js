// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Offline inventory of locked npm packages; unknown/custom/copyleft need explicit review.
const { readFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { createHash } = require('node:crypto');
const root = resolve(__dirname, '../..');
const permissive = new Set(['MIT', 'MIT-0', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'CC0-1.0', 'Unlicense', 'Python-2.0', 'BlueOak-1.0.0', 'CC-BY-4.0']);
const reviewedMitNotices = new Set(['d06b5d27bbbbe22c36b1fd88406b1208876e2d37d795f5b8eaed951a459a3111', '7c28463b739e2e73a49bf127d0bda427f8c55f0b37365a044c3c3f254716118b']);
function approvedExpression(expression) {
  // Parse SPDX AND/OR precedence and parentheses. Unknown/WITH expressions fail closed.
  const tokens = expression.match(/[A-Za-z0-9.+-]+|[()]/g) ?? []; let index = 0;
  if (tokens.join('') !== expression.replace(/\s/g, '')) return false;
  function primary() {
    if (tokens[index] === '(') { index++; const result = or(); if (tokens[index++] !== ')') throw new Error(); return result; }
    const token = tokens[index++]; if (!token || ['AND', 'OR', ')'].includes(token)) throw new Error(); return permissive.has(token);
  }
  function and() { let result = primary(); while (tokens[index] === 'AND') { index++; const right = primary(); result = result && right; } return result; }
  function or() { let result = and(); while (tokens[index] === 'OR') { index++; const right = and(); result = result || right; } return result; }
  try { const result = or(); return index === tokens.length && result; } catch { return false; }
}
const rows = [];
for (const area of ['', 'frontend']) {
  const lock = JSON.parse(readFileSync(join(root, area, 'package-lock.json'), 'utf8'));
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path.includes('node_modules/') || entry.link) continue;
    let license = entry.license;
    const metadata = join(root, area, path, 'package.json');
    if (!license && existsSync(metadata)) license = JSON.parse(readFileSync(metadata, 'utf8')).license;
    if (license && typeof license === 'object') license = license.type;
    license = typeof license === 'string' ? license : 'UNKNOWN';
    const notice = join(root, area, path, 'LICENSE');
    if (license === 'UNKNOWN' && existsSync(notice) && reviewedMitNotices.has(createHash('sha256').update(readFileSync(notice)).digest('hex'))) license = 'MIT';
    const approved = approvedExpression(license);
    rows.push({ area: area || 'backend', name: path.split('node_modules/').pop(), version: entry.version,
      license, decision: approved ? 'PERMISSIVE' : 'REVIEW_REQUIRED', development: !!entry.dev,
      obligations: license.includes('CC-BY-4.0') ? 'Preserve attribution and license notices for caniuse-lite data' : 'Preserve applicable license/copyright notices' });
  }
}
rows.sort((a,b) => `${a.area}/${a.name}/${a.version}`.localeCompare(`${b.area}/${b.name}/${b.version}`, 'en'));
const directory = join(root, 'security-artifacts'); mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, 'npm-licenses.json'), JSON.stringify(rows, null, 2));
const review = rows.filter(row => row.decision === 'REVIEW_REQUIRED');
console.log(JSON.stringify({ packages: rows.length, permissive: rows.length-review.length, reviewRequired: review.length,
  findings: review.map(({area,name,version,license})=>({area,name,version,license})) }, null, 2));
// Inventory mode always produces results. Gate mode requires explicit review of every exception.
if (process.argv.includes('--strict') && review.length) process.exitCode = 1;

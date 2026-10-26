// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Preserve upstream legal texts, never infer that an SPDX label alone supplies notices.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'licenses');
const evidencePath = path.join(output, 'upstream-evidence.json');
const evidence = fs.existsSync(evidencePath) ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) : {};
const reviewsPath = path.join(output, 'reviewed-declarations.json');
const reviews = fs.existsSync(reviewsPath) ? JSON.parse(fs.readFileSync(reviewsPath, 'utf8')) : {};
const sha = b => createHash('sha256').update(b).digest('hex');
fs.mkdirSync(path.join(output, 'texts'), { recursive: true });
const legalName = /^(licen[sc]e|copying|notice|copyright)([._-].*)?$/i;
const looksLegal = t => /permission (?:is hereby granted|to use)|redistribution and use|apache license|mozilla public license|gnu (?:lesser )?general public license|sil open font license|copyright.*all rights reserved/is.test(t);
function preserve(bytes) {
  const hash = sha(bytes), file = 'texts/' + hash + '.txt';
  fs.writeFileSync(path.join(output, file), bytes);
  return { file, sha256: hash };
}
const downloads = new Map();
function download(url) {
  const u = new URL(url);
  if (!['registry.npmjs.org', 'raw.githubusercontent.com'].includes(u.hostname) || u.protocol !== 'https:') throw new Error('Untrusted license source');
  if (!downloads.has(url)) downloads.set(url, (async () => {
    const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) throw new Error('Oversized legal document');
    return bytes;
  })().catch(() => null));
  return downloads.get(url);
}
async function upstream(name, version) {
  const key = name + '@' + version;
  if (evidence[key]?.length && evidence[key].every(e => fs.existsSync(path.join(output, e.file)) && sha(fs.readFileSync(path.join(output, e.file))) === e.sha256)) return evidence[key];
  const bytes = await download('https://registry.npmjs.org/' + encodeURIComponent(name) + '/' + encodeURIComponent(version));
  if (!bytes) return [];
  const metadata = JSON.parse(bytes.toString());
  if (metadata.name !== name || metadata.version !== version) return [];
  const repo = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url;
  const match = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(repo ?? '');
  if (!match) return [];
  const directory = metadata.repository?.directory;
  const prefixes = directory && /^[\w./-]+$/.test(directory) && !directory.includes('..') ? [directory + '/', ''] : [''];
  const refs = [...(/^[a-f0-9]{40}$/i.test(metadata.gitHead ?? '') ? [metadata.gitHead] : []), 'v' + version, version, name + '@' + version];
  for (const ref of refs) for (const prefix of prefixes) {
    for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'LICENCE', 'COPYING']) {
      const url = `https://raw.githubusercontent.com/${match[1]}/${ref}/${prefix}${filename}`;
      const content = await download(url);
      if (content && looksLegal(content.toString())) {
        const record = { ...preserve(content), source: url, packageVersion: version, ref };
        evidence[key] = [record];
        return [record];
      }
    }
  }
  return [];
}
async function main() {
  const rows = [];
  for (const area of ['', 'frontend']) {
    const lock = JSON.parse(fs.readFileSync(path.join(root, area, 'package-lock.json'), 'utf8'));
    for (const [location, entry] of Object.entries(lock.packages ?? {})) {
      if (!location.includes('node_modules/') || entry.link) continue;
      const dir = path.join(root, area, location), installed = fs.existsSync(path.join(dir, 'package.json'));
      const metadata = installed ? JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) : {};
      const name = location.split('node_modules/').pop();
      const texts = [];
      const supplementalNotices = [];
      if (installed) {
        for (const filename of fs.readdirSync(dir).filter(n => legalName.test(n))) {
          const file = path.join(dir, filename);
          if (fs.lstatSync(file).isFile()) texts.push({ ...preserve(fs.readFileSync(file)), source: [area, location, filename].filter(Boolean).join('/') });
          else if (fs.lstatSync(file).isDirectory()) for (const child of fs.readdirSync(file)) {
            const nested = path.join(file, child);
            if (fs.lstatSync(nested).isFile()) texts.push({ ...preserve(fs.readFileSync(nested)), source: [area, location, filename, child].filter(Boolean).join('/') });
          }
        }
        // Some publishers put the complete grant in README instead of LICENSE.
        for (const filename of fs.readdirSync(dir).filter(n => /^readme(?:\.|$)/i.test(n))) {
          const file = path.join(dir, filename);
          if (fs.lstatSync(file).isFile()) {
            const content = fs.readFileSync(file);
            if (looksLegal(content.toString()) && /copyright/i.test(content.toString())) texts.push({ ...preserve(content), source: [area, location, filename].filter(Boolean).join('/') });
          }
        }
        // Preserve copyright/license headers as additional evidence, including
        // BSD-covered V8 code in stackback. A header alone is not a full license.
        for (const filename of fs.readdirSync(dir).filter(n => /\.(?:js|c|h|ts)$/.test(n))) {
          const file = path.join(dir, filename);
          if (!fs.lstatSync(file).isFile()) continue;
          const content = fs.readFileSync(file, 'utf8');
          const header = /^\s*(\/\*[\s\S]*?\*\/|(?:\s*\/\/[^\n]*\n)+)/.exec(content)?.[1];
          if (header && /copyright/i.test(header) && /licen[sc]e|redistribution|permission|rights reserved/i.test(header)) {
            supplementalNotices.push({ ...preserve(Buffer.from(header + '\n')), source: [area, location, filename].filter(Boolean).join('/'), kind: 'original_source_header' });
          }
        }
      }
      rows.push({ area: area || 'backend', location, name, version: entry.version, license: entry.license || metadata.license || 'UNKNOWN', development: !!entry.dev, installed, texts, supplementalNotices });
    }
  }
  if (process.argv.includes('--fetch-missing')) {
    const queue = rows.filter(r => r.installed && !r.texts.length);
    await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) { const r = queue.shift(); r.texts = await upstream(r.name, r.version); } }));
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  } else for (const r of rows.filter(r => r.installed && !r.texts.length)) {
    const saved = evidence[r.name + '@' + r.version] || [];
    r.texts = saved.filter(e => fs.existsSync(path.join(output, e.file)) && sha(fs.readFileSync(path.join(output, e.file))) === e.sha256);
  }
  rows.sort((a, b) => `${a.area}/${a.location}`.localeCompare(`${b.area}/${b.location}`, 'en'));
  for (const row of rows.filter(r => r.installed && !r.texts.length)) {
    const review = reviews[row.name + '@' + row.version];
    const metadata = path.join(root, row.area === 'backend' ? '' : row.area, row.location, 'package.json');
    if (!review || review.declaredLicense !== row.license || review.packageMetadataSha256 !== sha(fs.readFileSync(metadata))) continue;
    const records = [...review.standardTerms, ...review.originalAttributions, ...review.additionalNotices];
    if (!records.length || records.some(e => !/^texts\/[a-f0-9]{64}\.txt$/.test(e.file) || !fs.existsSync(path.join(output, e.file)) || sha(fs.readFileSync(path.join(output, e.file))) !== e.sha256)) continue;
    row.texts = records;
    row.evidenceKind = review.evidenceKind;
    row.upstreamStandaloneLicense = false;
  }
  fs.writeFileSync(path.join(output, 'npm-inventory.json'), JSON.stringify(rows, null, 2) + '\n');
  const lines = ['# Third-party npm license notices', '', 'Generated from both lockfiles and installed package legal files. DX-OS Apache-2.0 does not relicense dependencies.', '', 'Not installed means absent on this platform; collect notices again for the actual release platform/image.', '', '| Area | Package | License metadata | Scope | Evidence |', '| --- | --- | --- | --- | --- |'];
  for (const r of rows) {
    const full = r.installed ? (r.evidenceKind ? 'Reviewed publisher SPDX declaration + original attribution + canonical terms (no upstream standalone LICENSE): ' : '') + (r.texts.map(t => `[text ${t.sha256.slice(0,8)}](${t.file})`).join(', ') || 'MISSING — review required') : 'not installed on this platform';
    const extra = r.supplementalNotices.map(t => `[source notice ${t.sha256.slice(0,8)}](${t.file})`).join(', ');
    lines.push(`| ${r.area} | ${r.name}@${r.version} | ${String(typeof r.license === 'object' ? r.license.type : r.license).replaceAll('|','\\|')} | ${r.development ? 'development' : 'production'} | ${full}${extra ? '; ' + extra : ''} |`);
  }
  fs.writeFileSync(path.join(output, 'NPM-NOTICES.md'), lines.join('\n') + '\n');
  const missing = rows.filter(r => r.installed && !r.texts.length).map(r => ({ name: r.name, version: r.version, area: r.area }));
  console.log(JSON.stringify({ lockedPackages: rows.length, installedPackages: rows.filter(r => r.installed).length, packagesWithLegalText: rows.filter(r => r.installed && r.texts.length).length, reviewedPublisherDeclarations: rows.filter(r => r.evidenceKind).length, missingLegalText: missing }, null, 2));
  if (process.argv.includes('--strict') && missing.length) process.exitCode = 1;
}
main().catch(() => { console.error('License notice collection failed; inspect upstream availability without treating missing evidence as approved.'); process.exitCode = 1; });

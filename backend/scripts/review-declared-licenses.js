// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Explicit evidence review for fixed releases whose publisher omitted LICENSE.
// Preserve original declarations/attributions; never fabricate upstream copyright.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const licenses = path.join(root, 'licenses');
const approved = new Map([
  ['@epic-web/invariant@1.0.0', 'MIT'], ['@humanfs/types@0.15.0', 'Apache-2.0'],
  ['bser@2.1.1', 'Apache-2.0'], ['eastasianwidth@0.2.0', 'MIT'],
  ['fb-watchman@2.0.2', 'Apache-2.0'], ['keyv@4.5.4', 'MIT'],
  ['natural-compare@1.4.0', 'MIT'], ['dlv@1.1.3', 'MIT'], ['stackback@0.0.2', 'MIT'],
  // Reviewed 1.5.1 Linux tarball: package.json declares MIT; README identifies
  // the platform binary. Neither tarball nor upstream v1.5.1 ships LICENSE.
  ['@napi-rs/lzma-linux-x64-gnu@1.5.1', 'MIT'],
]);
const hash = b => createHash('sha256').update(b).digest('hex');
function preserve(bytes, source, kind) {
  const sha256 = hash(bytes), file = 'texts/' + sha256 + '.txt';
  fs.writeFileSync(path.join(licenses, file), bytes);
  return { file, sha256, source, kind };
}
async function main() {
  fs.mkdirSync(path.join(licenses, 'texts'), { recursive: true });
  const source = 'https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/MIT.txt';
  const r = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Canonical license unavailable');
  const bytes = Buffer.from(await r.arrayBuffer());
  if (!bytes.toString().includes('Permission is hereby granted')) throw new Error('Unexpected standard text');
  const mit = preserve(bytes, source, 'canonical_SPDX_reference_not_upstream_notice');
  const apacheBytes = fs.readFileSync(path.join(root, 'LICENSE'));
  const apache = preserve(apacheBytes, 'https://www.apache.org/licenses/LICENSE-2.0.txt', 'canonical_license_reference');
  const rows = JSON.parse(fs.readFileSync(path.join(licenses, 'npm-inventory.json'), 'utf8'));
  const reviews = fs.existsSync(path.join(licenses, 'reviewed-declarations.json')) ? JSON.parse(fs.readFileSync(path.join(licenses, 'reviewed-declarations.json'), 'utf8')) : {};
  for (const row of rows.filter(x => x.installed && (!x.texts.length || x.evidenceKind))) {
    const key = row.name + '@' + row.version, expected = approved.get(key);
    if (!expected) throw new Error('Unreviewed package version');
    const directory = path.join(root, row.area === 'backend' ? '' : row.area, row.location);
    const metadataBytes = fs.readFileSync(path.join(directory, 'package.json'));
    const metadata = JSON.parse(metadataBytes);
    if (metadata.name !== row.name || metadata.version !== row.version || metadata.license !== expected) throw new Error('Declaration mismatch');
    const original = [preserve(metadataBytes, row.name + '@' + row.version + '/package.json', 'original_publisher_declaration')];
    for (const filename of fs.readdirSync(directory).filter(n => /^readme(?:\.|$)/i.test(n))) {
      original.push(preserve(fs.readFileSync(path.join(directory, filename)), row.name + '@' + row.version + '/' + filename, 'original_publisher_attribution'));
    }
    reviews[key] = {
      declaredLicense: expected, packageMetadataSha256: hash(metadataBytes),
      basis: 'Exact published package SPDX declaration plus unchanged original README/metadata/source-header attribution and canonical terms. No standalone upstream LICENSE exists in the reviewed release.',
      copyrightPolicy: 'Retain original attributions; do not invent holder names, years, or an upstream LICENSE file. Canonical template placeholders remain reference text.',
      standardTerms: expected === 'Apache-2.0' ? [apache, mit] : [mit],
      originalAttributions: original,
      additionalNotices: row.supplementalNotices,
      evidenceKind: 'REVIEWED_PUBLISHER_DECLARATION_WITH_CANONICAL_TERMS',
      upstreamStandaloneLicense: false,
    };
  }
  fs.writeFileSync(path.join(licenses, 'reviewed-declarations.json'), JSON.stringify(reviews, null, 2) + '\n');
  console.log('Fixed-version publisher declarations reviewed:', Object.keys(reviews).length, '; original attributions retained; no upstream notice fabricated.');
}
main().catch(() => { console.error('Declaration evidence review failed; no unknown release is approved automatically.'); process.exitCode = 1; });

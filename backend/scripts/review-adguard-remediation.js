// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { reviewReports, verifyDatabase } = require('./check-adguard-artifact');
const upstream = '05ba17b282da1c4393d6a4ba4db0cf519194a362';
const expected = Object.freeze({
  'github.com/insomniacslk/dhcp': 'v0.0.0-20260719225207-c76316d4aa82',
  'golang.org/x/crypto': 'v0.57.0', 'golang.org/x/net': 'v0.60.0',
  'golang.org/x/text': 'v0.42.0', 'golang.org/x/sys': 'v0.48.0', 'golang.org/x/term': 'v0.46.0',
  // Required by x/text v0.42.0 and x/tools v0.49.0; verified against proxy .mod files.
  'golang.org/x/tools': 'v0.49.0', 'golang.org/x/mod': 'v0.41.0', 'golang.org/x/sync': 'v0.23.0',
  'golang.org/x/telemetry': 'v0.0.0-20260811182544-a038080d80e5',
});
function parseModules(text) {
  return new Map([...text.matchAll(/^\s*([\w.-]+(?:\/[\w.-]+)+)\s+(v[^\s]+)(?:\s|$)/gm)].map(m => [m[1], m[2]]));
}
function validateDelta(before, after) {
  if (!/^go 1\.26\.10$/m.test(after)) throw Error('UNEXPECTED_GO_DIRECTIVE');
  const old = parseModules(before), next = parseModules(after);
  for (const name of new Set([...old.keys(), ...next.keys()])) {
    if (old.get(name) !== next.get(name) && (!Object.hasOwn(expected, name) || next.get(name) !== expected[name])) throw Error('UNAPPROVED_DEPENDENCY_CHANGE');
  }
  for (const [name, version] of Object.entries(expected)) if (next.get(name) !== version) throw Error('MISSING_PATCHED_DEPENDENCY');
}
function validateBuild(scan, sbom, imports) {
  const r = reviewReports(scan, sbom);
  const packages = scan.Results.find(x => x.Type === 'gobinary').Packages;
  const versions = new Map(packages.map(p => [p.Name, p.Version]));
  if (versions.get('stdlib') !== 'v1.26.10') throw Error('UNEXPECTED_BINARY_TOOLCHAIN');
  // x/term need not be linked in the production binary, but is pinned in go.mod.
  for (const name of ['github.com/insomniacslk/dhcp', 'golang.org/x/crypto', 'golang.org/x/net', 'golang.org/x/text', 'golang.org/x/sys']) if (versions.get(name) !== expected[name]) throw Error('UNPATCHED_BINARY_DEPENDENCY');
  const deps = imports.split(/\r?\n/).filter(Boolean);
  if (!deps.includes('github.com/AdguardTeam/AdGuardHome') || !deps.includes('net/http')) throw Error('INCOMPLETE_PRODUCTION_IMPORT_GRAPH');
  if (deps.some(p => p === 'golang.org/x/crypto/openpgp' || p.startsWith('golang.org/x/crypto/openpgp/'))) throw Error('UNSAFE_OPENPGP_IS_LINKED');
  return { ...r, productionOpenPgpImport: false, toolchain: 'go1.26.10' };
}
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function main() {
  const [operation, directory] = process.argv.slice(2);
  if (!directory || !['delta', 'review'].includes(operation)) throw Error('INVALID_ARGUMENTS');
  const dir = path.resolve(directory);
  if (operation === 'delta') {
    validateDelta(fs.readFileSync(path.join(dir, 'go.mod.original'), 'utf8'), fs.readFileSync(path.join(dir, 'go.mod'), 'utf8'));
    console.log('Pinned dependency delta: PASS'); return;
  }
  const read = file => JSON.parse(fs.readFileSync(path.join(dir, file)));
  const scan = read('scan.json'), sbom = read('sbom.cdx.json');
  const result = validateBuild(scan, sbom, fs.readFileSync(path.join(dir, 'production-imports.txt'), 'utf8'));
  const scanner = read('scanner.json');
  if (scanner.Version !== '0.76.0') throw Error('UNEXPECTED_SCANNER_VERSION');
  const database = verifyDatabase(scanner.VulnerabilityDB);
  const build = read('build.json');
  if (build.upstream !== upstream || build.version !== 'v0.107.79-dxos.1' || build.reproducible !== true) throw Error('INVALID_BUILD_PROVENANCE');
  const binary = fs.readFileSync(path.join(dir, '../AdGuardHome'));
  if (sha(binary) !== build.binarySha256) throw Error('BINARY_PROVENANCE_MISMATCH');
  // Remove only absolute artifact path; leave component inventory unchanged.
  sbom.metadata.component.name = 'AdGuardHome-v0.107.79-dxos.1-linux-amd64';
  fs.writeFileSync(path.join(dir, 'sbom.cdx.json'), JSON.stringify(sbom, null, 2) + '\n');
  const report = { checkedAt: new Date().toISOString(), buildType: 'DXOS_REBUILD_NOT_UPSTREAM_SIGNED', build, database, ...result,
    unknownAdvisory: 'GO-2026-5932 remains visible in module scan; affected openpgp packages absent from production import graph. No ignore/VEX suppression.',
    scope: 'Dependency remediation for Linux amd64 candidate; no production, network-policy, tenant-adapter or license-clearance approval.' };
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(report, null, 2) + '\n');
  // Do not publish raw scanner paths or tool diagnostics.
  fs.rmSync(path.join(dir, 'scan.json'));
  console.log(JSON.stringify(report));
  if (result.status !== 'PASS') process.exitCode = 1;
}
module.exports = { expected, validateDelta, validateBuild };
if (require.main === module) {
  try { main(); } catch (e) { console.error(/^[A-Z_]+$/.test(e.message) ? e.message : 'REMEDIATION_VERIFICATION_INCOMPLETE'); process.exitCode = 2; }
}

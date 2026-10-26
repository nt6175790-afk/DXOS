// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Inspect a pinned release without executing AdGuard or touching host DNS.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const candidate = Object.freeze({
  version: 'v0.107.79', platform: 'linux/amd64',
  commit: '05ba17b282da1c4393d6a4ba4db0cf519194a362',
  archiveSha256: 'c48f4a43000665484c5ec28177de11a004759b620dae8f77b2aabefc9ef3687f',
  binarySha256: '7e247573e63ce771a5925d16ca4ca9344e6e888673244289dc302f0fdfdfbf4e',
  signingFingerprint: '28645AC9776EC4C00BCE2AFC0FE641E7235E2EC6',
  scannerVersion: '0.76.0',
});
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function verifyDatabase(info, now = Date.now()) {
  const updated = Date.parse(info?.UpdatedAt);
  if (info?.Version !== 2 || !Number.isFinite(updated) || updated > now + 5 * 60 * 1000 || now - updated > 72 * 60 * 60 * 1000) throw Error('VULNERABILITY_DATABASE_NOT_CURRENT');
  return { schema: info.Version, updatedAt: info.UpdatedAt, downloadedAt: info.DownloadedAt || null };
}
function verifySignature(status, exitCode) {
  if (exitCode !== 0) throw Error('SIGNATURE_VERIFICATION_FAILED');
  const lines = status.split(/\r?\n/);
  if (lines.some(line => /^\[GNUPG:\] (BADSIG|ERRSIG|EXPSIG|EXPKEYSIG|REVKEYSIG)\b/.test(line))) throw Error('SIGNATURE_REJECTED');
  if (!lines.some(line => line.startsWith(`[GNUPG:] VALIDSIG ${candidate.signingFingerprint} `))) throw Error('UNEXPECTED_SIGNING_KEY');
}
function reviewReports(scan, sbom) {
  if (scan?.SchemaVersion !== 2 || !Array.isArray(scan.Results)) throw Error('INVALID_SCAN_REPORT');
  const results = scan.Results.filter(r => r.Type === 'gobinary');
  if (results.length !== 1 || !Array.isArray(results[0].Packages)) throw Error('GO_BINARY_NOT_ANALYZED');
  const packages = results[0].Packages;
  if (!packages.some(p => p.Name === 'github.com/AdguardTeam/AdGuardHome') || !packages.some(p => p.Name === 'stdlib' && p.Version)) throw Error('INCOMPLETE_GO_INVENTORY');
  if (sbom?.bomFormat !== 'CycloneDX' || !Array.isArray(sbom.components)) throw Error('INVALID_SBOM');
  const inventory = new Map(sbom.components.filter(c => c.purl).map(c => [c.purl, c]));
  if (packages.some(p => !p.Identifier?.PURL || !inventory.has(p.Identifier.PURL))) throw Error('SBOM_INVENTORY_MISMATCH');
  const counts = { UNKNOWN: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const findings = [];
  for (const result of results) {
    if (result.Vulnerabilities !== undefined && !Array.isArray(result.Vulnerabilities)) throw Error('INVALID_FINDINGS');
    for (const v of result.Vulnerabilities || []) {
      if (!Object.hasOwn(counts, v.Severity) || typeof v.VulnerabilityID !== 'string' || typeof v.PkgName !== 'string') throw Error('INVALID_FINDING');
      counts[v.Severity]++;
      // Explicit allowlist: never copy tool Metadata, paths, env or raw errors.
      findings.push({ id: v.VulnerabilityID, severity: v.Severity, package: v.PkgName, installed: v.InstalledVersion || null, fixed: v.FixedVersion || null });
    }
  }
  findings.sort((a, b) => a.id.localeCompare(b.id) || a.package.localeCompare(b.package));
  return { status: counts.HIGH + counts.CRITICAL ? 'FAIL' : 'PASS', counts, packageCount: packages.length, sbomComponents: sbom.components.length, findings };
}
function run(executable, args, cwd) {
  // A public artifact is the only input. Ignore user Trivy config/ignore/VEX env.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^TRIVY_/i.test(key)));
  const r = spawnSync(executable, args, { cwd, env, encoding: 'utf8', timeout: 12 * 60 * 1000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return r;
}
function parseArgs(args) {
  const allowed = new Set(['archive', 'binary', 'signature', 'gpg-home', 'gpg', 'trivy', 'cache', 'output']);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!allowed.has(key) || options[key] || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('INVALID_ARGUMENTS');
    options[key] = path.resolve(args[i + 1]);
  }
  for (const key of allowed) if (!options[key]) throw Error('MISSING_ARGUMENT');
  return options;
}
function main() {
  const o = parseArgs(process.argv.slice(2));
  if (digest(o.archive) !== candidate.archiveSha256 || digest(o.binary) !== candidate.binarySha256) throw Error('ARTIFACT_DIGEST_MISMATCH');
  fs.mkdirSync(o.output, { recursive: true });
  const output = fs.mkdtempSync(path.join(o.output + path.sep, 'adguard-'));
  // Relative paths work with both native GPG and Git's MSYS GPG on Windows.
  const gpgCwd = path.dirname(o.binary);
  const gpgPath = file => path.relative(gpgCwd, file).split(path.sep).join('/') || '.';
  if ([o['gpg-home'], o.signature].some(file => path.isAbsolute(path.relative(gpgCwd, file)))) throw Error('GPG_INPUTS_MUST_SHARE_VOLUME');
  const signature = run(o.gpg, ['--batch', '--no-auto-key-retrieve', '--homedir', gpgPath(o['gpg-home']), '--status-fd', '1', '--verify', gpgPath(o.signature), path.basename(o.binary)], gpgCwd);
  verifySignature(signature.stdout || '', signature.status);
  const version = run(o.trivy, ['version', '--format', 'json'], output);
  if (version.status !== 0 || JSON.parse(version.stdout).Version !== candidate.scannerVersion) throw Error('UNEXPECTED_SCANNER_VERSION');
  // Windows marks an extensionless Linux ELF as non-executable. Byte-identical
  // .exe copy lets Trivy's executable filter inspect it; this never runs it.
  const scanInput = path.join(output, process.platform === 'win32' ? 'AdGuardHome.exe' : 'AdGuardHome');
  fs.copyFileSync(o.binary, scanInput);
  if (process.platform !== 'win32') fs.chmodSync(scanInput, 0o700);
  if (digest(scanInput) !== candidate.binarySha256) throw Error('SCAN_INPUT_MISMATCH');
  fs.writeFileSync(path.join(output, 'trivy.yaml'), '{}\n');
  fs.writeFileSync(path.join(output, '.trivyignore'), '');
  const common = ['rootfs', '--config', path.join(output, 'trivy.yaml'), '--ignorefile', path.join(output, '.trivyignore'), '--cache-dir', o.cache, '--timeout', '10m', '--skip-version-check', '--no-progress'];
  const scan = run(o.trivy, [...common, '--scanners', 'vuln', '--list-all-pkgs', '--format', 'json', '--output', path.join(output, 'vulnerabilities.json'), '--exit-code', '0', scanInput], output);
  if (scan.status !== 0) throw Error('VULNERABILITY_SCAN_INCOMPLETE');
  const sbom = run(o.trivy, [...common, '--format', 'cyclonedx', '--output', path.join(output, 'sbom.cdx.json'), scanInput], output);
  if (sbom.status !== 0) throw Error('SBOM_GENERATION_INCOMPLETE');
  const dbVersion = run(o.trivy, ['version', '--cache-dir', o.cache, '--format', 'json'], output);
  if (dbVersion.status !== 0) throw Error('DATABASE_METADATA_UNAVAILABLE');
  const database = verifyDatabase(JSON.parse(dbVersion.stdout).VulnerabilityDB);
  const reviewed = reviewReports(JSON.parse(fs.readFileSync(path.join(output, 'vulnerabilities.json'))), JSON.parse(fs.readFileSync(path.join(output, 'sbom.cdx.json'))));
  const report = { checkedAt: new Date().toISOString(), candidate, database, signature: 'VALID_PINNED_FINGERPRINT', ...reviewed,
    scope: 'Official Linux binary Go dependencies only; no OS/container scan, exploitability proof, DNS live test or tenant adapter test.' };
  fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  process.exitCode = reviewed.status === 'PASS' ? 0 : 1;
}
module.exports = { candidate, verifyDatabase, verifySignature, reviewReports, parseArgs };
if (require.main === module) {
  try { main(); } catch (e) {
    const safe = /^[A-Z_]+$/.test(e.message) ? e.message : 'VERIFICATION_INCOMPLETE';
    console.error(JSON.stringify({ status: 'BLOCKED', reason: safe })); process.exitCode = 2;
  }
}

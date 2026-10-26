// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const { candidate, verifyDatabase, verifySignature, reviewReports, parseArgs } = require('./check-adguard-artifact');
function fixtures() {
  return {
    scan: { SchemaVersion: 2, Results: [{ Type: 'gobinary', Packages: [
      { Name: 'github.com/AdguardTeam/AdGuardHome', Identifier: { PURL: 'pkg:golang/example/main' } },
      { Name: 'stdlib', Version: 'v1.26.6', Identifier: { PURL: 'pkg:golang/stdlib@v1.26.6' } },
    ] }] },
    sbom: { bomFormat: 'CycloneDX', components: [{ purl: 'pkg:golang/example/main' }, { purl: 'pkg:golang/stdlib@v1.26.6' }] },
  };
}
test('rejects empty scan instead of converting no detection into zero vulnerabilities', () => {
  const { sbom } = fixtures();
  assert.throws(() => reviewReports({ SchemaVersion: 2, Results: [] }, sbom), /GO_BINARY_NOT_ANALYZED/);
});
test('rejects scan lacking standard library coverage', () => {
  const { scan, sbom } = fixtures(); scan.Results[0].Packages.pop();
  assert.throws(() => reviewReports(scan, sbom), /INCOMPLETE_GO_INVENTORY/);
});
test('requires SBOM to cover every discovered package', () => {
  const { scan, sbom } = fixtures(); sbom.components.pop();
  assert.throws(() => reviewReports(scan, sbom), /SBOM_INVENTORY_MISMATCH/);
});
test('reports HIGH without fixed version and does not ignore unfixed vulnerabilities', () => {
  const { scan, sbom } = fixtures(); scan.Results[0].Vulnerabilities = [{ VulnerabilityID: 'CVE-2099-1001', Severity: 'HIGH', PkgName: 'stdlib' }];
  const r = reviewReports(scan, sbom); assert.equal(r.status, 'FAIL'); assert.equal(r.counts.HIGH, 1); assert.equal(r.findings[0].fixed, null);
});
test('CRITICAL blocks gate and UNKNOWN remains visible', () => {
  const { scan, sbom } = fixtures(); scan.Results[0].Vulnerabilities = ['CRITICAL', 'UNKNOWN'].map((Severity, i) => ({ VulnerabilityID: `TEST-${i}`, Severity, PkgName: 'stdlib' }));
  const r = reviewReports(scan, sbom); assert.equal(r.status, 'FAIL'); assert.equal(r.counts.UNKNOWN, 1);
});
test('only a populated consistent inventory can pass scan gate', () => {
  const { scan, sbom } = fixtures(); assert.equal(reviewReports(scan, sbom).status, 'PASS');
});
test('allowlisted summary excludes raw errors, arbitrary metadata and unrelated security fields', () => {
  const { scan, sbom } = fixtures(); scan.Metadata = { secret: 'SYNTHETIC-DO-NOT-PUBLISH' };
  scan.Results[0].Vulnerabilities = [{ VulnerabilityID: 'TEST-1', Severity: 'LOW', PkgName: 'stdlib', RawError: 'SYNTHETIC-DO-NOT-PUBLISH' }];
  assert.equal(JSON.stringify(reviewReports(scan, sbom)).includes('SYNTHETIC-DO-NOT-PUBLISH'), false);
});
test('rejects malformed severity and malformed finding arrays', () => {
  const { scan, sbom } = fixtures(); scan.Results[0].Vulnerabilities = [{ VulnerabilityID: 'TEST-1', Severity: 'TYPO', PkgName: 'stdlib' }];
  assert.throws(() => reviewReports(scan, sbom), /INVALID_FINDING/);
  scan.Results[0].Vulnerabilities = {}; assert.throws(() => reviewReports(scan, sbom), /INVALID_FINDINGS/);
});
test('requires exact pinned fingerprint in GPG machine status', () => {
  verifySignature(`[GNUPG:] VALIDSIG ${candidate.signingFingerprint} 2026-08-18`, 0);
  assert.throws(() => verifySignature('[GNUPG:] GOODSIG some-other-key', 0), /UNEXPECTED_SIGNING_KEY/);
});
test('nonzero GPG exit and revoked/expired/bad signature never pass', () => {
  const valid = `[GNUPG:] VALIDSIG ${candidate.signingFingerprint} 2026-08-18`;
  assert.throws(() => verifySignature(valid, 1), /SIGNATURE_VERIFICATION_FAILED/);
  for (const bad of ['BADSIG', 'ERRSIG', 'EXPSIG', 'EXPKEYSIG', 'REVKEYSIG']) assert.throws(() => verifySignature(`${valid}\n[GNUPG:] ${bad} key`, 0), /SIGNATURE_REJECTED/);
});
test('CLI refuses missing, duplicate and unrecognized options', () => {
  assert.throws(() => parseArgs([]), /MISSING_ARGUMENT/);
  assert.throws(() => parseArgs(['--output', 'one', '--output', 'two']), /INVALID_ARGUMENTS/);
  assert.throws(() => parseArgs(['--url', 'https://example.test']), /INVALID_ARGUMENTS/);
});
test('requires current scanner DB metadata instead of accepting stale or future evidence', () => {
  const now = Date.parse('2026-10-21T06:00:00Z');
  assert.equal(verifyDatabase({ Version: 2, UpdatedAt: '2026-10-21T01:00:00Z' }, now).schema, 2);
  for (const info of [undefined, { Version: 2, UpdatedAt: 'invalid' }, { Version: 2, UpdatedAt: '2026-10-01T01:00:00Z' }, { Version: 2, UpdatedAt: '2026-10-22T01:00:00Z' }]) assert.throws(() => verifyDatabase(info, now), /VULNERABILITY_DATABASE_NOT_CURRENT/);
});

// Scan immutable image IDs of this stack's actual containers, never Config.Env.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'security-artifacts'); fs.mkdirSync(output, { recursive: true });
const services = ['backend', 'frontend', 'keycloak', 'openbao', 'openbao-agent', 'redis', 'clamav', 'apisix', 'waf'];
const common = ['run', '--rm', '-v', 'dxos-security_trivy_cache:/cache', '-v', output + ':/out', '-v', '/var/run/docker.sock:/var/run/docker.sock:ro', 'aquasec/trivy:0.76.0'];
const results = [];
const imagesOnly = process.argv.includes('--images-only');
// Resolve each built image to its immutable ID, including the patched Keycloak runtime used by Compose.
const images = { backend:'dxos-security-backend', frontend:'dxos-security-frontend', keycloak:'dxos-security-keycloak', openbao:'dxos-security-openbao-oss', 'openbao-agent':'dxos-security-openbao-oss', redis:'dxos-security-valkey-oss', clamav:'dxos-security-clamav-oss', apisix:'dxos-security-apisix-oss', waf:'dxos-security-waf-oss' };
for (const service of services) {
  const inspected = spawnSync('docker', imagesOnly ? ['image', 'inspect', images[service], '--format', '{{.Id}}'] : ['inspect', 'dxos-security-' + service + '-1', '--format', '{{.Image}}'], { encoding: 'utf8' });
  const image = inspected.stdout?.trim();
  if (inspected.status !== 0 || !/^sha256:[a-f0-9]{64}$/.test(image ?? '')) { console.error('Runtime image unavailable:', service); results.push({ service, status: 'NOT_EXECUTED' }); continue; }
  console.log('Runtime image scan:', service);
  const filename = 'runtime-' + service + '.json'; fs.rmSync(path.join(output, filename), { force: true });
  const scan = spawnSync('docker', [...common, 'image', '--cache-dir', '/cache', '--timeout', '15m', '--scanners', 'vuln', '--list-all-pkgs', '--format', 'json', '--output', '/out/' + filename, '--severity', 'HIGH,CRITICAL', '--exit-code', '1', image], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (!fs.existsSync(path.join(output, filename))) { results.push({ service, image, status: 'NOT_EXECUTED' }); continue; }
  const report = JSON.parse(fs.readFileSync(path.join(output, filename), 'utf8'));
  const findings = (report.Results || []).flatMap(r => (r.Vulnerabilities || []).map(v => ({ package: v.PkgName, installed: v.InstalledVersion, fixed: v.FixedVersion || null, severity: v.Severity, id: v.VulnerabilityID })));
  const counts = { high: findings.filter(v => v.severity === 'HIGH').length, critical: findings.filter(v => v.severity === 'CRITICAL').length };
  const licenseMetadata = [...new Set((report.Results || []).flatMap(r => (r.Packages || []).flatMap(p => p.Licenses || [])))].sort();
  const sbomName = 'runtime-' + service + '.cdx.json'; fs.rmSync(path.join(output, sbomName), { force: true });
  const sbom = spawnSync('docker', [...common, 'image', '--cache-dir', '/cache', '--timeout', '15m', '--format', 'cyclonedx', '--output', '/out/' + sbomName, image], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const status = scan.status === 0 && sbom.status === 0 && fs.existsSync(path.join(output, sbomName)) ? 'PASS' : 'FAIL';
  results.push({ service, image, status, ...counts, findings, licenseMetadata, sbom: fs.existsSync(path.join(output, sbomName)) ? sbomName : null });
  console.log(service, status, JSON.stringify(counts));
  fs.writeFileSync(path.join(output, 'runtime-image-review.json'), JSON.stringify({ generatedAt: new Date().toISOString(), complete: results.length === services.length, results }, null, 2));
}
fs.writeFileSync(path.join(output, 'runtime-image-review.json'), JSON.stringify({ generatedAt: new Date().toISOString(), complete: results.length === services.length, results }, null, 2));
if (results.some(r => r.status !== 'PASS')) process.exitCode = 1;

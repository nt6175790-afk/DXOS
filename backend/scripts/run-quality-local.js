// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// OSS quality gate: ESLint/TypeScript + test evidence + npm/notice checks.
// This replaces Sonar; it does not claim Sonar's rules/dashboard are identical.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const artifacts = path.join(root, 'security-artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const results = [];
function run(name, binary, args, cwd = root, shell = false) {
  console.log('Quality check:', name);
  const result = spawnSync(binary, args, { cwd, shell, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
  results.push({ name, status: result.status === 0 ? 'PASS' : 'FAIL', exitCode: result.status });
  return result;
}
function npm(name, args, cwd = root) {
  return run(name, process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd, process.platform === 'win32');
}
for (const [name, directory, targets] of [
  ['backend', root, ['backend/src', 'tests/backend']],
  ['frontend', path.join(root, 'frontend'), ['.']],
]) {
  const cli = path.join(path.dirname(require.resolve('eslint/package.json', { paths: [directory] })), 'bin/eslint.js');
  const output = path.join(artifacts, `quality-${name}-eslint.json`);
  fs.rmSync(output, { force: true });
  run(name + ' lint (zero warnings)', process.execPath, [cli, ...targets, '--max-warnings=0', '--format=json', '--output-file', output], directory);
}
run('OSS npm license catalog', process.execPath, ['backend/scripts/audit-licenses.js', '--strict']);
run('Third-party legal evidence', process.execPath, ['backend/scripts/collect-license-notices.js', '--strict']);
for (const [name, directory] of [['backend', root], ['frontend', path.join(root, 'frontend')]]) {
  const result = npm(name + ' production dependency audit', ['audit', '--omit=dev', '--json'], directory);
  try {
    const report = JSON.parse(result.stdout);
    fs.writeFileSync(path.join(artifacts, `quality-${name}-npm-audit.json`), JSON.stringify(report, null, 2));
  } catch { results[results.length - 1].status = 'FAIL'; }
}
if (process.argv.includes('--tests')) {
  const backend = path.join(artifacts, 'quality-backend-tests.json');
  const frontend = path.join(artifacts, 'quality-frontend-tests.json');
  fs.rmSync(backend, { force: true }); fs.rmSync(frontend, { force: true });
  npm('Full backend disposable MySQL tests', ['run', 'test:rbac:mysql', '--workspace', '@dx-os/backend', '--', '--coverage', '--json', '--outputFile', backend]);
  npm('Full frontend tests', ['test', '--', '--reporter=json', '--outputFile', frontend], path.join(root, 'frontend'));
}
const coverageFile = path.join(root, 'coverage/coverage-final.json');
let coverage = null;
if (fs.existsSync(coverageFile)) {
  const map = require('istanbul-lib-coverage').createCoverageMap(JSON.parse(fs.readFileSync(coverageFile, 'utf8')));
  coverage = { ...map.getCoverageSummary().toJSON(), collectedAt: fs.statSync(coverageFile).mtime.toISOString() };
}
const report = {
  generatedAt: new Date().toISOString(), toolchain: 'ESLint + typescript-eslint + Jest/Vitest + npm audit + license evidence',
  status: results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL',
  testsExecutedThisRun: process.argv.includes('--tests'), coverage, checks: results,
  boundaries: ['Coverage is displayed with its collection timestamp, not an invented threshold.', 'Trivy image/secret scans are separate gates.', 'No remote CI or production deployment is implied.'],
};
fs.writeFileSync(path.join(artifacts, 'quality-gate.json'), JSON.stringify(report, null, 2));
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
fs.writeFileSync(path.join(artifacts, 'quality-gate.html'), '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DX-OS OSS Quality Gate</title><style>body{font:16px system-ui;background:#f1f5f9;color:#0f172a;max-width:960px;margin:40px auto;padding:24px}main{background:white;padding:32px;border-radius:16px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:12px;border-bottom:1px solid #e2e8f0}.PASS{color:#047857}.FAIL{color:#b91c1c}p{line-height:1.6}</style><main><h1>DX-OS · OSS Quality Gate</h1><p>' + escape(report.generatedAt) + '</p><h2 class="' + report.status + '">' + report.status + '</h2><table><tr><th>Kiểm tra</th><th>Kết quả</th></tr>' + results.map(r => '<tr><td>' + escape(r.name) + '</td><td class="' + r.status + '">' + r.status + '</td></tr>').join('') + '</table><p>Chạy test trong lượt này: ' + (report.testsExecutedThisRun ? 'Có' : 'Không') + '.</p><p>Coverage statements: ' + (coverage ? escape(coverage.statements.pct) + '% · thu thập ' + escape(coverage.collectedAt) : 'Chưa có dữ liệu') + '.</p><p>Đây là bằng chứng local. Quét Trivy, kiểm tra hạ tầng và CI remote là các bước riêng.</p></main></html>');
console.log('OSS quality gate:', report.status);
if (report.status !== 'PASS') process.exitCode = 1;

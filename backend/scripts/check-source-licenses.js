// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Original project sources only; dependency licenses and historical SQL stay intact.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isPrivateOrGeneratedPath } = require('./source-publication-policy');
const root = path.resolve(__dirname, '../..');
const notice = 'SPDX-FileCopyrightText: 2026 DX-OS contributors\nSPDX-License-Identifier: Apache-2.0\n';
function style(file) {
  if (file.endsWith('/migration_lock.toml')) return 'sidecar';
  if (/\.(?:ts|tsx|js|mjs|cjs|prisma)$/.test(file)) return 'slash';
  if (/\.css$/.test(file)) return 'block';
  if (/\.html$/.test(file)) return 'html';
  if (/\.(?:ya?ml|sh|hcl|conf|toml|Dockerfile)$/.test(file) || /(?:^|\/)(?:Caddyfile|\.gitignore|\.dockerignore|\.gitattributes)$/.test(file) || file.endsWith('.env.example')) return 'hash';
  // Sidecars avoid changing SQL checksums and JSON parser behavior.
  if (/\.(?:sql|json)$/.test(file)) return 'sidecar';
  return null;
}
function header(kind) {
  if (kind === 'slash') return notice.trimEnd().split('\n').map(l => '// ' + l).join('\n') + '\n';
  if (kind === 'hash') return notice.trimEnd().split('\n').map(l => '# ' + l).join('\n') + '\n';
  if (kind === 'block') return '/*\n' + notice + '*/\n';
  return '<!--\n' + notice + '-->\n';
}
function check(files, write = false, base = root) {
  let checked = 0; let sidecars = 0; const missing = [];
  for (const file of files) {
    // Do not relicense third-party evidence, binary assets or generated reports.
    if (isPrivateOrGeneratedPath(file) || /^(?:licenses|docs\/security)\//.test(file) || file.endsWith('.license')) continue;
    const kind = style(file); if (!kind) continue;
    const target = path.join(base, file); if (!fs.existsSync(target)) continue;
    let text = fs.readFileSync(target, 'utf8');
    const evidence = kind === 'sidecar' ? target + '.license' : target;
    let present = kind === 'sidecar' ? (fs.existsSync(evidence) ? fs.readFileSync(evidence, 'utf8') : '') : text.slice(0, 1800);
    if (!/SPDX-License-Identifier:\s*Apache-2\.0\b/.test(present)) {
      if (!write) missing.push(file);
      else if (kind === 'sidecar') fs.writeFileSync(evidence, notice, { flag: 'wx' });
      else {
        // Keep shebang first and preserve the original file bytes after the header.
        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const prefix = header(kind).replaceAll('\n', eol);
        if (text.startsWith('#!')) { const end = text.indexOf('\n') + 1; text = text.slice(0, end) + prefix + text.slice(end); }
        else text = prefix + text;
        fs.writeFileSync(target, text);
      }
    }
    checked++; if (kind === 'sidecar') sidecars++;
  }
  return { status: missing.length ? 'FAIL' : 'PASS', checked, sidecars, missing };
}
if (require.main === module) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  const result = check(files, process.argv.includes('--write'));
  console.log(JSON.stringify(result)); if (result.status !== 'PASS') process.exitCode = 1;
}
module.exports = { check, style };

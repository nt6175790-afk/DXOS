// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Root-only workspace directories must never exclude business modules with the same name.
function normalize(name) { return name.replace(/\\/g, '/'); }
function isPrivateOrGeneratedPath(name) {
  const p = normalize(name);
  return /(^|\/)(?:node_modules|dist|coverage|\.git|\.secrets)(\/|$)/i.test(p)
    || /^(?:outputs|work|security-artifacts|backups)(\/|$)/i.test(p)
    || /(^|\/)\.env(?:$|\.(?!example$))/i.test(p)
    || /^\.security/i.test(p)
    || /\.(?:dump|sql\.gz|zip|7z|tar\.gz|key|pem|p12|pfx)$/i.test(p);
}
function shouldExcludeFromSourceExport(name) {
  const p = normalize(name);
  return isPrivateOrGeneratedPath(p)
    || /^docs\/(?:reports|project-history)\//i.test(p)
    || /\.(?:docx|pdf)$/i.test(p)
    || /^docs\/.*\.(?:png|jpg|jpeg)$/i.test(p);
}
module.exports = { isPrivateOrGeneratedPath, shouldExcludeFromSourceExport };

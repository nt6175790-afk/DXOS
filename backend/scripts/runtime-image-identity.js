// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Inspect immutable IDs only; never inspect or print container environment values.
const images = { backend: 'dxos-security-backend', frontend: 'dxos-security-frontend', keycloak: 'dxos-security-keycloak', openbao: 'dxos-security-openbao-oss', 'openbao-agent': 'dxos-security-openbao-oss', redis: 'dxos-security-valkey-oss', clamav: 'dxos-security-clamav-oss', apisix: 'dxos-security-apisix-oss', waf: 'dxos-security-waf-oss' };
function verifyRuntimeImages(inspect) {
  for (const [service, image] of Object.entries(images)) {
    const expected = inspect(['image', 'inspect', image, '--format', '{{.Id}}']);
    const actual = inspect(['inspect', `dxos-security-${service}-1`, '--format', '{{.Image}}']);
    if (!/^sha256:[a-f0-9]{64}$/.test(expected) || !/^sha256:[a-f0-9]{64}$/.test(actual)) throw new Error('Local image identity unavailable; build and create the existing stack first');
    if (expected !== actual) throw new Error(`Local image mismatch: ${service}; recreate that service from the reviewed build before resuming`);
  }
}
module.exports = { verifyRuntimeImages };

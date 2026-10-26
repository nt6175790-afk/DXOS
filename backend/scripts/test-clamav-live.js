// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { ConfigService } = require('@nestjs/config');
const { FileScannerService } = require('../dist/modules/files/file-scanner.service');
async function main() {
  const scanner = new FileScannerService(new ConfigService({ FILE_SCAN_ENABLED: 'true', CLAMAV_TIMEOUT_MS: '30000' }));
  const clean = { get: async () => Readable.from([Buffer.from('%PDF-1.7\nDXOS clean fixture\n%%EOF')]) };
  // EICAR is an inert antivirus test signature; no executable or real malware is used.
  const eicar = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
  const infected = { get: async () => Readable.from([Buffer.from(eicar)]) };
  await scanner.scanStored(clean, 'fixture');
  await assert.rejects(scanner.scanStored(infected, 'fixture'), error => error.getStatus?.() === 400);
  console.log('LIVE ClamAV: clean content accepted, EICAR test rejected (2 checks PASS).');
}
main().catch(() => { console.error('Live ClamAV verification failed.'); process.exitCode = 1; });

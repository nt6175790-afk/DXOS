// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { createServer, Server } from 'node:net';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { FileScannerService } from '../../backend/src/modules/files/file-scanner.service';
import { StorageService } from '../../backend/src/modules/files/storage.service';

describe('ClamAV streaming protocol', () => {
  let server: Server; let port: number;
  async function fixture(reply?: string) {
    let received = Buffer.alloc(0);
    server = createServer(socket => {
      socket.on('data', chunk => {
        received = Buffer.concat([received, chunk]);
        if (received.length < 10) return;
        expect(received.subarray(0, 10).toString()).toBe('zINSTREAM\0');
        let offset = 10;
        while (received.length >= offset + 4) {
          const length = received.readUInt32BE(offset);
          if (!length) { if (reply) socket.end(reply); return; }
          if (received.length < offset + 4 + length) return;
          offset += 4 + length;
        }
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
    const scanner = new FileScannerService(new ConfigService({ FILE_SCAN_ENABLED: 'true', CLAMAV_PORT: String(port), CLAMAV_TIMEOUT_MS: '100' }));
    const storage = { get: jest.fn(async () => Readable.from([Buffer.from('sample bytes')])) } as unknown as StorageService;
    return { scanner, storage };
  }
  afterEach(async () => { if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve())); });
  it('accepts only a complete clean response', async () => {
    const { scanner, storage } = await fixture('stream: OK\0'); await expect(scanner.scanStored(storage, 'private-key')).resolves.toBeUndefined();
  });
  it('rejects infected content without returning signature/internal data', async () => {
    const { scanner, storage } = await fixture('stream: Eicar-Test-Signature FOUND\0');
    await expect(scanner.scanStored(storage, 'private-key')).rejects.toMatchObject({ status: 400, message: 'File rejected by security scan.' });
  });
  it.each(['stream: UNKNOWN ERROR\0', 'stream: OK', 'unexpected\0'])('fails closed on invalid/incomplete response: %s', async reply => {
    const { scanner, storage } = await fixture(reply);
    await expect(scanner.scanStored(storage, 'private-key')).rejects.toMatchObject({ status: 503 });
  });
  it('fails closed on timeout', async () => {
    const { scanner, storage } = await fixture();
    await expect(scanner.scanStored(storage, 'private-key')).rejects.toMatchObject({ status: 503 });
  });
  it('fails closed on unavailable daemon', async () => {
    const { storage } = await fixture(); await new Promise<void>(resolve => server.close(() => resolve()));
    const scanner = new FileScannerService(new ConfigService({ FILE_SCAN_ENABLED: 'true', CLAMAV_PORT: String(port) }));
    await expect(scanner.scanStored(storage, 'private-key')).rejects.toMatchObject({ status: 503 });
  });
  it('preserves existing behavior only when explicitly disabled/default', async () => {
    const storage = { get: jest.fn() } as unknown as StorageService;
    await new FileScannerService(new ConfigService()).scanStored(storage, 'key'); expect(storage.get).not.toHaveBeenCalled();
  });
});

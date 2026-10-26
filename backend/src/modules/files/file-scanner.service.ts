// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createConnection } from 'node:net';
import type { Readable } from 'node:stream';
import { MAX_FILE_BYTES } from './file-policy';
import { StorageService } from './storage.service';

@Injectable()
export class FileScannerService {
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly port: number;
  private readonly timeout: number;
  constructor(config: ConfigService) {
    const enabled = config.get<string>('FILE_SCAN_ENABLED') ?? 'false';
    if (!['true', 'false'].includes(enabled)) throw new Error('Invalid FILE_SCAN_ENABLED');
    this.enabled = enabled === 'true';
    this.host = config.get<string>('CLAMAV_HOST') ?? '127.0.0.1';
    this.port = Number(config.get<string>('CLAMAV_PORT') ?? '3310');
    this.timeout = Number(config.get<string>('CLAMAV_TIMEOUT_MS') ?? '10000');
    if (!this.host || !Number.isInteger(this.port) || this.port < 1 || this.port > 65535 ||
      !Number.isInteger(this.timeout) || this.timeout < 100 || this.timeout > 60000) throw new Error('Invalid ClamAV configuration');
  }

  async scanStored(storage: StorageService, key: string): Promise<void> {
    if (!this.enabled) return;
    let source: Readable | undefined;
    try { source = await storage.get(key); await this.scan(source); }
    catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('File security scan unavailable.');
    } finally { source?.destroy(); }
  }

  private async scan(source: Readable): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      let response = Buffer.alloc(0); let settled = false; let sent = false;
      const finish = (error?: Error) => {
        if (settled) return; settled = true; clearTimeout(timer); socket.destroy(); source.destroy();
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => finish(new Error('Scanner timeout')), this.timeout);
      const write = (bytes: Buffer) => new Promise<void>((done, fail) => socket.write(bytes, (error) => error ? fail(error) : done()));
      socket.on('error', () => finish(new Error('Scanner connection failed')));
      source.on('error', () => finish(new Error('Scanner stream failed')));
      socket.on('end', () => { if (!settled) finish(new Error('Incomplete scanner response')); });
      socket.on('data', (chunk: Buffer) => {
        response = Buffer.concat([response, chunk]);
        if (response.length > 4096) return finish(new Error('Invalid scanner response'));
        if (!response.includes(0)) return;
        const result = response.subarray(0, response.indexOf(0)).toString('utf8');
        if (!sent) return finish(new Error('Premature scanner response'));
        if (result === 'stream: OK') finish();
        else if (/^stream: .+ FOUND$/.test(result)) finish(new BadRequestException('File rejected by security scan.'));
        else finish(new Error('Scanner rejected stream'));
      });
      socket.once('connect', () => { void (async () => {
        try {
          await write(Buffer.from('zINSTREAM\0'));
          let total = 0;
          for await (const part of source) {
            const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part as string);
            total += bytes.length;
            if (total > MAX_FILE_BYTES) throw new Error('Scanner size limit');
            const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
            await write(length); await write(bytes);
          }
          // Set before writing terminator: server may answer immediately.
          sent = true; await write(Buffer.alloc(4));
        } catch { finish(new Error('Scanner upload failed')); }
      })(); });
    });
  }
}

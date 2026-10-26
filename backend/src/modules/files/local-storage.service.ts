// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, Inject, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_FILE_BYTES } from './file-policy';
import { StorageService, StoredUpload } from './storage.service';

@Injectable()
export class LocalStorageService extends StorageService {
  readonly provider = 'LOCAL';
  private readonly root: string;
  constructor(@Inject(ConfigService) config: ConfigService) {
    super();
    const configured = config.get<string>('FILE_STORAGE_ROOT') ?? join(homedir(), '.dx-os', 'files');
    if (!isAbsolute(configured) || resolve(configured) === parse(configured).root ||
      /(?:^|[\\/])(public|static|www|wwwroot|frontend)(?:[\\/]|$)/i.test(configured)) throw new Error('Invalid private storage configuration');
    this.root = resolve(configured);
  }

  private async location(key: string): Promise<string> {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(key)) throw new BadRequestException();
    const parts: string[] = [];
    for (let dir = this.root; dirname(dir) !== dir; dir = dirname(dir)) parts.unshift(dir);
    for (const dir of parts) {
      try { await mkdir(dir, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const stat = await lstat(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe storage directory');
    }
    return join(this.root, key);
  }

  async put(key: string, source: Readable): Promise<StoredUpload> {
    const path = await this.location(key);
    const handle = await open(path, 'wx', 0o600);
    let size = 0; const hash = createHash('sha256'); let prefix = Buffer.alloc(0);
    const inspect = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_FILE_BYTES) return callback(new PayloadTooLargeException());
      hash.update(chunk);
      if (prefix.length < 8) prefix = Buffer.concat([prefix, chunk.subarray(0, 8 - prefix.length)]);
      callback(null, chunk);
    } });
    try {
      await pipeline(source, inspect, handle.createWriteStream());
      if (size === 0) throw new BadRequestException('Empty file');
      return { size, checksum: hash.digest('hex'), prefix };
    } catch (error) {
      await handle.close();
      await this.delete(key);
      throw error;
    }
  }

  async get(key: string): Promise<Readable> {
    const path = await this.location(key);
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('Unsafe storage object');
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== before.ino) { await handle.close(); throw new Error('Unsafe storage object'); }
    return handle.createReadStream();
  }

  async delete(key: string): Promise<void> {
    const path = await this.location(key);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Unsafe storage object');
      await unlink(path);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  async exists(key: string): Promise<boolean> {
    const path = await this.location(key);
    try { const stat = await lstat(path); return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }
}

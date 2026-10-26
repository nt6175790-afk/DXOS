// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, link, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { LocalStorageService } from '../../backend/src/modules/files/local-storage.service';
import { MAX_FILE_BYTES, validateFileMetadata, validateFileSignature } from '../../backend/src/modules/files/file-policy';

describe('private local storage and file policy', () => {
  let root: string; let storage: LocalStorageService;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'dxos-files-unit-')); storage = new LocalStorageService(new ConfigService({ FILE_STORAGE_ROOT: root })); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  it('streams bytes, calculates size/hash, reads and idempotently deletes an opaque key', async () => {
    const key = randomUUID(); const bytes = Buffer.from('%PDF-1.7\nfixture');
    expect(await storage.exists(key)).toBe(false);
    const result = await storage.put(key, Readable.from([bytes.subarray(0, 3), bytes.subarray(3)]));
    expect(result).toMatchObject({ size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') });
    expect(await storage.exists(key)).toBe(true);
    const chunks = []; for await (const chunk of await storage.get(key)) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(bytes);
    await expect(storage.put(key, Readable.from([bytes]))).rejects.toMatchObject({ code: 'EEXIST' });
    await storage.delete(key); await storage.delete(key); expect(await storage.exists(key)).toBe(false);
  });
  it.each(['../secret', '/absolute', 'C:\\secret', '%2e%2e%2fsecret', '..\\secret', 'a\0b', 'foo/bar', 'uuid:stream'])('rejects unsafe key %s for every operation', async (key) => {
    await expect(storage.put(key, Readable.from(['data']))).rejects.toMatchObject({ status: 400 });
    await expect(storage.get(key)).rejects.toMatchObject({ status: 400 });
    await expect(storage.delete(key)).rejects.toMatchObject({ status: 400 });
    await expect(storage.exists(key)).rejects.toMatchObject({ status: 400 });
    expect(await readdir(root)).toEqual([]);
  });
  it.each(['../file.pdf', 'C:\\file.pdf', '/tmp/file.pdf', '%2e%2e.pdf', 'a/b.pdf', 'a\\b.pdf', 'a\0b.pdf', 'a\r\nb.pdf', 'a'.repeat(201), 'a..pdf', '.hidden', 'x.pdf '])('rejects unsafe display filename %s', (filename) => {
    expect(() => validateFileMetadata(filename, 'application/pdf')).toThrow();
  });
  it('validates signatures independently of file extension and declared MIME', () => {
    validateFileMetadata('document.exe', 'application/pdf');
    validateFileSignature(Buffer.from('%PDF-1.7'), 'application/pdf');
    validateFileSignature(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png');
    validateFileSignature(Buffer.from([255, 216, 255]), 'image/jpeg');
    expect(() => validateFileSignature(Buffer.from('<script>'), 'application/pdf')).toThrow();
    expect(() => validateFileMetadata('file.pdf', 'text/html')).toThrow();
  });
  it('removes partial bytes after oversized, empty and failed streams', async () => {
    await expect(storage.put(randomUUID(), Readable.from([Buffer.alloc(MAX_FILE_BYTES + 1)]))).rejects.toMatchObject({ status: 413 });
    await expect(storage.put(randomUUID(), Readable.from([]))).rejects.toMatchObject({ status: 400 });
    const broken = Readable.from((async function* () { yield Buffer.from('partial'); throw new Error('source failed'); })());
    await expect(storage.put(randomUUID(), broken)).rejects.toThrow('source failed');
    expect(await readdir(root)).toEqual([]);
  });
  it('rejects object hard links and directory junctions', async () => {
    const key = randomUUID(); const alias = randomUUID();
    await storage.put(key, Readable.from(['data'])); await link(join(root, key), join(root, alias));
    await expect(storage.get(alias)).rejects.toThrow('Unsafe');
    await expect(storage.delete(alias)).rejects.toThrow('Unsafe');
    const junction = join(root, 'junction'); await symlink(root, junction, 'junction');
    const linked = new LocalStorageService(new ConfigService({ FILE_STORAGE_ROOT: junction }));
    await expect(linked.put(randomUUID(), Readable.from(['data']))).rejects.toThrow('Unsafe');
  });
  it.each(['relative/path', 'C:/public/files', 'C:/frontend/files', 'C:/wwwroot/files'])('rejects non-private storage configuration %s', (value) => {
    expect(() => new LocalStorageService(new ConfigService({ FILE_STORAGE_ROOT: value }))).toThrow();
  });
});

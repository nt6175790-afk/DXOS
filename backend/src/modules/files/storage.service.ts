// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { Readable } from 'node:stream';

export interface StoredUpload { size: number; checksum: string; prefix: Buffer }
export abstract class StorageService {
  abstract readonly provider: string;
  abstract put(key: string, source: Readable): Promise<StoredUpload>;
  abstract get(key: string): Promise<Readable>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
}

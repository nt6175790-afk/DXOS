// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const FILE_CONTENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export function validateFileMetadata(filename: string, contentType: string): void {
  if (typeof filename !== 'string' || filename.length > 200 ||
    !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(filename) || filename.includes('..') || filename.endsWith('.') || filename.endsWith(' ')) {
    throw new BadRequestException('Invalid filename');
  }
  if (!(FILE_CONTENT_TYPES as readonly string[]).includes(contentType)) throw new UnsupportedMediaTypeException();
}
export function validateFileSignature(prefix: Buffer, contentType: string): void {
  const valid = contentType === 'application/pdf' ? prefix.subarray(0, 5).equals(Buffer.from('%PDF-')) :
    contentType === 'image/png' ? prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
    contentType === 'image/jpeg' && prefix.length >= 3 && prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255;
  if (!valid) throw new UnsupportedMediaTypeException();
}

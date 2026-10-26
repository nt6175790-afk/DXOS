// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, CallHandler, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { catchError } from 'rxjs';
import type { Readable } from 'node:stream';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { FilesService, ReceivedFile } from './files.service';
import { MAX_FILE_BYTES } from './file-policy';

interface UploadRequest extends AuthenticatedRequest {
  file?: ReceivedFile;
  aborted?: boolean;
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
}
interface IncomingFile { originalname: string; mimetype: string; stream: Readable }
const Multipart = FileInterceptor('file', { preservePath: true,
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0, parts: 2, fieldNameSize: 50, headerPairs: 50 } });

@Injectable()
export class FileUploadInterceptor extends Multipart {
  constructor(@Inject(FilesService) private readonly files: FilesService) {
    super({ storage: {
      _handleFile: (req: UploadRequest, file: IncomingFile, callback: (error: unknown, result?: ReceivedFile) => void) => {
        const abort = () => file.stream.destroy(new BadRequestException());
        req.on('aborted', abort);
        if (req.aborted) abort();
        files.receive(req.auth!.user.id, req.params!.organizationId!, file.originalname, file.mimetype, file.stream)
          .then((result) => callback(null, result), (error: unknown) => callback(error))
          .finally(() => req.off('aborted', abort));
      },
      _removeFile: (_req: UploadRequest, file: ReceivedFile, callback: (error: unknown) => void) => {
        if (!file.id) { callback(null); return; }
        files.cleanupUpload(file.id).then(() => callback(null), (error: unknown) => callback(error));
      },
    } });
  }

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<UploadRequest>();
    const cleanup = async () => { if (req.file) await this.files.cleanupUpload(req.file.id); };
    try {
      const response = await super.intercept(context, next);
      if (req.aborted) throw new BadRequestException();
      return response.pipe(catchError(async (error: unknown) => { await cleanup(); throw error; }));
    } catch (error) { await cleanup(); throw error; }
  }
}

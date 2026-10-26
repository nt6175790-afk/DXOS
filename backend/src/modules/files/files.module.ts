// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';
import { LocalStorageService } from './local-storage.service';
import { FileUploadInterceptor } from './file-upload.interceptor';
import { FileScannerService } from './file-scanner.service';

@Module({ imports: [AuthModule, RbacModule, AuditWriterModule], controllers: [FilesController],
  providers: [FilesService, FileScannerService, FileUploadInterceptor, { provide: StorageService, useClass: LocalStorageService }],
  exports: [FilesService, StorageService] })
export class FilesModule {}

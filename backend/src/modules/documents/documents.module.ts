// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { NotificationModule } from '../notifications/notification.module';
import { FilesModule } from '../files/files.module';
import { DocumentsController } from './documents.controller';
import { ComplianceController } from './compliance.controller';
import { DocumentsService } from './documents.service';
import { ComplianceService } from './compliance.service';

@Module({
  imports: [
    AuthModule,
    RbacModule,
    AuditWriterModule,
    NotificationModule,
    FilesModule,
  ],
  controllers: [DocumentsController, ComplianceController],
  providers: [DocumentsService, ComplianceService],
  exports: [DocumentsService, ComplianceService],
})
export class DocumentsModule {}

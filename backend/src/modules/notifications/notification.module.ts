// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({ imports: [AuthModule, RbacModule, AuditWriterModule], controllers: [NotificationController],
  providers: [NotificationService], exports: [NotificationService] })
export class NotificationModule {}

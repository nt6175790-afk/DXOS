// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { WorkModule } from '../work/work.module';
import { DocumentsModule } from '../documents/documents.module';
import { WorkflowActionsService } from './workflow-actions.service';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule, AuditModule, NotificationModule, WorkModule, DocumentsModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowActionsService],
  exports: [WorkflowService],
})
export class WorkflowModule {}

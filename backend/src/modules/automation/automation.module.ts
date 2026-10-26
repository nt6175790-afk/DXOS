// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AutomationRuleService } from './automation-rule.service';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { AutomationController } from './automation.controller';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RbacModule,
    AuditModule,
    NotificationModule,
    WorkflowModule,
  ],
  controllers: [AutomationController],
  providers: [
    AutomationRuleService,
    AutomationEngineService,
    AutomationSchedulerService,
  ],
  exports: [
    AutomationRuleService,
    AutomationEngineService,
    AutomationSchedulerService,
  ],
})
export class AutomationModule {}

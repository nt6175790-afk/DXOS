// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { NotificationModule } from '../notifications/notification.module';
import { CompensationController } from './compensation.controller';
import { CompensationService } from './compensation.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [AuthModule, RbacModule, AuditWriterModule, NotificationModule],
  controllers: [CompensationController, PayrollController],
  providers: [CompensationService, PayrollService],
  exports: [CompensationService, PayrollService],
})
export class PayrollModule {}

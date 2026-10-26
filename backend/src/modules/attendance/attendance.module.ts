// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceLocationService } from './attendance-location.service';

@Module({
  imports: [AuthModule, RbacModule, AuditWriterModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceLocationService],
  exports: [AttendanceService],
})
export class AttendanceModule {}

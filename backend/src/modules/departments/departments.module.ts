// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';

@Module({ imports: [AuthModule, RbacModule, AuditWriterModule], controllers: [DepartmentsController],
  providers: [DepartmentsService], exports: [DepartmentsService] })
export class DepartmentsModule {}

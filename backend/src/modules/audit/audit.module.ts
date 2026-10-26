// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';

@Module({ imports: [AuthModule, RbacModule], controllers: [AuditController], providers: [AuditQueryService] })
export class AuditModule {}

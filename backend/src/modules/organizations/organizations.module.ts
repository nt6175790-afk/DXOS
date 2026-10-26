// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { NotificationModule } from '../notifications/notification.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationMembershipService } from './organization-membership.service';

@Module({ imports: [AuthModule, RbacModule, AuditWriterModule, NotificationModule], controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationMembershipService], exports: [OrganizationMembershipService] })
export class OrganizationsModule {}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationService } from './authorization.service';
import { RbacAssignmentService } from './rbac-assignment.service';
import { OrganizationPermissionGuard } from './guards/organization-permission.guard';
import { PermissionsController } from './permissions.controller';
import { RoleAdministrationController } from './role-administration.controller';
import { RoleAdministrationService } from './role-administration.service';

@Module({
  imports: [AuditWriterModule, AuthModule],
  controllers: [PermissionsController, RoleAdministrationController],
  providers: [AuthorizationService, OrganizationPermissionGuard, RbacAssignmentService, RoleAdministrationService],
  exports: [AuthorizationService, OrganizationPermissionGuard, RbacAssignmentService, RoleAdministrationService, AuditWriterModule],
})
export class RbacModule {}

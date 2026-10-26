// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { AuditQueryDto } from './audit-query.dto';
import { AuditQueryService } from './audit-query.service';

@Controller('organizations/:organizationId/audit-logs')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard)
@RequirePermission(PERMISSIONS.AUDIT_READ)
export class AuditController {
  constructor(private readonly queries: AuditQueryService) {}

  @Get()
  list(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: AuditQueryDto) {
    return this.queries.list(caller.user.id, organizationId, query);
  }
}

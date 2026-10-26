// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../../../backend/src/modules/auth/guards/jwt-auth.guard';
import { OrganizationContext } from '../../../backend/src/modules/rbac/decorators/organization-context.decorator';
import { RequirePermission } from '../../../backend/src/modules/rbac/decorators/require-permission.decorator';
import { OrganizationPermissionGuard } from '../../../backend/src/modules/rbac/guards/organization-permission.guard';
import { PERMISSIONS } from '../../../backend/src/modules/rbac/permission-catalog';

class OrganizationBodyDto {
  @IsUUID()
  organizationId!: string;
}

@Controller('__test/rbac/organizations')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard)
export class RbacProbeController {
  @Get('unconfigured')
  unconfigured(): void {}

  @Get(':organizationId/read')
  @RequirePermission(PERMISSIONS.ORGANIZATION_READ)
  @OrganizationContext()
  read(@Param('organizationId') organizationId: string): { organizationId: string } {
    return { organizationId };
  }

  @Post(':organizationId/read')
  @RequirePermission(PERMISSIONS.ORGANIZATION_READ)
  @OrganizationContext()
  readWithBody(
    @Param('organizationId') organizationId: string,
    @Body() _body: OrganizationBodyDto,
  ): { organizationId: string } {
    void _body;
    return { organizationId };
  }
}

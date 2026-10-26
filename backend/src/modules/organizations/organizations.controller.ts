// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { CreateOrganizationDto, ListOrganizationsDto, UpdateOrganizationDto } from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(@CurrentUser() caller: AuthenticatedRequestContext, @Body() input: CreateOrganizationDto) {
    return this.organizations.create(caller.user.id, input);
  }

  @Get()
  list(@CurrentUser() caller: AuthenticatedRequestContext, @Query() query: ListOrganizationsDto) {
    return this.organizations.list(caller.user.id, query);
  }

  @Get(':organizationId')
  @UseGuards(OrganizationPermissionGuard)
  @OrganizationContext()
  @RequirePermission(PERMISSIONS.ORGANIZATION_READ)
  get(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string) {
    return this.organizations.get(caller.user.id, organizationId);
  }

  @Patch(':organizationId')
  @UseGuards(OrganizationPermissionGuard)
  @OrganizationContext()
  @RequirePermission(PERMISSIONS.ORGANIZATION_UPDATE)
  update(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Body() input: UpdateOrganizationDto) {
    return this.organizations.update(caller.user.id, organizationId, input);
  }
}

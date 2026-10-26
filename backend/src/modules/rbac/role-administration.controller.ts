// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationContext } from './decorators/organization-context.decorator';
import { RequirePermission } from './decorators/require-permission.decorator';
import { OrganizationPermissionGuard } from './guards/organization-permission.guard';
import { PERMISSIONS } from './permission-catalog';
import { AssignRoleDto, MemberListQueryDto, RoleListQueryDto } from './role-administration.dto';
import { RoleAdministrationService } from './role-administration.service';
import { BusinessJsonGuard } from '../../common/http/business-json';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class RoleAdministrationController {
  constructor(private readonly roles: RoleAdministrationService) {}

  @Get('roles') @RequirePermission(PERMISSIONS.ROLE_READ)
  listRoles(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: RoleListQueryDto) { return this.roles.listRoles(caller.user.id, organizationId, query); }

  @Get('members') @RequirePermission(PERMISSIONS.ROLE_READ)
  listMembers(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: MemberListQueryDto) { return this.roles.listMembers(caller.user.id, organizationId, query); }

  @Post('members/:membershipId/roles') @RequirePermission(PERMISSIONS.ROLE_ASSIGN)
  assign(@CurrentUser() caller: AuthenticatedRequestContext, @Param() params: { organizationId: string; membershipId: string },
    @Body() input: AssignRoleDto) { return this.roles.assignRole(caller.user.id, params.organizationId, params.membershipId, input.roleId); }

  @Delete('members/:membershipId/roles/:roleId') @RequirePermission(PERMISSIONS.ROLE_ASSIGN)
  revoke(@CurrentUser() caller: AuthenticatedRequestContext, @Param() params: { organizationId: string; membershipId: string; roleId: string }) {
    return this.roles.revokeRole(caller.user.id, params.organizationId, params.membershipId, params.roleId);
  }
}

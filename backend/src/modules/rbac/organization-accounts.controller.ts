// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationPermissionGuard } from './guards/organization-permission.guard';
import { OrganizationContext } from './decorators/organization-context.decorator';
import { RequirePermission } from './decorators/require-permission.decorator';
import { BusinessJsonGuard } from '../../common/http/business-json';
import { PERMISSIONS as P } from './permission-catalog';
import { OrganizationAccountsService } from './organization-accounts.service';
import { AccountListDto, CreateOrganizationRoleDto, CreateOrganizationUserDto, UpdateOrganizationRoleDto, UpdateOrganizationUserDto } from './organization-accounts.dto';
@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class OrganizationAccountsController {
  constructor(private readonly accounts: OrganizationAccountsService) {}
  @Get('users') @RequirePermission(P.USER_READ)
  list(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string, @Query() input: AccountListDto) { return this.accounts.list(c.user.id, org, input); }
  @Get('users/:userId') @RequirePermission(P.USER_READ)
  get(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string, @Param('userId') user: string) { return this.accounts.get(c.user.id, org, user); }
  @Post('users') @RequirePermission(P.USER_CREATE)
  create(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string, @Body() input: CreateOrganizationUserDto) { return this.accounts.create(c.user.id, org, input); }
  @Patch('users/:userId') @RequirePermission(P.USER_UPDATE)
  update(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string, @Param('userId') user: string, @Body() input: UpdateOrganizationUserDto) { return this.accounts.update(c.user.id, org, user, input); }
  @Delete('users/:userId') @RequirePermission(P.USER_DELETE)
  remove(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string, @Param('userId') user: string) { return this.accounts.remove(c.user.id, org, user); }
  @Get('roles/permission-catalog') @RequirePermission(P.ROLE_READ)
  catalog(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string) { return this.accounts.catalog(c.user.id, org); }
  @Get('roles/:roleId') @RequirePermission(P.ROLE_READ)
  role(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string, @Param('roleId') role: string) { return this.accounts.role(c.user.id, org, role); }
  @Post('roles') @RequirePermission(P.ROLE_CREATE)
  createRole(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string, @Body() input: CreateOrganizationRoleDto) { return this.accounts.createRole(c.user.id, org, input); }
  @Patch('roles/:roleId') @RequirePermission(P.ROLE_UPDATE)
  updateRole(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string, @Param('roleId') role: string, @Body() input: UpdateOrganizationRoleDto) { return this.accounts.updateRole(c.user.id, org, role, input); }
  @Delete('roles/:roleId') @RequirePermission(P.ROLE_DELETE)
  deleteRole(@CurrentUser() c: AuthenticatedRequestContext, @Param('organizationId') org: string, @Param('roleId') role: string) { return this.accounts.deleteRole(c.user.id, org, role); }
}

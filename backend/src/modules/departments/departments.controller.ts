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
import { CreateDepartmentDto, DepartmentIdDto, EmptyDepartmentQueryDto, ListDepartmentsDto, UpdateDepartmentDto } from './department.dto';
import { DepartmentsService } from './departments.service';
import { DepartmentJsonGuard } from './department-http';

@Controller('organizations/:organizationId/departments')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, DepartmentJsonGuard)
@OrganizationContext()
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Post() @RequirePermission(PERMISSIONS.DEPARTMENT_CREATE)
  create(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Body() input: CreateDepartmentDto, @Query() _query: EmptyDepartmentQueryDto) { void _query; return this.departments.create(caller.user.id, organizationId, input); }

  @Get() @RequirePermission(PERMISSIONS.DEPARTMENT_READ)
  list(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: ListDepartmentsDto) { return this.departments.list(caller.user.id, organizationId, query); }

  @Get(':departmentId') @RequirePermission(PERMISSIONS.DEPARTMENT_READ)
  get(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: DepartmentIdDto, @Query() _query: EmptyDepartmentQueryDto) {
    void _query; return this.departments.getById(caller.user.id, ids.organizationId, ids.departmentId);
  }

  @Patch(':departmentId') @RequirePermission(PERMISSIONS.DEPARTMENT_UPDATE)
  update(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: DepartmentIdDto,
    @Body() input: UpdateDepartmentDto, @Query() _query: EmptyDepartmentQueryDto) { void _query; return this.departments.update(caller.user.id, ids.organizationId, ids.departmentId, input); }
}

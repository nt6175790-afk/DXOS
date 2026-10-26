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
import { BusinessJsonGuard } from '../../common/http/business-json';
import { CreateEmployeeDto, EmployeeIdDto, EmptyEmployeeQueryDto, ListEmployeesDto, UpdateEmployeeDto } from './employee.dto';
import { EmployeesService } from './employees.service';

@Controller('organizations/:organizationId/employees')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Post() @RequirePermission(PERMISSIONS.EMPLOYEE_CREATE)
  create(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Body() input: CreateEmployeeDto, @Query() query: EmptyEmployeeQueryDto) {
    void query; return this.employees.create(caller.user.id, organizationId, input);
  }

  @Get() @RequirePermission(PERMISSIONS.EMPLOYEE_READ)
  list(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: ListEmployeesDto) { return this.employees.list(caller.user.id, organizationId, query); }

  @Get(':employeeId') @RequirePermission(PERMISSIONS.EMPLOYEE_READ)
  get(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: EmployeeIdDto, @Query() query: EmptyEmployeeQueryDto) {
    void query; return this.employees.getById(caller.user.id, ids.organizationId, ids.employeeId);
  }

  @Patch(':employeeId') @RequirePermission(PERMISSIONS.EMPLOYEE_UPDATE)
  update(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: EmployeeIdDto,
    @Body() input: UpdateEmployeeDto, @Query() query: EmptyEmployeeQueryDto) {
    void query; return this.employees.update(caller.user.id, ids.organizationId, ids.employeeId, input);
  }
}

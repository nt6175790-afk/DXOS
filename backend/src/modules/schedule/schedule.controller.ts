// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { BusinessJsonGuard } from '../../common/http/business-json';
import {
  CreateScheduleDto,
  EmployeeScheduleParamDto,
  ListSchedulesDto,
  ScheduleOrgParamDto,
  ScheduleParamDto,
  UpdateScheduleDto,
} from './schedule.dto';
import { ScheduleService } from './schedule.service';

@Controller('organizations/:organizationId/schedules')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post()
  @RequirePermission(PERMISSIONS.SCHEDULE_CREATE)
  create(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: ScheduleOrgParamDto,
    @Body() input: CreateScheduleDto,
  ) {
    return this.scheduleService.assignSchedule(params.organizationId, caller.user.id, input);
  }

  @Patch(':scheduleId')
  @RequirePermission(PERMISSIONS.SCHEDULE_UPDATE)
  update(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: ScheduleParamDto,
    @Body() input: UpdateScheduleDto,
  ) {
    return this.scheduleService.updateSchedule(params.organizationId, params.scheduleId, caller.user.id, input);
  }

  @Delete(':scheduleId')
  @RequirePermission(PERMISSIONS.SCHEDULE_MANAGE)
  delete(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: ScheduleParamDto,
  ) {
    return this.scheduleService.deleteSchedule(params.organizationId, params.scheduleId, caller.user.id);
  }

  @Get('employees/:employeeId')
  @RequirePermission(PERMISSIONS.SCHEDULE_READ)
  getEmployeeSchedule(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: EmployeeScheduleParamDto,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.scheduleService.getEmployeeSchedule(params.organizationId, params.employeeId, caller.user.id, from, to);
  }

  @Get()
  @RequirePermission(PERMISSIONS.SCHEDULE_READ)
  list(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: ScheduleOrgParamDto,
    @Query() query: ListSchedulesDto,
  ) {
    return this.scheduleService.listSchedules(params.organizationId, caller.user.id, query);
  }
}

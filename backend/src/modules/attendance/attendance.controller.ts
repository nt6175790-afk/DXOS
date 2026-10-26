// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { BusinessJsonGuard } from '../../common/http/business-json';
import {
  AttendanceOrgParamDto,
  AttendanceLocationDto,
  AttendanceSummaryDto,
  CheckInDto,
  CheckOutDto,
  ListAttendanceDto,
} from './attendance.dto';
import { AttendanceService } from './attendance.service';
import { AttendanceLocationService } from './attendance-location.service';

@Controller('organizations/:organizationId/attendance')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService, private readonly location: AttendanceLocationService) {}

  @Get('location')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  getLocation(@Param() params: AttendanceOrgParamDto) {
    return this.location.get(params.organizationId);
  }

  @Put('location')
  @RequirePermission(PERMISSIONS.ATTENDANCE_MANAGE)
  setLocation(@CurrentUser() caller: AuthenticatedRequestContext, @Param() params: AttendanceOrgParamDto,
    @Body() input: AttendanceLocationDto) {
    return this.location.set(params.organizationId, caller.user.id, input);
  }

  @Post('check-in')
  @RequirePermission(PERMISSIONS.ATTENDANCE_CHECK_IN)
  checkIn(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: AttendanceOrgParamDto,
    @Body() input: CheckInDto,
  ) {
    return this.attendance.checkIn(params.organizationId, caller.user.id, input);
  }

  @Post('check-out')
  @RequirePermission(PERMISSIONS.ATTENDANCE_CHECK_OUT)
  checkOut(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: AttendanceOrgParamDto,
    @Body() input: CheckOutDto,
  ) {
    return this.attendance.checkOut(params.organizationId, caller.user.id, input);
  }

  @Get('today')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  getToday(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: AttendanceOrgParamDto,
  ) {
    return this.attendance.getTodayStatus(params.organizationId, caller.user.id);
  }

  @Get('summary')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  getSummary(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: AttendanceOrgParamDto,
    @Query() query: AttendanceSummaryDto,
  ) {
    return this.attendance.getSummary(params.organizationId, caller.user.id, query);
  }

  @Get()
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  list(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: AttendanceOrgParamDto,
    @Query() query: ListAttendanceDto,
  ) {
    return this.attendance.listAttendance(params.organizationId, caller.user.id, query);
  }
}

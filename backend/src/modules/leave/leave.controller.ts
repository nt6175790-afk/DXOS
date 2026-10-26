// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { BusinessJsonGuard } from '../../common/http/business-json';
import {
  ApproveLeaveRequestDto,
  CancelLeaveRequestDto,
  CreateLeaveRequestDto,
  EmptyLeaveQueryDto,
  LeaveParamDto,
  ListLeaveRequestsDto,
  RejectLeaveRequestDto,
} from './leave.dto';
import { LeaveService } from './leave.service';

@Controller('organizations/:organizationId/leave-requests')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Post()
  @RequirePermission(PERMISSIONS.LEAVE_CREATE)
  create(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Body() input: CreateLeaveRequestDto,
    @Query() query: EmptyLeaveQueryDto,
  ) {
    void query;
    return this.leave.create(caller.user.id, organizationId, input);
  }

  @Get()
  @RequirePermission(PERMISSIONS.LEAVE_READ)
  list(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: ListLeaveRequestsDto,
  ) {
    return this.leave.list(caller.user.id, organizationId, query);
  }

  @Get(':leaveId')
  @RequirePermission(PERMISSIONS.LEAVE_READ)
  get(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() ids: LeaveParamDto,
    @Query() query: EmptyLeaveQueryDto,
  ) {
    void query;
    return this.leave.getById(caller.user.id, ids.organizationId, ids.leaveId);
  }

  @Post(':leaveId/approve')
  @RequirePermission(PERMISSIONS.LEAVE_APPROVE)
  approve(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() ids: LeaveParamDto,
    @Body() input: ApproveLeaveRequestDto,
    @Query() query: EmptyLeaveQueryDto,
  ) {
    void query;
    return this.leave.approve(caller.user.id, ids.organizationId, ids.leaveId, input);
  }

  @Post(':leaveId/reject')
  @RequirePermission(PERMISSIONS.LEAVE_APPROVE)
  reject(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() ids: LeaveParamDto,
    @Body() input: RejectLeaveRequestDto,
    @Query() query: EmptyLeaveQueryDto,
  ) {
    void query;
    return this.leave.reject(caller.user.id, ids.organizationId, ids.leaveId, input);
  }

  @Post(':leaveId/cancel')
  @RequirePermission(PERMISSIONS.LEAVE_CREATE)
  cancel(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() ids: LeaveParamDto,
    @Body() input: CancelLeaveRequestDto,
    @Query() query: EmptyLeaveQueryDto,
  ) {
    void query;
    return this.leave.cancel(caller.user.id, ids.organizationId, ids.leaveId, input);
  }
}

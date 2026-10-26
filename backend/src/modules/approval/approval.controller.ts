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
  ApprovalParamDto,
  ApproveRequestDto,
  CancelRequestDto,
  CreateAttendanceAdjustmentDto,
  EmptyApprovalQueryDto,
  ListApprovalsQueryDto,
  RejectRequestDto,
} from './approval.dto';
import { ApprovalService } from './approval.service';

@Controller('organizations/:organizationId/approvals')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class ApprovalController {
  constructor(private readonly approval: ApprovalService) {}

  @Post('adjustment')
  @RequirePermission(PERMISSIONS.APPROVAL_CREATE)
  createAdjustment(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Body() input: CreateAttendanceAdjustmentDto,
    @Query() query: EmptyApprovalQueryDto,
  ) {
    void query;
    return this.approval.createAttendanceAdjustment(caller.user.id, organizationId, input);
  }

  @Get()
  @RequirePermission(PERMISSIONS.APPROVAL_READ)
  list(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: ListApprovalsQueryDto,
  ) {
    return this.approval.list(caller.user.id, organizationId, query);
  }

  @Get('summary')
  @RequirePermission(PERMISSIONS.APPROVAL_READ)
  getSummary(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: EmptyApprovalQueryDto,
  ) {
    void query;
    return this.approval.getSummary(caller.user.id, organizationId);
  }

  @Get(':approvalId')
  @RequirePermission(PERMISSIONS.APPROVAL_READ)
  get(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() ids: ApprovalParamDto,
    @Query() query: EmptyApprovalQueryDto,
  ) {
    void query;
    return this.approval.getById(caller.user.id, ids.organizationId, ids.approvalId);
  }

  @Post(':approvalId/approve')
  @RequirePermission(PERMISSIONS.APPROVAL_APPROVE)
  approve(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() ids: ApprovalParamDto,
    @Body() input: ApproveRequestDto,
    @Query() query: EmptyApprovalQueryDto,
  ) {
    void query;
    return this.approval.approve(caller.user.id, ids.organizationId, ids.approvalId, input);
  }

  @Post(':approvalId/reject')
  @RequirePermission(PERMISSIONS.APPROVAL_REJECT)
  reject(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() ids: ApprovalParamDto,
    @Body() input: RejectRequestDto,
    @Query() query: EmptyApprovalQueryDto,
  ) {
    void query;
    return this.approval.reject(caller.user.id, ids.organizationId, ids.approvalId, input);
  }

  @Post(':approvalId/cancel')
  @RequirePermission(PERMISSIONS.APPROVAL_CREATE)
  cancel(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() ids: ApprovalParamDto,
    @Body() input: CancelRequestDto,
    @Query() query: EmptyApprovalQueryDto,
  ) {
    void query;
    return this.approval.cancel(caller.user.id, ids.organizationId, ids.approvalId, input);
  }
}

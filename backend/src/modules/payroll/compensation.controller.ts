// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
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
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { BusinessJsonGuard } from '../../common/http/business-json';
import {
  CreateCompensationDto,
  ListCompensationQueryDto,
  UpdateCompensationDto,
} from './compensation.dto';
import { CompensationService } from './compensation.service';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class CompensationController {
  constructor(private readonly compensation: CompensationService) {}

  @Post('employees/:employeeId/compensation')
  @RequirePermission(PERMISSIONS.COMPENSATION_CREATE)
  create(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateCompensationDto,
  ) {
    return this.compensation.create(caller.user.id, organizationId, employeeId, dto);
  }

  @Get('employees/:employeeId/compensation')
  @RequirePermission(PERMISSIONS.COMPENSATION_READ)
  getEmployeeCompensation(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.compensation.getEmployeeCompensation(caller.user.id, organizationId, employeeId);
  }

  @Get('compensation')
  @RequirePermission(PERMISSIONS.COMPENSATION_READ)
  list(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: ListCompensationQueryDto,
  ) {
    return this.compensation.list(caller.user.id, organizationId, query);
  }

  @Patch('compensation/:profileId')
  @RequirePermission(PERMISSIONS.COMPENSATION_UPDATE)
  update(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateCompensationDto,
  ) {
    return this.compensation.update(caller.user.id, organizationId, profileId, dto);
  }
}

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
  CreateShiftDto,
  ListShiftsDto,
  ShiftOrgParamDto,
  ShiftParamDto,
  UpdateShiftDto,
} from './shift.dto';
import { ShiftService } from './shift.service';

@Controller('organizations/:organizationId/shifts')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}

  @Post()
  @RequirePermission(PERMISSIONS.SHIFT_CREATE)
  create(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: ShiftOrgParamDto,
    @Body() input: CreateShiftDto,
  ) {
    return this.shiftService.createShift(params.organizationId, caller.user.id, input);
  }

  @Get(':shiftId')
  @RequirePermission(PERMISSIONS.SHIFT_READ)
  get(
    @Param() params: ShiftParamDto,
  ) {
    return this.shiftService.getShift(params.organizationId, params.shiftId);
  }

  @Patch(':shiftId')
  @RequirePermission(PERMISSIONS.SHIFT_UPDATE)
  update(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: ShiftParamDto,
    @Body() input: UpdateShiftDto,
  ) {
    return this.shiftService.updateShift(params.organizationId, params.shiftId, caller.user.id, input);
  }

  @Delete(':shiftId')
  @RequirePermission(PERMISSIONS.SHIFT_MANAGE)
  delete(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param() params: ShiftParamDto,
  ) {
    return this.shiftService.deleteShift(params.organizationId, params.shiftId, caller.user.id);
  }

  @Get()
  @RequirePermission(PERMISSIONS.SHIFT_READ)
  list(
    @Param() params: ShiftOrgParamDto,
    @Query() query: ListShiftsDto,
  ) {
    return this.shiftService.listShifts(params.organizationId, query);
  }
}

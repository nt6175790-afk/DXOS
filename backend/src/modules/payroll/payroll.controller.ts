// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
  Get,
  Param,
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
  CreatePayrollPeriodDto,
  FinalizePayrollDto,
  ListPayrollPeriodQueryDto,
  ListPayrollRecordQueryDto,
  RequestPayrollApprovalDto,
} from './payroll.dto';
import { PayrollService } from './payroll.service';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Post('payroll-periods')
  @RequirePermission(PERMISSIONS.PAYROLL_CREATE)
  createPeriod(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreatePayrollPeriodDto,
  ) {
    return this.payroll.createPeriod(caller.user.id, organizationId, dto);
  }

  @Get('payroll-periods')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  listPeriods(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: ListPayrollPeriodQueryDto,
  ) {
    return this.payroll.listPeriods(caller.user.id, organizationId, query);
  }

  @Get('payroll-periods/:periodId')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  getPeriod(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.payroll.getPeriod(caller.user.id, organizationId, periodId);
  }

  @Post('payroll-periods/:periodId/calculate')
  @RequirePermission(PERMISSIONS.PAYROLL_CALCULATE)
  calculatePeriod(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.payroll.calculatePeriod(caller.user.id, organizationId, periodId);
  }

  @Post('payroll-periods/:periodId/request-approval')
  @RequirePermission(PERMISSIONS.PAYROLL_CALCULATE)
  requestApproval(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('periodId') periodId: string,
    @Body() dto: RequestPayrollApprovalDto,
  ) {
    return this.payroll.requestApproval(caller.user.id, organizationId, periodId, dto);
  }

  @Post('payroll-periods/:periodId/finalize')
  @RequirePermission(PERMISSIONS.PAYROLL_FINALIZE)
  finalizePeriod(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('periodId') periodId: string,
    @Body() dto: FinalizePayrollDto,
  ) {
    return this.payroll.finalizePeriod(caller.user.id, organizationId, periodId, dto);
  }

  @Get('payroll-periods/:periodId/records')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  listRecords(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('periodId') periodId: string,
    @Query() query: ListPayrollRecordQueryDto,
  ) {
    return this.payroll.listRecords(caller.user.id, organizationId, periodId, query);
  }

  @Get('payroll-records/:recordId')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  getRecord(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.payroll.getRecord(caller.user.id, organizationId, recordId);
  }

  @Get('me/payroll')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  getMyPayroll(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
  ) {
    return this.payroll.getMyPayroll(caller.user.id, organizationId);
  }
}

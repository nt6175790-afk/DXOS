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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { CreateRequirementDto, UpdateRequirementDto } from './documents.dto';
import { ComplianceService } from './compliance.service';

@Controller('organizations/:organizationId/compliance')
@UseGuards(JwtAuthGuard)
@OrganizationContext()
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
  ) {
    return this.complianceService.getSummary(caller.user.id, orgId);
  }

  @Get('departments')
  getDepartments(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
  ) {
    return this.complianceService.getDepartments(caller.user.id, orgId);
  }

  @Get('missing')
  getMissing(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
  ) {
    return this.complianceService.getMissingDocuments(caller.user.id, orgId);
  }

  @Get('expiring')
  getExpiring(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
  ) {
    return this.complianceService.getExpiring(caller.user.id, orgId);
  }

  @Get('employees/:employeeId')
  getEmployeeCompliance(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.complianceService.getEmployeeCompliance(caller.user.id, orgId, employeeId);
  }

  @Get('requirements')
  listRequirements(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
  ) {
    return this.complianceService.listRequirements(caller.user.id, orgId);
  }

  @Post('requirements')
  createRequirement(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Body() dto: CreateRequirementDto,
  ) {
    return this.complianceService.createRequirement(caller.user.id, orgId, dto);
  }

  @Patch('requirements/:id')
  updateRequirement(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRequirementDto,
  ) {
    return this.complianceService.updateRequirement(caller.user.id, orgId, id, dto);
  }

  @Delete('requirements/:id')
  deleteRequirement(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.complianceService.deleteRequirement(caller.user.id, orgId, id);
  }
}

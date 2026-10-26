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
  CompleteReviewDto,
  CreateGoalDto,
  CreateKpiDto,
  CreateReviewCycleDto,
  CreateReviewDto,
  ListCycleQueryDto,
  ListGoalQueryDto,
  ListKpiQueryDto,
  ListReviewQueryDto,
  SubmitManagerReviewDto,
  SubmitSelfAssessmentDto,
  UpdateGoalDto,
  UpdateKpiDto,
  UpdateReviewCycleDto,
} from './performance.dto';
import { PerformanceService } from './performance.service';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard, BusinessJsonGuard)
@OrganizationContext()
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  // ==========================================
  // REVIEW CYCLES
  // ==========================================

  @Post('performance-cycles')
  @RequirePermission(PERMISSIONS.PERFORMANCE_CREATE)
  createCycle(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateReviewCycleDto,
  ) {
    return this.performance.createCycle(caller.user.id, organizationId, dto);
  }

  @Get('performance-cycles')
  @RequirePermission(PERMISSIONS.PERFORMANCE_READ)
  listCycles(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: ListCycleQueryDto,
  ) {
    return this.performance.listCycles(caller.user.id, organizationId, query);
  }

  @Get('performance-cycles/:cycleId')
  @RequirePermission(PERMISSIONS.PERFORMANCE_READ)
  getCycle(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('cycleId') cycleId: string,
  ) {
    return this.performance.getCycle(caller.user.id, organizationId, cycleId);
  }

  @Patch('performance-cycles/:cycleId')
  @RequirePermission(PERMISSIONS.PERFORMANCE_UPDATE)
  updateCycle(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('cycleId') cycleId: string,
    @Body() dto: UpdateReviewCycleDto,
  ) {
    return this.performance.updateCycle(caller.user.id, organizationId, cycleId, dto);
  }

  // ==========================================
  // GOALS
  // ==========================================

  @Post('performance-goals')
  @RequirePermission(PERMISSIONS.GOAL_CREATE)
  createGoal(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateGoalDto,
  ) {
    return this.performance.createGoal(caller.user.id, organizationId, dto);
  }

  @Get('performance-goals')
  @RequirePermission(PERMISSIONS.GOAL_READ)
  listGoals(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: ListGoalQueryDto,
  ) {
    return this.performance.listGoals(caller.user.id, organizationId, query);
  }

  @Patch('performance-goals/:goalId')
  @RequirePermission(PERMISSIONS.GOAL_UPDATE)
  updateGoal(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('goalId') goalId: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.performance.updateGoal(caller.user.id, organizationId, goalId, dto);
  }

  // ==========================================
  // KPIS
  // ==========================================

  @Post('performance-kpis')
  @RequirePermission(PERMISSIONS.PERFORMANCE_CREATE)
  createKpi(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateKpiDto,
  ) {
    return this.performance.createKpi(caller.user.id, organizationId, dto);
  }

  @Get('performance-kpis')
  @RequirePermission(PERMISSIONS.KPI_READ)
  listKpis(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: ListKpiQueryDto,
  ) {
    return this.performance.listKpis(caller.user.id, organizationId, query);
  }

  @Patch('performance-kpis/:kpiId')
  @RequirePermission(PERMISSIONS.KPI_UPDATE)
  updateKpi(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('kpiId') kpiId: string,
    @Body() dto: UpdateKpiDto,
  ) {
    return this.performance.updateKpi(caller.user.id, organizationId, kpiId, dto);
  }

  // ==========================================
  // PERFORMANCE REVIEWS
  // ==========================================

  @Post('performance-reviews')
  @RequirePermission(PERMISSIONS.PERFORMANCE_CREATE)
  createReview(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.performance.createReview(caller.user.id, organizationId, dto);
  }

  @Get('performance-reviews')
  @RequirePermission(PERMISSIONS.PERFORMANCE_READ)
  listReviews(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: ListReviewQueryDto,
  ) {
    return this.performance.listReviews(caller.user.id, organizationId, query);
  }

  @Get('performance-reviews/:reviewId')
  @RequirePermission(PERMISSIONS.PERFORMANCE_READ)
  getReview(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.performance.getReview(caller.user.id, organizationId, reviewId);
  }

  @Post('performance-reviews/:reviewId/self-assessment')
  @RequirePermission(PERMISSIONS.PERFORMANCE_READ)
  submitSelfAssessment(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: SubmitSelfAssessmentDto,
  ) {
    return this.performance.submitSelfAssessment(caller.user.id, organizationId, reviewId, dto);
  }

  @Post('performance-reviews/:reviewId/manager-review')
  @RequirePermission(PERMISSIONS.PERFORMANCE_REVIEW)
  submitManagerReview(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: SubmitManagerReviewDto,
  ) {
    return this.performance.submitManagerReview(caller.user.id, organizationId, reviewId, dto);
  }

  @Post('performance-reviews/:reviewId/complete')
  @RequirePermission(PERMISSIONS.PERFORMANCE_REVIEW)
  completeReview(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: CompleteReviewDto,
  ) {
    return this.performance.completeReview(caller.user.id, organizationId, reviewId, dto);
  }

  @Post('performance-reviews/:reviewId/cancel')
  @RequirePermission(PERMISSIONS.PERFORMANCE_MANAGE)
  cancelReview(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.performance.cancelReview(caller.user.id, organizationId, reviewId);
  }

  // ==========================================
  // DASHBOARD & EMPLOYEE PROFILE
  // ==========================================

  @Get('performance-dashboard')
  @RequirePermission(PERMISSIONS.PERFORMANCE_READ)
  getDashboardSummary(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
  ) {
    return this.performance.getDashboardSummary(caller.user.id, organizationId);
  }

  @Get('employees/:employeeId/performance-profile')
  @RequirePermission(PERMISSIONS.PERFORMANCE_READ)
  getEmployeeProfile(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.performance.getEmployeeProfile(caller.user.id, organizationId, employeeId);
  }
}

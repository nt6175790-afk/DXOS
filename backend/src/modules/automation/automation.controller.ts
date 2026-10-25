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
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { AutomationRuleService } from './automation-rule.service';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationSchedulerService } from './automation-scheduler.service';
import {
  CreateAutomationRuleDto,
  RunAutomationDto,
  UpdateAutomationRuleDto,
} from './automation.dto';

@Controller('organizations/:organizationId/automation')
@UseGuards(JwtAuthGuard)
@OrganizationContext()
export class AutomationController {
  constructor(
    private readonly ruleService: AutomationRuleService,
    private readonly engineService: AutomationEngineService,
    private readonly schedulerService: AutomationSchedulerService,
  ) {}

  @Get('rules')
  listRules(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
  ) {
    return this.ruleService.listRules(caller.user.id, orgId);
  }

  @Post('rules')
  createRule(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Body() dto: CreateAutomationRuleDto,
  ) {
    return this.ruleService.createRule(caller.user.id, orgId, dto);
  }

  @Get('rules/:id')
  getRule(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.ruleService.getRule(caller.user.id, orgId, id);
  }

  @Patch('rules/:id')
  updateRule(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return this.ruleService.updateRule(caller.user.id, orgId, id, dto);
  }

  @Patch('rules/:id/toggle')
  toggleRule(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.ruleService.toggleRule(caller.user.id, orgId, id, Boolean(isActive));
  }

  @Delete('rules/:id')
  deleteRule(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.ruleService.deleteRule(caller.user.id, orgId, id);
  }

  @Get('executions')
  @UseGuards(OrganizationPermissionGuard)
  @RequirePermission(PERMISSIONS.AUTOMATION_READ)
  listExecutions(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Query('limit') limit?: number,
  ) {
    return this.engineService.listExecutions(caller.user.id, orgId, limit);
  }

  @Post('run')
  @UseGuards(OrganizationPermissionGuard)
  @RequirePermission(PERMISSIONS.AUTOMATION_MANAGE)
  runScan(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Body() dto: RunAutomationDto,
  ) {
    return this.schedulerService.runScan(orgId, caller.user.id, dto.trigger);
  }
}

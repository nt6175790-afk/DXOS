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
import { WorkflowService } from './workflow.service';
import {
  CancelWorkflowDto,
  ConfirmWorkflowStepDto,
  CreateWorkflowInstanceDto,
  ListWorkflowInstancesDto,
} from './workflow.dto';

@Controller('organizations/:organizationId/workflows')
@UseGuards(JwtAuthGuard)
@OrganizationContext()
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('definitions')
  listDefinitions(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
  ) {
    return this.workflowService.listDefinitions(caller.user.id, orgId);
  }

  @Get()
  listInstances(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Query() query: ListWorkflowInstancesDto,
  ) {
    return this.workflowService.listInstances(caller.user.id, orgId, query);
  }

  @Get(':id')
  getInstance(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.workflowService.getInstance(caller.user.id, orgId, id);
  }

  @Post()
  startWorkflow(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Body() dto: CreateWorkflowInstanceDto,
  ) {
    return this.workflowService.startWorkflow(caller.user.id, orgId, dto);
  }

  @Post(':id/steps/:stepId/confirm')
  confirmStep(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') instanceId: string,
    @Param('stepId') stepId: string,
    @Body() dto: ConfirmWorkflowStepDto,
  ) {
    return this.workflowService.confirmStep(caller.user.id, orgId, instanceId, stepId, dto);
  }

  @Post(':id/cancel')
  cancelWorkflow(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') instanceId: string,
    @Body() dto: CancelWorkflowDto,
  ) {
    return this.workflowService.cancelWorkflow(caller.user.id, orgId, instanceId, dto);
  }

  @Post(':id/retry')
  retry(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') orgId: string, @Param('id') id: string) {
    return this.workflowService.retry(caller.user.id, orgId, id);
  }
}

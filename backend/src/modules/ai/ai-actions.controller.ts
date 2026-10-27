// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS as P } from '../rbac/permission-catalog';
import { AiTaskDraftsService } from './ai-task-drafts.service';
import { AiKnowledgeService } from './ai-knowledge.service';
import { ConfirmAiTaskDto, ProposeAiTaskDto, SearchKnowledgeDto } from './ai-actions.dto';
@Controller('organizations/:organizationId/ai')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard)
@OrganizationContext()
export class AiActionsController {
  constructor(private readonly drafts: AiTaskDraftsService, private readonly knowledge: AiKnowledgeService) {}
  @Post('task-drafts') @RequirePermission(P.AI_USE) @Header('Cache-Control', 'private, no-store')
  propose(@CurrentUser() actor: AuthenticatedRequestContext, @Param('organizationId') org: string, @Body() body: ProposeAiTaskDto) {
    return this.drafts.propose(actor.user.id, org, body.prompt);
  }
  @Post('task-drafts/:id/confirm') @HttpCode(200) @RequirePermission(P.AI_USE) @Header('Cache-Control', 'private, no-store')
  confirm(@CurrentUser() actor: AuthenticatedRequestContext, @Param('organizationId') org: string,
    @Param('id', ParseUUIDPipe) id: string, @Body() body: ConfirmAiTaskDto) { return this.drafts.confirm(actor.user.id, org, id, body); }
  @Get('knowledge') @RequirePermission(P.AI_USE) @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() actor: AuthenticatedRequestContext, @Param('organizationId') org: string) { return this.knowledge.list(actor.user.id, org); }
  @Post('knowledge/search') @HttpCode(200) @RequirePermission(P.AI_USE) @Header('Cache-Control', 'private, no-store')
  search(@CurrentUser() actor: AuthenticatedRequestContext, @Param('organizationId') org: string, @Body() body: SearchKnowledgeDto) {
    return this.knowledge.search(actor.user.id, org, body.query);
  }
  @Post('knowledge/:id/index') @HttpCode(200) @RequirePermission(P.AI_USE)
  index(@CurrentUser() actor: AuthenticatedRequestContext, @Param('organizationId') org: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.index(actor.user.id, org, id);
  }
  @Delete('knowledge/:id') @RequirePermission(P.AI_USE)
  remove(@CurrentUser() actor: AuthenticatedRequestContext, @Param('organizationId') org: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.remove(actor.user.id, org, id);
  }
}

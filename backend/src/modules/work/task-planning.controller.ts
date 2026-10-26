// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, SetMetadata, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BusinessJsonGuard } from '../../common/http/business-json';
import { EmptyTaskQueryDto, TaskIdDto } from './task.dto';
import { TaskPermissionGuard } from './task-permission.guard';
import { TASK_COLLABORATION_KIND } from './task-policy';
import { CreateTaskChecklistItemDto, SetTaskReviewerDto, TaskActivityQueryDto, TaskChecklistItemIdDto, UpdateTaskChecklistItemDto } from './task-planning.dto';
import { TaskPlanningService } from './task-planning.service';

@Controller('organizations/:organizationId/tasks/:taskId')
@UseGuards(JwtAuthGuard, TaskPermissionGuard, BusinessJsonGuard)
export class TaskPlanningController {
  constructor(private readonly planning: TaskPlanningService) {}

  @Get('planning') @SetMetadata(TASK_COLLABORATION_KIND, 'planning')
  get(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto, @Query() query: EmptyTaskQueryDto) {
    void query; return this.planning.get(caller.user.id, ids.organizationId, ids.taskId);
  }

  @Patch('planning/reviewer') @SetMetadata(TASK_COLLABORATION_KIND, 'reviewer')
  reviewer(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto, @Body() input: SetTaskReviewerDto,
    @Query() query: EmptyTaskQueryDto) { void query; return this.planning.setReviewer(caller.user.id, ids.organizationId, ids.taskId, input); }

  @Post('checklist') @SetMetadata(TASK_COLLABORATION_KIND, 'checklist')
  createChecklist(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto, @Body() input: CreateTaskChecklistItemDto,
    @Query() query: EmptyTaskQueryDto) { void query; return this.planning.createChecklistItem(caller.user.id, ids.organizationId, ids.taskId, input); }

  @Patch('checklist/:itemId') @SetMetadata(TASK_COLLABORATION_KIND, 'checklist')
  updateChecklist(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskChecklistItemIdDto, @Body() input: UpdateTaskChecklistItemDto,
    @Query() query: EmptyTaskQueryDto) { void query; return this.planning.updateChecklistItem(caller.user.id, ids.organizationId, ids.taskId, ids.itemId, input); }

  @Delete('checklist/:itemId') @HttpCode(204) @SetMetadata(TASK_COLLABORATION_KIND, 'checklist')
  deleteChecklist(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskChecklistItemIdDto,
    @Query() query: EmptyTaskQueryDto, @Body() body: EmptyTaskQueryDto) { void query; void body; return this.planning.deleteChecklistItem(caller.user.id, ids.organizationId, ids.taskId, ids.itemId); }

  @Get('activity') @SetMetadata(TASK_COLLABORATION_KIND, 'activity')
  activity(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto, @Query() query: TaskActivityQueryDto) {
    return this.planning.activity(caller.user.id, ids.organizationId, ids.taskId, query);
  }
}

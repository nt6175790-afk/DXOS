// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BusinessJsonGuard } from '../../common/http/business-json';
import { TaskPermissionGuard } from './task-permission.guard';
import { CreateTaskDto, EmptyTaskQueryDto, ListTasksDto, TaskIdDto, UpdateTaskDto } from './task.dto';
import { TasksService } from './tasks.service';

@Controller('organizations/:organizationId/tasks')
@UseGuards(JwtAuthGuard, TaskPermissionGuard, BusinessJsonGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}
  @Post()
  create(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Body() input: CreateTaskDto, @Query() query: EmptyTaskQueryDto) { void query; return this.tasks.create(caller.user.id, organizationId, input); }
  @Get()
  list(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: ListTasksDto) { return this.tasks.list(caller.user.id, organizationId, query); }
  @Get(':taskId')
  get(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto, @Query() query: EmptyTaskQueryDto) {
    void query; return this.tasks.getById(caller.user.id, ids.organizationId, ids.taskId);
  }
  @Patch(':taskId')
  update(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto, @Body() input: UpdateTaskDto, @Query() query: EmptyTaskQueryDto) {
    void query; return this.tasks.update(caller.user.id, ids.organizationId, ids.taskId, input);
  }
}

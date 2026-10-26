// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, SetMetadata, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BusinessJsonGuard } from '../../common/http/business-json';
import { TaskPermissionGuard } from './task-permission.guard';
import { TASK_COLLABORATION_KIND } from './task-policy';
import { EmptyTaskQueryDto, TaskIdDto } from './task.dto';
import { CreateTaskCommentDto, LinkTaskAttachmentDto, TaskAttachmentIdDto, TaskCollaborationPageDto } from './task-collaboration.dto';
import { TaskCollaborationService } from './task-collaboration.service';

@Controller('organizations/:organizationId/tasks/:taskId')
@UseGuards(JwtAuthGuard, TaskPermissionGuard, BusinessJsonGuard)
export class TaskCollaborationController {
  constructor(private readonly collaboration: TaskCollaborationService) {}

  @Get('comments') @SetMetadata(TASK_COLLABORATION_KIND, 'comments')
  comments(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto, @Query() query: TaskCollaborationPageDto) {
    return this.collaboration.listComments(caller.user.id, ids.organizationId, ids.taskId, query);
  }
  @Post('comments') @SetMetadata(TASK_COLLABORATION_KIND, 'comments')
  comment(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto,
    @Body() body: CreateTaskCommentDto, @Query() query: EmptyTaskQueryDto) {
    void query; return this.collaboration.addComment(caller.user.id, ids.organizationId, ids.taskId, body);
  }
  @Get('attachments') @SetMetadata(TASK_COLLABORATION_KIND, 'attachments')
  attachments(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto, @Query() query: TaskCollaborationPageDto) {
    return this.collaboration.listAttachments(caller.user.id, ids.organizationId, ids.taskId, query);
  }
  @Post('attachments') @SetMetadata(TASK_COLLABORATION_KIND, 'attachments')
  attach(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskIdDto,
    @Body() body: LinkTaskAttachmentDto, @Query() query: EmptyTaskQueryDto) {
    void query; return this.collaboration.linkAttachment(caller.user.id, ids.organizationId, ids.taskId, body);
  }
  @Delete('attachments/:attachmentId') @HttpCode(204) @SetMetadata(TASK_COLLABORATION_KIND, 'attachments')
  detach(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: TaskAttachmentIdDto,
    @Query() query: EmptyTaskQueryDto, @Body() body: EmptyTaskQueryDto) {
    void query; void body;
    return this.collaboration.unlinkAttachment(caller.user.id, ids.organizationId, ids.taskId, ids.attachmentId);
  }
}

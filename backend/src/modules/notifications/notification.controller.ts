// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { EmptyNotificationQueryDto, MarkNotificationReadDto, NotificationQueryDto } from './notification.dto';

@Controller('organizations/:organizationId/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: NotificationQueryDto) {
    return this.notifications.list(caller.user.id, organizationId, query);
  }

  @Patch(':notificationId/read')
  markRead(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Param('notificationId') notificationId: string, @Body() body: MarkNotificationReadDto) {
    void body;
    return this.notifications.markRead(caller.user.id, organizationId, notificationId);
  }

  @Get('summary')
  summary(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string, @Query() query: EmptyNotificationQueryDto) {
    void query; return this.notifications.summary(caller.user.id, organizationId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: EmptyNotificationQueryDto, @Body() body: MarkNotificationReadDto) {
    void query; void body; return this.notifications.markAllRead(caller.user.id, organizationId);
  }
}

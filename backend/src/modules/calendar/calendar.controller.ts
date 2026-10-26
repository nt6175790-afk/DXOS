// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { BusinessJsonGuard } from '../../common/http/business-json';
import { CalendarService } from './calendar.service';
import { CalendarQueryDto, CreateCalendarEventDto, UpdateCalendarEventDto, CalendarEventIdDto, EmptyCalendarQueryDto } from './calendar.dto';

@Controller('organizations/:organizationId/calendar') @UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}
  @Get()
  list(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string, @Query() query: CalendarQueryDto) {
    return this.calendar.list(caller.user.id, organizationId, query);
  }
  @Post('events') @UseGuards(OrganizationPermissionGuard, BusinessJsonGuard) @RequirePermission(PERMISSIONS.CALENDAR_CREATE)
  create(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string, @Body() input: CreateCalendarEventDto, @Query() query: EmptyCalendarQueryDto) {
    void query; return this.calendar.create(caller.user.id, organizationId, input);
  }
  @Patch('events/:eventId') @UseGuards(OrganizationPermissionGuard, BusinessJsonGuard) @RequirePermission(PERMISSIONS.CALENDAR_UPDATE)
  update(@CurrentUser() caller: AuthenticatedRequestContext, @Param() ids: CalendarEventIdDto, @Body() input: UpdateCalendarEventDto, @Query() query: EmptyCalendarQueryDto) {
    void query; return this.calendar.update(caller.user.id, ids.organizationId, ids.eventId, input);
  }
}

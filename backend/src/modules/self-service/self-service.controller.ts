// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SelfServiceService } from './self-service.service';
import { MyScheduleQueryDto } from './self-service.dto';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard)
export class SelfServiceController {
  constructor(private readonly selfService: SelfServiceService) {}

  @Get('my-schedule')
  getMySchedule(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: MyScheduleQueryDto,
  ) {
    return this.selfService.getMyScheduleOverview(organizationId, caller.user.id, query);
  }

  @Get('me/work-overview')
  getWorkOverview(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Query() query: MyScheduleQueryDto,
  ) {
    return this.selfService.getMyScheduleOverview(organizationId, caller.user.id, query);
  }
}

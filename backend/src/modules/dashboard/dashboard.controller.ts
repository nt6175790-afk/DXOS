// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

export class EmptyDashboardQueryDto {}

@Controller('organizations/:organizationId/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: EmptyDashboardQueryDto) {
    void query;
    return this.dashboard.get(caller.user.id, organizationId);
  }
}

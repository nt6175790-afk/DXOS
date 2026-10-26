// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Header, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { ReportQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('organizations/:organizationId/reports')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard)
@OrganizationContext()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get(':kind/export') @RequirePermission(PERMISSIONS.REPORT_EXPORT) @Header('Cache-Control', 'no-store')
  async export(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') org: string,
    @Param('kind') kind: string, @Query() q: ReportQueryDto, @Res({ passthrough: true }) response: ServerResponse) {
    const csv = await this.reports.get(caller.user.id, org, q, kind, true);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="hr-${kind}-${q.dateFrom}-${q.dateTo}.csv"`);
    return csv;
  }
  @Get(':kind') @RequirePermission(PERMISSIONS.REPORT_READ) @Header('Cache-Control', 'no-store')
  get(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') org: string, @Param('kind') kind: string, @Query() q: ReportQueryDto) {
    return this.reports.get(caller.user.id, org, q, kind);
  }
}

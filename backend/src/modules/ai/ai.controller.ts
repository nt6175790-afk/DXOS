// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { AiService } from './ai.service';
import { EmptyAiQuery, GenerateAiDto } from './ai.dto';

@Controller('organizations/:organizationId/ai')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard)
@OrganizationContext()
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('config')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission(PERMISSIONS.AI_USE)
  getConfig(@Param('organizationId') organizationId: string) {
    return this.ai.getConfig(organizationId);
  }

  @Get('insights')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission(PERMISSIONS.AI_USE)
  getInsights(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string
  ) {
    return this.ai.getInsights(caller.user.id, organizationId);
  }

  @Post('generate')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission(PERMISSIONS.AI_USE)
  generate(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') organizationId: string,
    @Body() input: GenerateAiDto,
    @Query() query: EmptyAiQuery
  ) {
    void query;
    return this.ai.generate(caller.user.id, organizationId, input);
  }
}

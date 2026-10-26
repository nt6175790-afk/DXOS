// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { SearchQueryDto } from './search.dto';
import { SearchService } from './search.service';

@Controller('organizations/:organizationId/search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}
  @Get()
  search(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string, @Query() query: SearchQueryDto) {
    return this.searchService.search(caller.user.id, organizationId, query);
  }
}

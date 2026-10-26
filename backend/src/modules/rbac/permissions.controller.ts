// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { AuthorizationService } from './authorization.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export class EmptyPermissionQueryDto {}

@Controller('organizations/:organizationId/permissions')
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(private readonly authorization: AuthorizationService, private readonly audit: AuditService,
    private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') organizationId: string,
    @Query() query: EmptyPermissionQueryDto) {
    void query;
    const permissions = await this.prisma.$transaction((tx) =>
      this.authorization.effectivePermissions(caller.user.id, organizationId, tx),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (permissions === null) {
      await this.audit.record({ event: AUDIT_EVENTS.AUTHORIZATION_DENIED, actorUserId: caller.user.id,
        metadata: { reason: 'PERMISSION_DENIED' } });
      throw new ForbiddenException();
    }
    return { organizationId, permissions };
  }
}

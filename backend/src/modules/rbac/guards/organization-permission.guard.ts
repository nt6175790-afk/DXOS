// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { AuthorizationService } from '../authorization.service';
import { ORGANIZATION_CONTEXT_PARAM } from '../decorators/organization-context.decorator';
import { REQUIRED_PERMISSION } from '../decorators/require-permission.decorator';
import { isOrganizationIdentifier, type PermissionKey } from '../permission-catalog';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_EVENTS } from '../../audit/audit-catalog';

@Injectable()
export class OrganizationPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<PermissionKey>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const currentUser = request.auth?.user;
    if (!currentUser) {
      throw new UnauthorizedException();
    }

    if (!permission) {
      return this.deny(currentUser.id);
    }

    const parameterName = this.reflector.getAllAndOverride<string>(ORGANIZATION_CONTEXT_PARAM, [
      context.getHandler(),
      context.getClass(),
    ]) ?? 'organizationId';
    const organizationId = request.params?.[parameterName];

    if (!isOrganizationIdentifier(organizationId)) {
      return this.deny(currentUser.id);
    }

    if (!(await this.authorizationService.can(currentUser.id, permission, organizationId))) {
      return this.deny(currentUser.id);
    }

    return true;
  }

  private async deny(actorUserId: string): Promise<never> {
    await this.audit.record({ event: AUDIT_EVENTS.AUTHORIZATION_DENIED, actorUserId,
      metadata: { reason: 'PERMISSION_DENIED' } });
    throw new ForbiddenException();
  }
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../rbac/authorization.service';
import { isOrganizationIdentifier } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { taskPermissions, collaborationPermissions, TASK_COLLABORATION_KIND, type TaskCollaborationKind } from './task-policy';

@Injectable()
export class TaskPermissionGuard implements CanActivate {
  constructor(private readonly authorization: AuthorizationService, private readonly audit: AuditService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { body?: unknown }>();
    const actor = request.auth?.user.id;
    if (!actor) throw new UnauthorizedException();
    const organizationId = request.params?.organizationId;
    const method = request.method === 'POST' ? 'POST' : request.method === 'PATCH' ? 'PATCH' : 'GET';
    const kind = this.reflector.getAllAndOverride<TaskCollaborationKind | undefined>(TASK_COLLABORATION_KIND, [context.getHandler(), context.getClass()]);
    if (isOrganizationIdentifier(organizationId)) {
      let allowed = true;
      for (const key of kind ? collaborationPermissions(request.method, kind) : taskPermissions(method, request.body)) {
        if (!(await this.authorization.can(actor, key, organizationId))) { allowed = false; break; }
      }
      if (allowed) return true;
    }
    await this.audit.record({ event: AUDIT_EVENTS.AUTHORIZATION_DENIED, actorUserId: actor, metadata: { reason: 'PERMISSION_DENIED' } });
    throw new ForbiddenException();
  }
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import {
  AuthRateLimitService,
  type AuthRateLimitScope,
  type RateLimitResponse,
} from './auth-rate-limit.service';

const AUTH_RATE_LIMIT_METADATA = 'dxos:auth-rate-limit-scope';

export const UseAuthRateLimit = (scope: AuthRateLimitScope): MethodDecorator =>
  SetMetadata(AUTH_RATE_LIMIT_METADATA, scope);

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: AuthRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.get<AuthRateLimitScope>(AUTH_RATE_LIMIT_METADATA, context.getHandler());
    if (!scope) return true;

    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const response = context.switchToHttp().getResponse<RateLimitResponse>();
    await this.rateLimit.enforce(scope, request, response);
    return true;
  }
}

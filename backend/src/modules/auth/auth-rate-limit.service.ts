// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { ApiErrorException } from '../../common/errors/api-error.exception';
import type { AppConfiguration } from '../../config/environment';
import {
  AuthRateLimitStore,
  RateLimitStoreUnavailableError,
  type RateLimitStore,
} from './auth-rate-limit.store';

export const AUTH_RATE_LIMIT_SCOPES = {
  LOGIN: 'login',
  REFRESH: 'refresh',
} as const;

export type AuthRateLimitScope = (typeof AUTH_RATE_LIMIT_SCOPES)[keyof typeof AUTH_RATE_LIMIT_SCOPES];

export interface RateLimitResponse {
  setHeader(name: string, value: string): void;
}

interface RateLimitRequest extends IncomingMessage {
  socket: IncomingMessage['socket'];
}

interface Policy {
  limit: number;
  windowMs: number;
}

function clientAddress(request: RateLimitRequest): string {
  const address = request.socket?.remoteAddress?.trim();
  if (!address) return 'unknown';

  const normalized = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  return isIP(normalized) ? normalized : 'unknown';
}

@Injectable()
export class AuthRateLimitService {
  private readonly policies: Record<AuthRateLimitScope, Policy>;

  constructor(
    configService: ConfigService,
    @Inject(AuthRateLimitStore)
    private readonly store: RateLimitStore = new AuthRateLimitStore(configService),
  ) {
    const config = configService.getOrThrow<AppConfiguration>('app');
    this.policies = {
      [AUTH_RATE_LIMIT_SCOPES.LOGIN]: {
        limit: config.rateLimitLoginLimit,
        windowMs: config.rateLimitLoginWindowSeconds * 1_000,
      },
      [AUTH_RATE_LIMIT_SCOPES.REFRESH]: {
        limit: config.rateLimitRefreshLimit,
        windowMs: config.rateLimitRefreshWindowSeconds * 1_000,
      },
    };
  }

  async enforce(scope: AuthRateLimitScope, request: RateLimitRequest, response: RateLimitResponse): Promise<void> {
    const policy = this.policies[scope];
    const key = `auth:rate-limit:v1:${scope}:${clientAddress(request)}`;
    let result;
    try {
      result = await this.store.increment(key, policy.windowMs);
    } catch (error) {
      if (error instanceof RateLimitStoreUnavailableError) {
        throw new ApiErrorException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'AUTH_RATE_LIMIT_UNAVAILABLE',
          'Authentication is temporarily unavailable. Please try again later.',
        );
      }
      throw error;
    }

    if (result.count <= policy.limit) return;

    response.setHeader('Retry-After', String(result.retryAfterSeconds));
    throw new ApiErrorException(
      HttpStatus.TOO_MANY_REQUESTS,
      'TOO_MANY_REQUESTS',
      'Too many requests. Please try again later.',
    );
  }

}

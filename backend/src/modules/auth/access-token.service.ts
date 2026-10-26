// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { InternalServerErrorException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign, verify } from 'jsonwebtoken';
import type { AppConfiguration } from '../../config/environment';
import type { AccessTokenPayload } from './auth.types';

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.sid === 'string' &&
    payload.typ === 'access'
  );
}

@Injectable()
export class AccessTokenService {
  constructor(private readonly configService: ConfigService) {}

  sign(payload: AccessTokenPayload): string {
    const config = this.configService.getOrThrow<AppConfiguration>('app');
    if (!config.jwtAccessSecret) {
      throw new InternalServerErrorException();
    }

    return sign(payload, config.jwtAccessSecret, {
      algorithm: 'HS256',
      expiresIn: config.jwtAccessTtlSeconds,
    });
  }

  verify(token: string): AccessTokenPayload | undefined {
    const config = this.configService.getOrThrow<AppConfiguration>('app');
    if (!config.jwtAccessSecret) {
      return undefined;
    }

    try {
      const payload = verify(token, config.jwtAccessSecret, { algorithms: ['HS256'] });
      return isAccessTokenPayload(payload) ? payload : undefined;
    } catch {
      return undefined;
    }
  }
}

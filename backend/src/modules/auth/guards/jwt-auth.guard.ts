// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserAccountStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthenticatedRequest } from '../auth.types';
import { AccessTokenService } from '../access-token.service';
import { currentRequest } from '../../../common/http/request-context';

function extractBearerToken(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(value);
  return match?.[1];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException();
    }

    const payload = this.accessTokenService.verify(token);
    if (!payload) {
      throw new UnauthorizedException();
    }

    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { accountStatus: UserAccountStatus.ACTIVE },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            accountStatus: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    request.auth = { sessionId: session.id, user: session.user };
    const correlation = currentRequest.getStore();
    if (correlation) correlation.actorUserId = session.user.id;
    return true;
  }
}

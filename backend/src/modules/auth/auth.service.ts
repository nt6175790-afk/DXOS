// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserAccountStatus } from '@prisma/client';
import { ApiErrorException } from '../../common/errors/api-error.exception';
import type { AppConfiguration } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import type { AccessTokenPayload, AuthenticatedUser } from './auth.types';
import type { AuthResponseDto } from './dto/auth-response.dto';
import type { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import { AccessTokenService } from './access-token.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';

const refreshTokenPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/i;

interface RefreshTokenParts {
  sessionId: string;
  token: string;
  tokenHash: string;
}

interface NewSession extends RefreshTokenParts {
  expiresAt: Date;
}

function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashesMatch(actual: string, expected: string): boolean {
  const actualHash = Buffer.from(actual, 'hex');
  const expectedHash = Buffer.from(expected, 'hex');

  return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly accessTokenService: AccessTokenService,
    private readonly configService: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(login: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: canonicalizeEmail(login.email) },
      select: {
        id: true,
        email: true,
        displayName: true,
        passwordHash: true,
        accountStatus: true,
      },
    });

    if (!user || !user.passwordHash) {
      await this.passwordService.consumeVerificationCost(login.password);
      await this.audit.record({ event: AUDIT_EVENTS.LOGIN_FAILURE, metadata: { reason: 'INVALID_CREDENTIALS' } });
      this.rejectInvalidCredentials();
    }

    const isValidPassword = await this.passwordService.verify(login.password, user.passwordHash);
    if (!isValidPassword) {
      await this.audit.record({ event: AUDIT_EVENTS.LOGIN_FAILURE, metadata: { reason: 'INVALID_CREDENTIALS' } });
      this.rejectInvalidCredentials();
    }

    if (user.accountStatus !== UserAccountStatus.ACTIVE) {
      await this.audit.record({ event: AUDIT_EVENTS.LOGIN_FAILURE, actorUserId: user.id,
        metadata: { reason: user.accountStatus === UserAccountStatus.INACTIVE ? 'ACCOUNT_INACTIVE' : 'ACCOUNT_SUSPENDED' } });
    }
    this.assertActive(user.accountStatus);
    const tokens = await this.createTokens(this.toAuthenticatedUser(user));

    return tokens;
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const parts = this.parseRefreshToken(refreshToken);
    if (!parts) {
      throw new UnauthorizedException();
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: parts.sessionId },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        expiresAt: true,
        revokedAt: true,
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

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !hashesMatch(session.refreshTokenHash, parts.tokenHash)
    ) {
      throw new UnauthorizedException();
    }

    this.assertActive(session.user.accountStatus);
    const nextSession = this.createNewSession();
    const revokedAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.authSession.updateMany({
        where: {
          id: session.id,
          userId: session.userId,
          refreshTokenHash: parts.tokenHash,
          revokedAt: null,
          expiresAt: { gt: revokedAt },
          user: { accountStatus: UserAccountStatus.ACTIVE },
        },
        data: { revokedAt },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException();
      }

      await transaction.authSession.create({
        data: {
          id: nextSession.sessionId,
          userId: session.userId,
          refreshTokenHash: nextSession.tokenHash,
          expiresAt: nextSession.expiresAt,
        },
      });
      await this.audit.record({ event: AUDIT_EVENTS.REFRESH, actorUserId: session.userId }, transaction);
    });

    return this.createAccessResponse(this.toAuthenticatedUser(session.user), nextSession);
  }

  // Only called after verified issuer/subject resolution; uses existing session/audit flow.
  async loginFederatedUser(userId: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: {
      id: true, email: true, displayName: true, accountStatus: true,
    } });
    if (!user) throw new UnauthorizedException();
    this.assertActive(user.accountStatus);
    return this.createTokens(user);
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.authSession.updateMany({
        where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() },
      });
      if (revoked.count > 0) await this.audit.record({ event: AUDIT_EVENTS.LOGOUT, actorUserId: userId }, tx);
    });
  }

  private async createTokens(user: AuthenticatedUser): Promise<AuthResponseDto> {
    const session = this.createNewSession();

    // Sign before committing so signing failures cannot leave a successful audit/session.
    const response = await this.createAccessResponse(user, session);
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.create({
      data: {
        id: session.sessionId,
        userId: user.id,
        refreshTokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
      },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await this.audit.record({ event: AUDIT_EVENTS.LOGIN_SUCCESS, actorUserId: user.id }, tx);
    });
    return response;
  }

  private async createAccessResponse(user: AuthenticatedUser, session: NewSession): Promise<AuthResponseDto> {
    const config = this.configService.getOrThrow<AppConfiguration>('app');
    const payload: AccessTokenPayload = { sub: user.id, sid: session.sessionId, typ: 'access' };
    const accessToken = this.accessTokenService.sign(payload);

    return {
      accessToken,
      refreshToken: session.token,
      tokenType: 'Bearer',
      expiresIn: config.jwtAccessTtlSeconds,
    };
  }

  private createNewSession(): NewSession {
    const sessionId = randomUUID();
    const token = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    const config = this.configService.getOrThrow<AppConfiguration>('app');

    return {
      sessionId,
      token,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + config.jwtRefreshTtlSeconds * 1_000),
    };
  }

  private parseRefreshToken(token: string): RefreshTokenParts | undefined {
    if (!refreshTokenPattern.test(token)) {
      return undefined;
    }

    const sessionId = token.slice(0, token.indexOf('.'));
    return { sessionId, token, tokenHash: hashRefreshToken(token) };
  }

  private toAuthenticatedUser(user: AuthenticatedUser): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountStatus: user.accountStatus,
    };
  }

  private assertActive(status: UserAccountStatus): void {
    if (status === UserAccountStatus.INACTIVE) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_INACTIVE',
        'This account is not active.',
      );
    }

    if (status === UserAccountStatus.SUSPENDED) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_SUSPENDED',
        'This account is suspended.',
      );
    }
  }

  private rejectInvalidCredentials(): never {
    throw new ApiErrorException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
      'Invalid email or password.',
    );
  }
}

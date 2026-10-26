// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConfigService } from '@nestjs/config';
import { verify } from 'jsonwebtoken';
import { UserAccountStatus } from '@prisma/client';
import { ApiErrorException } from '../../backend/src/common/errors/api-error.exception';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { AuthService } from '../../backend/src/modules/auth/auth.service';
import { AccessTokenService } from '../../backend/src/modules/auth/access-token.service';
import { PasswordService } from '../../backend/src/modules/auth/password.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';

const testJwtSecret = 'test-only-jwt-secret-that-is-at-least-thirty-two-characters';
const activeUser = {
  id: '8d877a9c-5cbe-4c5b-86b8-3a43ca968b7e',
  email: 'user@example.com',
  displayName: 'Example User',
  passwordHash: '$argon2id$test-hash',
  accountStatus: UserAccountStatus.ACTIVE,
};

function createPrismaMock() {
  const transactionClient = {
    authSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    user: { update: jest.fn().mockResolvedValue({}) },
  };

  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    authSession: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((callback: (client: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
    ),
    transactionClient,
  };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let passwordService: jest.Mocked<Pick<PasswordService, 'verify' | 'consumeVerificationCost'>>;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrismaMock();
    passwordService = {
      verify: jest.fn(),
      consumeVerificationCost: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue({
        jwtAccessSecret: testJwtSecret,
        jwtAccessTtlSeconds: 900,
        jwtRefreshTtlSeconds: 2_592_000,
      }),
    } as unknown as ConfigService;

    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      new AccessTokenService(configService),
      configService,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
    );
  });

  it('issues a minimal JWT and opaque refresh token for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    passwordService.verify.mockResolvedValue(true);

    const result = await service.login({ email: ' USER@EXAMPLE.COM ', password: 'valid password' });
    const payload = verify(result.accessToken, testJwtSecret, { algorithms: ['HS256'] });

    expect(result).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(result.refreshToken).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/i);
    expect(payload).toMatchObject({ sub: activeUser.id, typ: 'access' });
    expect(payload).not.toHaveProperty('email');
    expect(JSON.stringify(result)).not.toContain(activeUser.passwordHash);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@example.com' } }),
    );
    expect(prisma.transactionClient.authSession.create.mock.calls[0][0].data.refreshTokenHash).not.toBe(result.refreshToken);
  });

  it('returns the same safe error for unknown users and invalid passwords', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(activeUser);
    passwordService.verify.mockResolvedValue(false);

    await expect(service.login({ email: 'unknown@example.com', password: 'password' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      safeMessage: 'Invalid email or password.',
    });
    await expect(service.login({ email: activeUser.email, password: 'password' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      safeMessage: 'Invalid email or password.',
    });
    expect(passwordService.consumeVerificationCost).toHaveBeenCalledWith('password');
  });

  it('blocks inactive and suspended accounts after successful password verification', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...activeUser, accountStatus: UserAccountStatus.INACTIVE });
    passwordService.verify.mockResolvedValue(true);

    await expect(service.login({ email: activeUser.email, password: 'password' })).rejects.toMatchObject({
      code: 'ACCOUNT_INACTIVE',
    });

    prisma.user.findUnique.mockResolvedValue({ ...activeUser, accountStatus: UserAccountStatus.SUSPENDED });
    await expect(service.login({ email: activeUser.email, password: 'password' })).rejects.toMatchObject({
      code: 'ACCOUNT_SUSPENDED',
    });
  });

  it('rotates a valid refresh token atomically', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    passwordService.verify.mockResolvedValue(true);
    const login = await service.login({ email: activeUser.email, password: 'password' });
    const createdSession = prisma.transactionClient.authSession.create.mock.calls[0][0].data;
    prisma.authSession.findUnique.mockResolvedValue({
      id: createdSession.id,
      userId: activeUser.id,
      refreshTokenHash: createdSession.refreshTokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: activeUser.id,
        email: activeUser.email,
        displayName: activeUser.displayName,
        accountStatus: activeUser.accountStatus,
      },
    });

    const refreshed = await service.refresh(login.refreshToken);

    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.transactionClient.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
  });

  it('allows only one successor when the same refresh token is used concurrently', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    passwordService.verify.mockResolvedValue(true);
    const login = await service.login({ email: activeUser.email, password: 'password' });
    const createdSession = prisma.transactionClient.authSession.create.mock.calls[0][0].data;
    prisma.authSession.findUnique.mockResolvedValue({
      id: createdSession.id,
      userId: activeUser.id,
      refreshTokenHash: createdSession.refreshTokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: { ...activeUser },
    });
    let attempts = 0;
    prisma.transactionClient.authSession.updateMany.mockImplementation(async () => ({ count: attempts++ === 0 ? 1 : 0 }));

    const results = await Promise.allSettled([
      service.refresh(login.refreshToken),
      service.refresh(login.refreshToken),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(prisma.transactionClient.authSession.create).toHaveBeenCalledTimes(2);
  });

  it('does not expose implementation errors through the service error type', async () => {
    const error = new ApiErrorException(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

    expect(error.getResponse()).toBe('Invalid email or password.');
  });
});

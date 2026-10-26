// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserAccountStatus } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { StructuredLogger, type StructuredLogRecord } from '../../backend/src/common/logging/structured-logger';
import type { AppConfiguration } from '../../backend/src/config/environment';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { PasswordService } from '../../backend/src/modules/auth/password.service';

const testJwtSecret = 'test-only-jwt-secret-that-is-at-least-thirty-two-characters';
const user = {
  id: '318a3346-e555-4d70-8a13-9bc6d1dfcfb0',
  email: 'user@example.com',
  displayName: 'Example User',
  accountStatus: UserAccountStatus.ACTIVE,
};

describe('DX-OS IAM authentication API', () => {
  let app: INestApplication;
  let passwordHash: string;
  let logs: StructuredLogRecord[];
  let previousSsoEnabled: string | undefined;
  const prisma = {
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    authSession: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    previousSsoEnabled = process.env.SSO_ENABLED;
    process.env.SSO_ENABLED = 'false';
    process.env.JWT_ACCESS_SECRET = testJwtSecret;
    process.env.JWT_ACCESS_TTL = '15m';
    process.env.JWT_REFRESH_TTL = '30d';
    passwordHash = await new PasswordService().hash('Correct horse battery staple 2026!');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    const config = moduleRef.get(ConfigService).getOrThrow<AppConfiguration>('app');

    logs = [];
    app = moduleRef.createNestApplication();
    configureApplication(app, config, new StructuredLogger('debug', (record) => logs.push(record)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_ACCESS_TTL;
    delete process.env.JWT_REFRESH_TTL;
    if (previousSsoEnabled === undefined) delete process.env.SSO_ENABLED;
    else process.env.SSO_ENABLED = previousSsoEnabled;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((operation: (tx: unknown) => Promise<unknown>) => operation(prisma));
    prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });
    prisma.authSession.findFirst.mockResolvedValue({ id: 'session-id', user });
  });

  it('logs in with valid credentials without exposing the password hash', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Correct horse battery staple 2026!' })
      .expect(200);

    expect(response.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain(passwordHash);
    expect(prisma.authSession.create.mock.calls[0][0].data.refreshTokenHash).not.toBe(
      response.body.refreshToken,
    );
  });

  it('returns the same invalid-credential response for an unknown identity and bad password', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...user, passwordHash });

    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.com', password: 'Correct horse battery staple 2026!' })
      .expect(401);
    const incorrect = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'incorrect password' })
      .expect(401);

    expect(unknown.body.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
    expect(incorrect.body.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  });

  it('returns validation errors without using the authentication service', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '', unexpected: true })
      .expect(400);

    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('blocks suspended accounts after valid credential verification', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      passwordHash,
      accountStatus: UserAccountStatus.SUSPENDED,
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Correct horse battery staple 2026!' })
      .expect(403);

    expect(response.body.error).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  });

  it('returns the authenticated identity and does not expose a password hash', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Correct horse battery staple 2026!' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(response.body).toEqual({ ...user });
    expect(JSON.stringify(response.body)).not.toContain(passwordHash);
  });

  it('requires JWT before disclosing the SSO logout URL', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/sso/logout-url').expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/sso/logout-url').set('Authorization', 'Bearer invalid').expect(401);
  });

  it('returns 404 for authenticated logout discovery when SSO is disabled', async () => {
    const token = sign({ sub: user.id, sid: 'session-id', typ: 'access' }, testJwtSecret, { algorithm: 'HS256', expiresIn: 60 });
    await request(app.getHttpServer()).get('/api/v1/auth/sso/logout-url').set('Authorization', `Bearer ${token}`).expect(404);
  });

  it('rejects missing, malformed, and expired access tokens', async () => {
    const expiredToken = sign(
      { sub: user.id, sid: 'session-id', typ: 'access' },
      testJwtSecret,
      { algorithm: 'HS256', expiresIn: -1 },
    );

    const missing = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    const malformed = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);
    const expired = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(missing.body.error.code).toBe('UNAUTHORIZED');
    expect(malformed.body.error.code).toBe('UNAUTHORIZED');
    expect(expired.body.error.code).toBe('UNAUTHORIZED');
  });

  it('revokes the active server-side session on logout and does not log credentials', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Correct horse battery staple 2026!' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
    const logOutput = JSON.stringify(logs);
    expect(logOutput).not.toContain('Correct horse battery staple 2026!');
    expect(logOutput).not.toContain(login.body.accessToken);
    expect(logOutput).not.toContain(login.body.refreshToken);
  });
});

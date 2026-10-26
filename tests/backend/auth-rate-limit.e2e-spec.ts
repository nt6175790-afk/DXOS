// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import type { AppConfiguration } from '../../backend/src/config/environment';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { AuthService } from '../../backend/src/modules/auth/auth.service';

describe('DX-OS authentication rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.RATE_LIMIT_LOGIN_LIMIT = '2';
    process.env.RATE_LIMIT_LOGIN_WINDOW_SECONDS = '60';
    process.env.RATE_LIMIT_REFRESH_LIMIT = '2';
    process.env.RATE_LIMIT_REFRESH_WINDOW_SECONDS = '60';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({
        login: jest.fn().mockRejectedValue(new UnauthorizedException()),
        refresh: jest.fn().mockRejectedValue(new UnauthorizedException()),
      })
      .compile();

    const config = moduleRef.get(ConfigService).getOrThrow<AppConfiguration>('app');
    app = moduleRef.createNestApplication();
    configureApplication(app, config, new StructuredLogger('debug'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.RATE_LIMIT_LOGIN_LIMIT;
    delete process.env.RATE_LIMIT_LOGIN_WINDOW_SECONDS;
    delete process.env.RATE_LIMIT_REFRESH_LIMIT;
    delete process.env.RATE_LIMIT_REFRESH_WINDOW_SECONDS;
  });

  it('allows login requests below the limit and returns a safe 429 after the limit', async () => {
    const first = await request(app.getHttpServer()).post('/api/v1/auth/login')
      .set('X-Forwarded-For', '203.0.113.31')
      .send({ email: 'unknown@example.com', password: 'invalid' })
      .expect(401);
    const second = await request(app.getHttpServer()).post('/api/v1/auth/login')
      .set('X-Forwarded-For', '203.0.113.32')
      .send({ email: 'unknown@example.com', password: 'invalid' })
      .expect(401);
    const limited = await request(app.getHttpServer()).post('/api/v1/auth/login')
      .set('X-Forwarded-For', '203.0.113.33')
      .send({ email: 'unknown@example.com', password: 'invalid' })
      .expect(429);

    expect(first.body.error.code).toBe('UNAUTHORIZED');
    expect(second.body.error.code).toBe('UNAUTHORIZED');
    expect(limited.body).toEqual({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please try again later.',
        details: {},
        requestId: expect.any(String),
      },
    });
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(JSON.stringify(limited.body)).not.toContain('invalid');
  });

  it('protects refresh separately and preserves invalid-token behavior below the limit', async () => {
    const first = await request(app.getHttpServer()).post('/api/v1/auth/refresh')
      .send({ refreshToken: 'x'.repeat(64) })
      .expect(401);
    const second = await request(app.getHttpServer()).post('/api/v1/auth/refresh')
      .send({ refreshToken: 'x'.repeat(64) })
      .expect(401);
    const limited = await request(app.getHttpServer()).post('/api/v1/auth/refresh')
      .send({ refreshToken: 'x'.repeat(64) })
      .expect(429);

    expect(first.body.error.code).toBe('UNAUTHORIZED');
    expect(second.body.error.code).toBe('UNAUTHORIZED');
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
  });
});

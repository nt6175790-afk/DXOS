// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { getAppConfiguration, validateEnvironment } from '../../backend/src/config/environment';

describe('environment configuration', () => {
  it('returns typed configuration for local development', () => {
    expect(
      getAppConfiguration({
        DATABASE_URL: 'mysql://dxos:example@localhost:3306/dx_os',
        JWT_ACCESS_SECRET: 'development-test-secret-that-is-at-least-thirty-two-characters',
      }),
    ).toMatchObject({
      environment: 'development',
      port: 3000,
      apiPrefix: 'api/v1',
      corsOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      swaggerEnabled: true,
      databaseUrl: 'mysql://dxos:example@localhost:3306/dx_os',
      jwtAccessTtlSeconds: 900,
      jwtRefreshTtlSeconds: 2_592_000,
    });
  });

  it('allows an absent database URL only for non-connecting test execution', () => {
    expect(getAppConfiguration({ NODE_ENV: 'test' }).databaseUrl).toBeUndefined();
  });

  it('fails fast when production CORS origins are missing', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'Invalid environment variable CORS_ORIGINS',
    );
  });

  it('rejects wildcard CORS and invalid ports', () => {
    expect(() => validateEnvironment({ CORS_ORIGINS: '*' })).toThrow('wildcard origins');
    expect(() => validateEnvironment({ PORT: '70000' })).toThrow('PORT');
  });

  it('requires a MySQL URL outside test execution', () => {
    expect(() => getAppConfiguration({ NODE_ENV: 'development' })).toThrow('DATABASE_URL');
    expect(() => getAppConfiguration({ DATABASE_URL: 'postgresql://database.example/dxos' })).toThrow(
      'DATABASE_URL',
    );
  });

  it('requires a non-default JWT secret outside test execution', () => {
    expect(() =>
      getAppConfiguration({
        DATABASE_URL: 'mysql://dxos:example@localhost:3306/dx_os',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
    expect(() =>
      getAppConfiguration({
        DATABASE_URL: 'mysql://dxos:example@localhost:3306/dx_os',
        JWT_ACCESS_SECRET: 'replace-before-enabling-authentication',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('validates access and refresh token duration boundaries', () => {
    expect(() => getAppConfiguration({ NODE_ENV: 'test', JWT_ACCESS_TTL: '59s' })).toThrow(
      'JWT_ACCESS_TTL',
    );
    expect(() => getAppConfiguration({ NODE_ENV: 'test', JWT_REFRESH_TTL: '91d' })).toThrow(
      'JWT_REFRESH_TTL',
    );
  });

  it('uses stricter production authentication limiter defaults and accepts overrides', () => {
    const production = getAppConfiguration({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.test',
      DATABASE_URL: 'mysql://dxos:example@localhost:3306/dx_os',
      JWT_ACCESS_SECRET: 'production-test-secret-that-is-at-least-thirty-two-characters',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(production).toMatchObject({
      rateLimitLoginLimit: 10,
      rateLimitLoginWindowSeconds: 60,
      rateLimitRefreshLimit: 30,
      rateLimitRefreshWindowSeconds: 60,
    });

    expect(getAppConfiguration({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.test',
      DATABASE_URL: 'mysql://dxos:example@localhost:3306/dx_os',
      JWT_ACCESS_SECRET: 'production-test-secret-that-is-at-least-thirty-two-characters',
      REDIS_URL: 'redis://localhost:6379',
      RATE_LIMIT_LOGIN_LIMIT: '5',
      RATE_LIMIT_LOGIN_WINDOW_SECONDS: '30',
      RATE_LIMIT_REFRESH_LIMIT: '20',
      RATE_LIMIT_REFRESH_WINDOW_SECONDS: '120',
    })).toMatchObject({
      rateLimitLoginLimit: 5,
      rateLimitLoginWindowSeconds: 30,
      rateLimitRefreshLimit: 20,
      rateLimitRefreshWindowSeconds: 120,
    });
  });

  it('rejects invalid authentication limiter configuration', () => {
    expect(() => getAppConfiguration({ NODE_ENV: 'test', RATE_LIMIT_LOGIN_LIMIT: '0' })).toThrow('RATE_LIMIT_LOGIN_LIMIT');
    expect(() => getAppConfiguration({ NODE_ENV: 'test', RATE_LIMIT_REFRESH_WINDOW_SECONDS: 'not-a-duration' })).toThrow('RATE_LIMIT_REFRESH_WINDOW_SECONDS');
  });

  it('requires and validates the shared Redis URL in production', () => {
    expect(() => getAppConfiguration({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.test',
      DATABASE_URL: 'mysql://dxos:example@localhost:3306/dx_os',
      JWT_ACCESS_SECRET: 'production-test-secret-that-is-at-least-thirty-two-characters',
    })).toThrow('REDIS_URL');
    expect(() => getAppConfiguration({
      NODE_ENV: 'test',
      REDIS_URL: 'http://localhost:6379',
    })).toThrow('REDIS_URL');
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger, type StructuredLogRecord } from '../../backend/src/common/logging/structured-logger';
import { FoundationProbeController } from './support/foundation-probe.controller';

describe('DX-OS backend foundation', () => {
  let app: INestApplication;
  let logs: StructuredLogRecord[];

  beforeAll(async () => {
    logs = [];
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FoundationProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('debug', (record) => logs.push(record)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts and preserves the versioned health endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', service: 'dx-os-api' });
    expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('generates a request ID and exposes it to CORS clients', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
    expect(response.headers['access-control-expose-headers']).toContain('x-request-id');
  });

  it('reuses a valid client request ID and replaces an invalid one', async () => {
    const suppliedRequestId = 'client-trace-1234';
    const accepted = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', suppliedRequestId)
      .expect(200);
    const rejected = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'bad value')
      .expect(200);

    expect(accepted.headers['x-request-id']).toBe(suppliedRequestId);
    expect(rejected.headers['x-request-id']).not.toBe('bad value');
  });

  it('returns validation errors in the standard envelope', async () => {
    const requestId = 'validation-trace-1234';
    const response = await request(app.getHttpServer())
      .post('/api/v1/__test/validation')
      .set('X-Request-Id', requestId)
      .send({ email: 'not-an-email', unexpected: true })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: { fields: expect.any(Array) },
        requestId,
      },
    });
  });

  it('returns unexpected errors safely and does not log the secret message', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/__test/error').expect(500);

    expect(response.body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: {},
    });
    expect(JSON.stringify(logs)).not.toContain('super-secret-test-value');
  });

  it('maps known Prisma errors without exposing database details', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/__test/database-conflict')
      .expect(409);

    expect(response.body.error).toEqual({
      code: 'CONFLICT',
      message: 'The request conflicts with the current resource state.',
      details: {},
      requestId: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain('SQL-sensitive-detail');
  });

  it('allows configured origins and omits CORS headers for unconfigured origins', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    const denied = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://untrusted.example')
      .expect(200);

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('publishes an OpenAPI-compatible document for health and authentication', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);

    expect(response.body).toMatchObject({
      openapi: '3.0.3',
      paths: {
        '/health': expect.any(Object),
        '/auth/login': expect.any(Object),
        '/auth/refresh': expect.any(Object),
        '/auth/me': expect.any(Object),
        '/auth/logout': expect.any(Object),
      },
      components: {
        securitySchemes: { bearerAuth: expect.any(Object) },
        schemas: {
          LoginRequest: expect.any(Object),
          AuthResponse: expect.any(Object),
          CurrentUser: expect.any(Object),
        },
      },
    });
  });
});

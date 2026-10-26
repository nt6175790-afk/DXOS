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
import { AuthModule } from '../../backend/src/modules/auth/auth.module';
import { RbacModule } from '../../backend/src/modules/rbac/rbac.module';
import { RbacProbeController } from './support/rbac-probe.controller';

const secret = 'rbac-test-only-signing-key-not-a-production-credential';
const organizationA = 'eb42cce7-7209-4adc-9e71-16fbc6467850';
const organizationB = 'f969218b-4d58-45fb-9a7a-26f73df6fe35';
const user = {
  id: '291c47e4-278a-4f1d-8f39-0fb47c2d5db2', email: 'rbac@example.test',
  displayName: null, accountStatus: UserAccountStatus.ACTIVE,
};

describe('organization authorization HTTP boundary', () => {
  let app: INestApplication;
  let token: string;
  const logs: StructuredLogRecord[] = [];
  const prisma = {
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    authSession: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  };
  const path = (organizationId = organizationA) => `/api/v1/__test/rbac/organizations/${organizationId}/read`;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AuthModule, RbacModule], controllers: [RbacProbeController],
    }).overrideProvider(PrismaService).useValue(prisma).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, moduleRef.get(ConfigService).getOrThrow<AppConfiguration>('app'),
      new StructuredLogger('debug', (record) => logs.push(record)));
    await app.init();
    token = sign({ sub: user.id, sid: 'session-id', typ: 'access' }, secret, { expiresIn: 300 });
  });
  afterAll(async () => { await app?.close(); delete process.env.JWT_ACCESS_SECRET; });
  beforeEach(() => {
    jest.clearAllMocks();
    logs.length = 0;
    prisma.authSession.findFirst.mockResolvedValue({ id: 'session-id', user });
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'membership-id' });
  });

  it.each(['missing', 'invalid', 'expired'])('returns 401 for %s JWT before permission resolution', async (kind) => {
    const req = request(app.getHttpServer()).get(path());
    if (kind !== 'missing') req.set('Authorization', `Bearer ${kind === 'invalid' ? 'invalid.jwt' :
      sign({ sub: user.id, sid: 'session-id', typ: 'access' }, secret, { expiresIn: -1 })}`);
    const response = await req.expect(401);
    expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED', requestId: expect.any(String) } });
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it.each(['INACTIVE', 'SUSPENDED'])('denies an %s account through existing IAM session validation', async () => {
    prisma.authSession.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${token}`).expect(401);
    expect(prisma.authSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ user: { accountStatus: UserAccountStatus.ACTIVE } }),
    }));
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 for a valid identity denied by permission resolution', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    const response = await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${token}`).expect(403);
    expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN', details: {}, requestId: expect.any(String) } });
  });

  it('allows a granted permission and never logs the bearer token', async () => {
    const response = await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body).toEqual({ organizationId: organizationA });
    expect(JSON.stringify(logs)).not.toContain(token);
    expect(JSON.stringify(logs)).not.toContain(secret);
  });

  it('cannot override the route tenant through a body, query or header', async () => {
    prisma.organizationMembership.findFirst.mockImplementation(({ where }: { where: { organizationId: string } }) =>
      Promise.resolve(where.organizationId === organizationA ? { id: 'membership-id' } : null));
    await request(app.getHttpServer()).post(path(organizationB))
      .query({ organization_id: organizationA, organizationId: organizationA })
      .set('organization_id', organizationA).set('x-organization-id', organizationA)
      .set('Authorization', `Bearer ${token}`).send({ organizationId: organizationA }).expect(403);
    await request(app.getHttpServer()).post(path(organizationA))
      .set('Authorization', `Bearer ${token}`).send({ organizationId: organizationB }).expect(201);
  });

  it('rejects a malformed organization context', async () => {
    await request(app.getHttpServer()).get(path('not-a-uuid')).set('Authorization', `Bearer ${token}`).expect(403);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('fails closed when a guarded route has no permission metadata', async () => {
    await request(app.getHttpServer()).get('/api/v1/__test/rbac/organizations/unconfigured')
      .set('Authorization', `Bearer ${token}`).expect(403);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('returns a safe 500 on database failure without granting access', async () => {
    prisma.organizationMembership.findFirst.mockRejectedValue(new Error('private database details'));
    const response = await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${token}`).expect(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('private database details');
  });
});

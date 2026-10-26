// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration, AppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger, StructuredLogRecord } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { AiChatResult, AiProvider, AiProviderLimit, AiProviderUnavailable } from '../../backend/src/modules/ai/ai-provider';
import { MockAiProvider } from '../../backend/src/modules/ai/mock-ai.provider';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'ai-test-only-jwt-key-not-production';
const privatePrompt = 'DO_NOT_PERSIST_THIS_PRIVATE_PROMPT';
const valid = () => ({ messages: [{ role: 'user', content: privatePrompt }] });
mysqlDescribe('AI foundation with real HTTP, MySQL, IAM and audit', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  const provider = new MockAiProvider(); const logs: StructuredLogRecord[] = [];
  let app: INestApplication; let organizations: OrganizationsService; let audit: AuditService; let config: ConfigService; let original: AppConfiguration;
  let users: string[]; let tokens: string[]; let orgs: string[]; let role: string;
  const path = (org = orgs[0]) => `/api/v1/organizations/${org}/ai/generate`;
  const generate = (org = orgs[0], token = tokens[0]) => request(app.getHttpServer()).post(path(org)).set('Authorization', `Bearer ${token}`);
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db)
      .overrideProvider(AiProvider).useValue(provider).compile();
    organizations = module.get(OrganizationsService); audit = module.get(AuditService); config = module.get(ConfigService);
    original = config.getOrThrow<AppConfiguration>('app');
    app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('debug', (entry) => logs.push(entry))); await app.init();
  });
  beforeEach(async () => {
    config.set('app', { ...original, aiProvider: 'mock', aiModel: 'mock-v1' });
    users = [randomUUID(), randomUUID(), randomUUID()]; tokens = []; orgs = [];
    await db.user.createMany({ data: users.map((id) => ({ id, email: `${id}@example.test` })) });
    for (const id of users) {
      const sid = randomUUID(); await db.authSession.create({ data: { id: sid, userId: id, expiresAt: new Date(Date.now() + 300000),
        refreshTokenHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '') } });
      tokens.push(sign({ sub: id, sid, typ: 'access' }, secret, { expiresIn: 300 }));
    }
    for (const user of users.slice(0, 2)) orgs.push((await organizations.create(user, { name: 'AI fixture', slug: `ai-${randomUUID()}` })).id);
    await db.organizationMembership.create({ data: { organizationId: orgs[0], userId: users[2] } });
    role = (await db.role.findFirstOrThrow({ where: { organizationId: orgs[0] } })).id;
    const permission = await db.permission.upsert({ where: { key: 'ai:use' }, update: {}, create: { key: 'ai:use', name: 'Use AI' } });
    await db.rolePermission.create({ data: { roleId: role, permissionId: permission.id } }); logs.length = 0;
  });
  afterEach(async () => {
    jest.restoreAllMocks(); const organizationId = { in: orgs };
    await db.aiRequest.deleteMany({ where: { organizationId } });
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: users } }] } });
    await db.membershipRole.deleteMany({ where: { organizationId } }); await db.rolePermission.deleteMany({ where: { role: { organizationId } } });
    await db.role.deleteMany({ where: { organizationId } }); await db.organizationMembership.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } }); await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });
  it('returns 401 for missing, invalid and expired credentials without provider calls', async () => {
    const call = jest.spyOn(provider, 'chat');
    for (const token of [undefined, 'invalid.jwt', sign({ sub: users[0], sid: randomUUID(), typ: 'access' }, secret, { expiresIn: -1 })]) {
      const req = request(app.getHttpServer()).post(path()); if (token) req.set('Authorization', `Bearer ${token}`);
      await req.send(valid()).expect(401);
    }
    expect(call).not.toHaveBeenCalled(); expect(await db.aiRequest.count()).toBe(0);
  });
  it('requires explicit ai:use and denies nonmembers, ordinary members and ungranted owners', async () => {
    const call = jest.spyOn(provider, 'chat');
    await generate(orgs[0], tokens[1]).send(valid()).expect(403); await generate(orgs[0], tokens[2]).send(valid()).expect(403);
    await generate(orgs[1], tokens[1]).send(valid()).expect(403);
    expect(call).not.toHaveBeenCalled();
    expect(await db.auditEvent.count({ where: { event: 'security.authorization.denied' } })).toBe(3);
  });
  it('returns normalized deterministic output and persists only safe tenant usage with correlated audit/logging', async () => {
    const requestId = randomUUID();
    const result = await generate().set('x-request-id', requestId).send({ ...valid(), metadata: { purpose: 'general' } }).expect(200);
    // Unknown question → the offline mock explains what it understands; no canned figures, no tool call.
    expect(result.body).toEqual({ id: expect.any(String), organizationId: orgs[0], requestId, provider: 'mock', model: 'mock-v1',
      text: expect.stringContaining('Chế độ mô phỏng'), finishReason: 'stop',
      usage: { inputTokens: expect.any(Number), outputTokens: expect.any(Number), totalTokens: expect.any(Number) },
      citations: [], numericCheck: { status: 'NOT_APPLICABLE', unmatchedCount: 0 } });
    expect(result.body.text).not.toContain(privatePrompt);
    const row = await db.aiRequest.findUniqueOrThrow({ where: { id: result.body.id } });
    expect(row).toMatchObject({ organizationId: orgs[0], userId: users[0], requestId, status: 'SUCCEEDED', errorCategory: null, completedAt: expect.any(Date) });
    const events = await db.auditEvent.findMany({ where: { resourceId: row.id } });
    expect(events.map((e) => e.event).sort()).toEqual(['ai.request.started', 'ai.request.succeeded']);
    expect(events.every((e) => e.organizationId === orgs[0] && e.actorUserId === users[0] && e.requestId === requestId)).toBe(true);
    expect(JSON.stringify({ row, events, logs })).not.toContain(privatePrompt);
    expect(JSON.stringify({ row, events, logs })).not.toContain(result.body.text);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(await db.notification.count()).toBe(0);
  });
  it('does not permit tenant route/header tampering or cross-tenant context', async () => {
    for (const org of [orgs[1], randomUUID(), 'invalid']) await generate(org).set('x-organization-id', orgs[0]).send(valid()).expect(403);
    expect(await db.aiRequest.count()).toBe(0);
  });
  it.each(['organizationId', 'userId', 'actorUserId', 'provider', 'tools', 'apiKey', 'isAdmin'])('rejects spoofed or arbitrary request option %s', async (key) => {
    const call = jest.spyOn(provider, 'chat');
    await generate().send({ ...valid(), [key]: 'forged' }).expect(400); await generate().query({ [key]: 'forged' }).send(valid()).expect(400);
    expect(call).not.toHaveBeenCalled();
  });
  it.each([
    { messages: [] }, { messages: [{ role: 'user', content: '' }] }, { messages: [{ role: 'user', content: ' '.repeat(5) }] },
    { messages: Array.from({ length: 17 }, () => ({ role: 'user', content: 'x' })) },
    { messages: [{ role: 'user', content: 'x'.repeat(4001) }] },
    { messages: Array.from({ length: 5 }, () => ({ role: 'user', content: 'x'.repeat(4000) })) },
    { model: 'unknown-vendor' }, { model: null }, { temperature: 3 }, { temperature: '0' }, { maxOutputTokens: 0 }, { maxOutputTokens: 2049 },
    { metadata: { purpose: 'x'.repeat(1000) } }, { metadata: { purpose: 'general', apiKey: 'secret' } }, { metadata: null },
    { messages: [{ role: 'user', content: 'x', providerPayload: {} }] },
  ])('rejects invalid bounded input %#', async (override) => {
    const call = jest.spyOn(provider, 'chat');
    await generate().send({ ...valid(), ...override }).expect(400); expect(call).not.toHaveBeenCalled(); expect(await db.aiRequest.count()).toBe(0);
  });
  it.each(['membership', 'organization', 'user', 'role'])('rejects inactive %s', async (kind) => {
    if (kind === 'membership') await db.organizationMembership.update({ where: { organizationId_userId: { organizationId: orgs[0], userId: users[0] } }, data: { status: 'SUSPENDED' } });
    if (kind === 'organization') await db.organization.update({ where: { id: orgs[0] }, data: { status: 'SUSPENDED' } });
    if (kind === 'user') await db.user.update({ where: { id: users[0] }, data: { accountStatus: 'SUSPENDED' } });
    if (kind === 'role') await db.role.update({ where: { id: role }, data: { isActive: false } });
    await generate().send(valid()).expect(kind === 'user' ? 401 : 403);
  });
  it.each([
    [new Error('PRIVATE_VENDOR_SECRET'), 502, 'AI_PROVIDER_ERROR'],
    [new AiProviderUnavailable('PRIVATE_VENDOR_SECRET'), 503, 'AI_PROVIDER_UNAVAILABLE'],
    [new AiProviderLimit('PRIVATE_VENDOR_SECRET'), 429, 'AI_LIMIT_EXCEEDED'],
  ] as const)('normalizes provider failure %# with safe failure recording', async (error, status, code) => {
    jest.spyOn(provider, 'chat').mockRejectedValue(error);
    const response = await generate().send(valid()).expect(status); expect(response.body.error.code).toBe(code);
    const row = await db.aiRequest.findFirstOrThrow(); expect(row).toMatchObject({ status: 'FAILED', errorCategory: code, inputTokens: null });
    const events = await db.auditEvent.findMany({ where: { resourceId: row.id } });
    expect(events.some((e) => e.event === 'ai.request.failed' && e.outcome === 'FAILURE')).toBe(true);
    expect(JSON.stringify({ response: response.body, events, logs, row })).not.toContain('PRIVATE_VENDOR_SECRET');
    expect(JSON.stringify({ response: response.body, events, logs, row })).not.toContain(privatePrompt);
  });
  it('disabled configuration never invokes the provider', async () => {
    config.set('app', { ...original, aiProvider: 'disabled' }); const call = jest.spyOn(provider, 'chat');
    await generate().send(valid()).expect(503); expect(call).not.toHaveBeenCalled();
    expect((await db.aiRequest.findFirstOrThrow()).status).toBe('FAILED');
  });
  it('times out stalled providers and signals cancellation', async () => {
    config.set('app', { ...original, aiProvider: 'mock', aiTimeoutMs: 10 }); let signal: AbortSignal | undefined;
    jest.spyOn(provider, 'chat').mockImplementation((_input, context) => { signal = context.signal; return new Promise(() => undefined); });
    await generate().send(valid()).expect(503); expect(signal?.aborted).toBe(true);
    expect((await db.aiRequest.findFirstOrThrow()).errorCategory).toBe('AI_PROVIDER_UNAVAILABLE');
  });
  it('rejects arbitrary provider response fields before any text is released', async () => {
    jest.spyOn(provider, 'chat').mockResolvedValue({ text: 'PRIVATE_OUTPUT', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop', rawVendorSecret: 'secret' } as AiChatResult);
    const response = await generate().send(valid()).expect(502); expect(JSON.stringify(response.body)).not.toContain('PRIVATE_OUTPUT');
    expect((await db.aiRequest.findFirstOrThrow()).status).toBe('FAILED');
  });
  it('rechecks permission after provider work and discards output on revocation', async () => {
    const implementation = provider.chat.bind(provider);
    jest.spyOn(provider, 'chat').mockImplementation(async (...args) => { await db.rolePermission.deleteMany({ where: { roleId: role } }); return implementation(...args); });
    await generate().send(valid()).expect(403);
    expect((await db.aiRequest.findFirstOrThrow()).errorCategory).toBe('FORBIDDEN');
  });
  it('does not call the provider if admission audit fails', async () => {
    const call = jest.spyOn(provider, 'chat'); jest.spyOn(audit, 'record').mockRejectedValue(new Error('private database details'));
    const response = await generate().send(valid()).expect(500);
    expect(response.body.error.code).toBe('AI_INTERNAL_ERROR'); expect(call).not.toHaveBeenCalled(); expect(await db.aiRequest.count()).toBe(0);
  });
  it('rolls back terminal success and records failure when success audit fails', async () => {
    const record = audit.record.bind(audit);
    jest.spyOn(audit, 'record').mockImplementation((input, tx) => { if (input.event === 'ai.request.succeeded') throw new Error('audit failure'); return record(input, tx); });
    await generate().send(valid()).expect(500);
    expect(await db.aiRequest.findFirstOrThrow()).toMatchObject({ status: 'FAILED', inputTokens: null, outputTokens: null, errorCategory: 'AI_INTERNAL_ERROR' });
  });
  it('retains STARTED unknown outcome if terminal persistence is unavailable, without false success', async () => {
    const record = audit.record.bind(audit);
    jest.spyOn(audit, 'record').mockImplementation((input, tx) => { if (input.event !== 'ai.request.started') throw new Error('audit down'); return record(input, tx); });
    await generate().send(valid()).expect(500);
    expect(await db.aiRequest.findFirstOrThrow()).toMatchObject({ status: 'STARTED', completedAt: null, inputTokens: null });
  });
  it('enforces tenant membership FK and exposes no public history endpoint', async () => {
    await expect(db.aiRequest.create({ data: { organizationId: orgs[0], userId: users[1], provider: 'mock', model: 'mock-v1', requestId: randomUUID() } })).rejects.toMatchObject({ code: 'P2003' });
    await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${tokens[0]}`).expect(404);
    const doc = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    expect(doc.body.paths['/organizations/{organizationId}/ai/generate'].post['x-required-permission']).toBe('ai:use');
  });
});


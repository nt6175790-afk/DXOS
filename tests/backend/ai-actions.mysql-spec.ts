// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { StorageService } from '../../backend/src/modules/files/storage.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { PERMISSIONS as P } from '../../backend/src/modules/rbac/permission-catalog';

function pdf(text: string) {
  const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let s = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(s)); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(s); s += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(s);
}
const url = process.env.RBAC_TEST_DATABASE_URL;
(url ? describe : describe.skip)('AI confirmed writes and PDF retrieval', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused@localhost/unused' } } });
  const secret = 'ai-confirmed-actions-disposable-session-fixture'; const bytes = new Map<string, Buffer>();
  let app: INestApplication; let user: string; let org: string; let foreign: string; let membership: string; let role: string; let token: string; let employee: string;
  const http = () => request(app.getHttpServer()); const base = (p: string, tenant = org) => `/api/v1/organizations/${tenant}/${p}`;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const propose = () => http().post(base('ai/task-drafts')).set(auth()).send({ prompt: 'Prepare onboarding guide' });
  const revoke = async (key: string) => db.rolePermission.deleteMany({ where: { roleId: role, permission: { key } } });
  const upload = async (content = pdf('Onboarding orientation starts at nine.')) => (await http().post(base('files')).set(auth()).attach('file', content, { filename: 'orientation.pdf', contentType: 'application/pdf' }).expect(201)).body.id as string;
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw Error('Disposable database required');
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db)
      .overrideProvider(StorageService).useValue({ provider: 'LOCAL', async put(key: string, source: Readable) {
        const parts: Buffer[] = []; for await (const p of source) parts.push(Buffer.from(p)); const b = Buffer.concat(parts); bytes.set(key, b);
        return { size: b.length, checksum: createHash('sha256').update(b).digest('hex'), prefix: b.subarray(0, 32) };
      }, async get(key: string) { return Readable.from(bytes.get(key)!); }, async delete(key: string) { bytes.delete(key); }, async exists(key: string) { return bytes.has(key); } }).compile();
    app = module.createNestApplication(); configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {})); await app.init();
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET; });
  beforeEach(async () => {
    user = randomUUID(); await db.user.create({ data: { id: user, email: `${user}@example.test` } });
    const session = await db.authSession.create({ data: { userId: user, refreshTokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: user, sid: session.id, typ: 'access' }, secret, { expiresIn: 300 });
    org = (await db.organization.create({ data: { name: 'AI fixture', slug: `ai-${randomUUID()}` } })).id;
    foreign = (await db.organization.create({ data: { name: 'Foreign AI', slug: `ai-${randomUUID()}` } })).id;
    membership = (await db.organizationMembership.create({ data: { organizationId: org, userId: user } })).id;
    role = (await db.role.create({ data: { organizationId: org, key: 'ai-test', name: 'AI test' } })).id;
    await db.membershipRole.create({ data: { organizationId: org, membershipId: membership, roleId: role } });
    for (const key of [P.AI_USE, P.TASK_CREATE, P.TASK_READ, P.FILE_READ, P.FILE_UPLOAD, P.FILE_DELETE]) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } }); await db.rolePermission.create({ data: { roleId: role, permissionId: p.id } });
    }
    employee = (await db.employee.create({ data: { organizationId: org, userId: user, employeeCode: 'AI-001', displayName: 'AI operator' } })).id;
  });
  afterEach(async () => {
    const tenants = { organizationId: { in: [org, foreign] } };
    await db.aiKnowledgeDocument.deleteMany({ where: tenants }); await db.aiTaskDraft.deleteMany({ where: tenants });
    await db.documentVersion.deleteMany({ where: tenants }); await db.employeeDocument.deleteMany({ where: tenants }); await db.fileObject.deleteMany({ where: tenants });
    await db.task.deleteMany({ where: tenants }); await db.employee.deleteMany({ where: tenants }); await db.aiRequest.deleteMany({ where: tenants });
    await db.auditEvent.deleteMany({ where: { OR: [tenants, { actorUserId: user }] } }); await db.notification.deleteMany({ where: tenants });
    await db.rolePermission.deleteMany({ where: { roleId: role } }); await db.membershipRole.deleteMany({ where: tenants }); await db.role.deleteMany({ where: tenants });
    await db.organizationMembership.deleteMany({ where: tenants }); await db.organization.deleteMany({ where: { id: { in: [org, foreign] } } });
    await db.authSession.deleteMany({ where: { userId: user } }); await db.user.delete({ where: { id: user } }); bytes.clear(); jest.restoreAllMocks();
  });
  it('requires JWT, ACTIVE membership and explicit AI/task permissions', async () => {
    await http().post(base('ai/task-drafts')).send({ prompt: 'Create task' }).expect(401);
    await db.organizationMembership.update({ where: { id: membership }, data: { status: 'INACTIVE' } }); await propose().expect(403);
    await db.organizationMembership.update({ where: { id: membership }, data: { status: 'ACTIVE' } }); await revoke(P.TASK_CREATE); await propose().expect(403);
  });
  it('only creates a draft until explicit confirmation; replays return the same task', async () => {
    const d = await propose().expect(201); expect(d.body.provider).toBe('mock'); expect(d.body.requiresConfirmation).toBe(true);
    expect(await db.task.count({ where: { organizationId: org } })).toBe(0);
    const path = base(`ai/task-drafts/${d.body.id}/confirm`);
    await http().post(path).set(auth()).send(d.body.task).expect(400);
    const first = await http().post(path).set(auth()).send({ ...d.body.task, title: 'Edited by human', confirm: true }).expect(200);
    const again = await http().post(path).set(auth()).send({ ...d.body.task, confirm: true }).expect(200);
    expect(again.body).toEqual({ taskId: first.body.taskId, replayed: true });
    expect(await db.task.count({ where: { organizationId: org } })).toBe(1);
    expect((await db.task.findUniqueOrThrow({ where: { id: first.body.taskId } })).title).toBe('Edited by human');
  });
  it('rejects tenant/user draft tampering, expiry, revoked permission and injected grants', async () => {
    const d = await propose().expect(201); const path = base(`ai/task-drafts/${d.body.id}/confirm`);
    await http().post(base(`ai/task-drafts/${d.body.id}/confirm`, foreign)).set(auth()).send({ ...d.body.task, confirm: true }).expect(403);
    await http().post(path).set(auth()).send({ ...d.body.task, confirm: true, permissionKeys: ['task:assign'] }).expect(400);
    await http().post(path).set(auth()).send({ ...d.body.task, confirm: true, assigneeEmployeeId: employee }).expect(403);
    await db.aiTaskDraft.update({ where: { id: d.body.id }, data: { expiresAt: new Date(0) } });
    await http().post(path).set(auth()).send({ ...d.body.task, confirm: true }).expect(409);
    await revoke(P.AI_USE); await http().post(path).set(auth()).send({ ...d.body.task, confirm: true }).expect(403);
  });
  it('rolls back task and draft consumption if domain audit fails', async () => {
    const d = await propose().expect(201); const audit = app.get(AuditService); const record = audit.record.bind(audit);
    jest.spyOn(audit, 'record').mockImplementation(async (input, tx) => { if (input.event === 'task.created') throw Error('fixture audit failure'); return record(input, tx); });
    await http().post(base(`ai/task-drafts/${d.body.id}/confirm`)).set(auth()).send({ ...d.body.task, confirm: true }).expect(500);
    expect(await db.task.count({ where: { organizationId: org } })).toBe(0);
    expect((await db.aiTaskDraft.findUniqueOrThrow({ where: { id: d.body.id } })).committedAt).toBeNull();
  });
  it('extracts real PDF text, returns page citation and removes derived text on source deletion', async () => {
    const id = await upload(); await http().post(base(`ai/knowledge/${id}/index`)).set(auth()).expect(200);
    const found = await http().post(base('ai/knowledge/search')).set(auth()).send({ query: 'orientation' }).expect(200);
    expect(found.body.items[0]).toMatchObject({ fileId: id, page: 1, excerpt: expect.stringContaining('orientation starts at nine') });
    expect(JSON.stringify(found.body)).not.toMatch(/storageKey|password|refreshToken|session/i);
    const chat = await http().post(base('ai/generate')).set(auth()).send({ messages: [{ role: 'user', content: 'Tra cứu PDF orientation' }] }).expect(200);
    expect(chat.body.text).toContain('orientation'); expect(chat.body.citations).toEqual(expect.arrayContaining([expect.objectContaining({ id, href: '/files' })]));
    await http().delete(base(`files/${id}`)).set(auth()).expect(200);
    expect(await db.aiKnowledgeChunk.count({ where: { organizationId: org } })).toBe(0);
  });
  it('never retrieves foreign, HR-linked, changed or deleted sources', async () => {
    const id = await upload(); await http().post(base(`ai/knowledge/${id}/index`)).set(auth()).expect(200);
    await http().post(base(`ai/knowledge/${id}/index`, foreign)).set(auth()).expect(403);
    await db.fileObject.update({ where: { id }, data: { checksum: 'b'.repeat(64) } });
    expect((await http().post(base('ai/knowledge/search')).set(auth()).send({ query: 'orientation' }).expect(200)).body.items).toEqual([]);
    const document = await db.employeeDocument.create({ data: { organizationId: org, employeeId: employee, title: 'Private contract', category: 'LABOR_CONTRACT' } });
    await db.documentVersion.create({ data: { organizationId: org, documentId: document.id, fileId: id, versionNumber: 1, fileName: "orientation.pdf", fileSize: 500, contentType: "application/pdf", uploadedByUserId: user } });
    await http().post(base(`ai/knowledge/${id}/index`)).set(auth()).expect(404);
    expect((await http().get(base('ai/knowledge')).set(auth()).expect(200)).body.items).toEqual([]);
  });
  it('rejects unsupported PDF and requires file permissions for indexing/search', async () => {
    const id = await upload(Buffer.from('%PDF-1.4\ninvalid fixture\n%%EOF'));
    await http().post(base(`ai/knowledge/${id}/index`)).set(auth()).expect(400);
    await revoke(P.FILE_UPLOAD); await http().post(base(`ai/knowledge/${id}/index`)).set(auth()).expect(403);
    await revoke(P.FILE_READ); await http().post(base('ai/knowledge/search')).set(auth()).send({ query: 'orientation' }).expect(403);
    await http().get(base('ai/knowledge')).set(auth()).expect(403);
  });
});

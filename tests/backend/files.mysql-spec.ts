// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { FilesService } from '../../backend/src/modules/files/files.service';
import { StorageService } from '../../backend/src/modules/files/storage.service';
import { LocalStorageService } from '../../backend/src/modules/files/local-storage.service';
import { FileScannerService } from '../../backend/src/modules/files/file-scanner.service';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { MAX_FILE_BYTES } from '../../backend/src/modules/files/file-policy';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'file-test-only-secret-not-production';
const bytes = Buffer.from('%PDF-1.7\nprivate fixture\n%%EOF');
mysqlDescribe('file API with real MySQL, streaming storage and IAM/RBAC', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication; let organizations: OrganizationsService; let files: FilesService; let audit: AuditService;
  let root: string; let storage: LocalStorageService;
  let users: string[]; let tokens: string[]; let orgs: string[]; let role: string;
  const path = (org = orgs[0]) => `/api/v1/organizations/${org}/files`;
  const upload = (org = orgs[0], token = tokens[0]) => request(app.getHttpServer()).post(path(org)).set('Authorization', `Bearer ${token}`);
  const attach = (req = upload(), content = bytes, filename = 'report.pdf', contentType = 'application/pdf') => req.attach('file', content, { filename, contentType });
  const get = (id: string, org = orgs[0], token = tokens[0], suffix = '') => request(app.getHttpServer()).get(`${path(org)}/${id}${suffix}`).set('Authorization', `Bearer ${token}`);
  const del = (id: string, org = orgs[0], token = tokens[0]) => request(app.getHttpServer()).delete(`${path(org)}/${id}`).set('Authorization', `Bearer ${token}`);
  async function grants() {
    for (const key of [PERMISSIONS.FILE_UPLOAD, PERMISSIONS.FILE_READ, PERMISSIONS.FILE_DELETE]) {
      const p = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role, permissionId: p.id } }, update: {}, create: { roleId: role, permissionId: p.id } });
    }
  }
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required');
    process.env.JWT_ACCESS_SECRET = secret;
    root = await mkdtemp(join(tmpdir(), 'dxos-files-http-'));
    storage = new LocalStorageService(new ConfigService({ FILE_STORAGE_ROOT: root }));
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db)
      .overrideProvider(StorageService).useValue(storage).compile();
    files = module.get(FilesService); organizations = module.get(OrganizationsService); audit = module.get(AuditService);
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => undefined)); await app.init();
  });
  beforeEach(async () => {
    users = [randomUUID(), randomUUID(), randomUUID()]; tokens = []; orgs = [];
    await db.user.createMany({ data: users.map((id) => ({ id, email: `${id}@example.test` })) });
    for (const id of users) {
      const sid = randomUUID(); await db.authSession.create({ data: { id: sid, userId: id,
        refreshTokenHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''), expiresAt: new Date(Date.now() + 300000) } });
      tokens.push(sign({ sub: id, sid, typ: 'access' }, secret, { expiresIn: 300 }));
    }
    for (const user of users.slice(0, 2)) orgs.push((await organizations.create(user, { name: 'Files fixture', slug: `files-${randomUUID()}` })).id);
    await db.organizationMembership.create({ data: { organizationId: orgs[0], userId: users[2] } });
    role = (await db.role.findFirstOrThrow({ where: { organizationId: orgs[0] } })).id;
    await grants();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const organizationId = { in: orgs };
    await db.fileObject.deleteMany({ where: { organizationId } });
    await db.notification.deleteMany({ where: { organizationId } });
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: { in: users } }] } });
    await db.membershipRole.deleteMany({ where: { organizationId } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId } } });
    await db.role.deleteMany({ where: { organizationId } }); await db.organizationMembership.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.authSession.deleteMany({ where: { userId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } });
    for (const key of await readdir(root)) await storage.delete(key);
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); await rm(root, { recursive: true, force: true }); delete process.env.JWT_ACCESS_SECRET; });

  it.each([400, 503])('never publishes bytes when malware scan rejects/fails (%s)', async status => {
    jest.spyOn(app.get(FileScannerService), 'scanStored').mockRejectedValue(status === 400 ? new BadRequestException() : new ServiceUnavailableException());
    await attach().expect(status);
    const rows = await db.fileObject.findMany({ where: { organizationId: orgs[0] } });
    expect(rows).toHaveLength(1); expect(rows[0].status).toBe('FAILED');
    expect(await storage.exists(rows[0].storageKey)).toBe(false);
    await get(rows[0].id, orgs[0], tokens[0], '/content').expect(403);
  });

  it.each(['upload', 'metadata', 'download', 'delete'])('returns 401 for missing/invalid/expired authentication: %s', async (method) => {
    for (const token of [undefined, 'bad', sign({ sub: users[0], sid: randomUUID(), typ: 'access' }, secret, { expiresIn: -1 })]) {
      const agent = request(app.getHttpServer()); const base = `${path()}/${randomUUID()}`;
      const req = method === 'upload' ? agent.post(path()) : method === 'delete' ? agent.delete(base) : agent.get(base + (method === 'download' ? '/content' : ''));
      if (token) req.set('Authorization', `Bearer ${token}`);
      await req.expect(401);
    }
    expect(await db.fileObject.count({ where: { organizationId: { in: orgs } } })).toBe(0);
  });
  it('uploads authoritative metadata and correlated audit, then streams an attachment without exposing internal paths', async () => {
    const correlation = randomUUID();
    const result = await attach(upload().set('x-request-id', correlation)).expect(201);
    expect(result.body).toEqual({ id: expect.any(String), organizationId: orgs[0], uploadedByUserId: users[0], originalFilename: 'report.pdf',
      contentType: 'application/pdf', size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex'), status: 'AVAILABLE',
      createdAt: expect.any(String), updatedAt: expect.any(String) });
    const metadata = await get(result.body.id).expect(200); expect(metadata.body).toEqual(result.body);
    const content = await get(result.body.id, orgs[0], tokens[0], '/content').expect(200);
    expect(content.body).toEqual(bytes); expect(content.headers['content-disposition']).toBe('attachment; filename="report.pdf"');
    expect(content.headers['x-content-type-options']).toBe('nosniff'); expect(content.headers['cache-control']).toBe('private, no-store');
    const row = await db.fileObject.findUniqueOrThrow({ where: { id: result.body.id } });
    expect(row.storageKey).not.toBe(row.originalFilename); expect(JSON.stringify(result.body)).not.toContain(row.storageKey);
    const event = await db.auditEvent.findFirstOrThrow({ where: { event: 'file.uploaded', resourceId: row.id } });
    expect(event).toMatchObject({ actorUserId: users[0], organizationId: orgs[0], requestId: correlation, source: 'HTTP', metadata: {} });
    expect(JSON.stringify(event)).not.toContain('private fixture'); expect(await db.notification.count()).toBe(0);
  });
  it('denies nonmembers and unprivileged members before parsing any bytes', async () => {
    for (const token of tokens.slice(1)) {
      await attach(upload(orgs[0], token)).expect(403); await get(randomUUID(), orgs[0], token).expect(403); await del(randomUUID(), orgs[0], token).expect(403);
    }
    expect(await readdir(root)).toEqual([]); expect(await db.fileObject.count({ where: { organizationId: { in: orgs } } })).toBe(0);
  });
  it('does not automatically grant file access to organization owners', async () => {
    await attach(upload(orgs[1], tokens[1])).expect(403);
  });
  it('rejects cross-tenant and malformed identifiers, including header tenant overrides', async () => {
    const row = (await attach().expect(201)).body;
    await get(row.id, orgs[1]).set('x-organization-id', orgs[0]).expect(403); await del(row.id, orgs[1]).expect(403);
    for (const id of [randomUUID(), 'invalid']) { await get(id).expect(403); await del(id).expect(403); }
    await attach(upload('invalid')).expect(403);
    const foreign = await db.fileObject.create({ data: { organizationId: orgs[1], uploadedByUserId: users[1], originalFilename: 'x.pdf', contentType: 'application/pdf', storageKey: randomUUID(), status: 'AVAILABLE', size: 1 } });
    await get(foreign.id).expect(403); await del(foreign.id).expect(403);
  });
  it.each(['organizationId', 'uploadedByUserId', 'storageKey', 'size', 'checksum', 'isAdmin'])('rejects multipart/query/body tampering: %s', async (key) => {
    await attach(upload().field(key, 'forged')).expect(400);
    const row = (await attach().expect(201)).body;
    await get(row.id).query({ [key]: 'forged' }).expect(400);
    await del(row.id).send({ [key]: 'forged' }).expect(400);
  });
  it('compensates stored bytes when query validation fails after parsing', async () => {
    await attach(upload().query({ storageKey: randomUUID() })).expect(400);
    expect(await readdir(root)).toEqual([]);
    expect((await db.fileObject.findFirstOrThrow({ where: { organizationId: { in: orgs } } })).status).toBe('FAILED');
  });
  it.each(['../x.pdf', '/x.pdf', 'C:\\x.pdf', '%2e%2e%2fx.pdf', 'a\\b.pdf'])('rejects raw multipart path filename %s', async (filename) => {
    const boundary = 'dxos-boundary';
    const raw = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\r\n--${boundary}--\r\n`;
    await upload().set('Content-Type', `multipart/form-data; boundary=${boundary}`).send(raw).expect(400);
    expect(await readdir(root)).toEqual([]);
  });
  it('rejects empty, oversized, unsupported and MIME-spoofed files without available metadata', async () => {
    await attach(upload(), Buffer.alloc(0)).expect(400);
    await attach(upload(), Buffer.alloc(MAX_FILE_BYTES + 1, 65)).expect(413);
    await attach(upload(), bytes, 'file.html', 'text/html').expect(415);
    await attach(upload(), Buffer.from('<script>bad</script>')).expect(415);
    expect(await db.fileObject.count({ where: { status: 'AVAILABLE', organizationId: { in: orgs } } })).toBe(0); expect(await readdir(root)).toEqual([]);
  });
  it('rejects missing or multiple file parts', async () => {
    await upload().send({}).expect(400);
    await attach().attach('file', bytes, { filename: 'second.pdf', contentType: 'application/pdf' }).expect(400);
    expect(await readdir(root)).toEqual([]);
  });
  it('compensates malformed multipart termination', async () => {
    const receive = files.receive.bind(files);
    let complete!: () => void;
    const completed = new Promise<void>((resolve) => { complete = resolve; });
    jest.spyOn(files, 'receive').mockImplementation(async (...args) => {
      try { return await receive(...args); } finally { complete(); }
    });
    const raw = '--broken\r\nContent-Disposition: form-data; name="file"; filename="x.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7';
    await upload().set('Content-Type', 'multipart/form-data; boundary=broken').send(raw).timeout(3000).expect(400);
    // Parser errors can return before an in-flight storage callback finishes compensation.
    await completed;
    expect(await db.fileObject.count({ where: { status: 'AVAILABLE', organizationId: { in: orgs } } })).toBe(0);
    expect(await db.fileObject.count({ where: { status: 'UPLOADING', organizationId: { in: orgs } } })).toBe(0);
    expect(await readdir(root)).toEqual([]);
  });
  it('rechecks permission after streaming and compensates if upload permission was revoked', async () => {
    const receive = files.receive.bind(files);
    jest.spyOn(files, 'receive').mockImplementation(async (...args) => {
      const result = await receive(...args);
      await db.rolePermission.deleteMany({ where: { roleId: role } });
      return result;
    });
    await attach().expect(403);
    expect((await db.fileObject.findFirstOrThrow({ where: { organizationId: { in: orgs } } })).status).toBe('FAILED');
    expect(await readdir(root)).toEqual([]);
  });
  it('soft-deletes idempotently with one audit, retaining metadata and bytes', async () => {
    const row = (await attach().expect(201)).body;
    const first = await del(row.id).expect(200); const second = await del(row.id).expect(200);
    expect(first.body.status).toBe('DELETED'); expect(second.body).toEqual(first.body);
    await get(row.id).expect(403); await get(row.id, orgs[0], tokens[0], '/content').expect(403);
    expect(await readdir(root)).toHaveLength(1); expect(await db.fileObject.count({ where: { organizationId: { in: orgs } } })).toBe(1);
    expect(await db.auditEvent.count({ where: { resourceId: row.id, event: 'file.deleted' } })).toBe(1);
  });

  it('lists only available tenant files with deterministic bounded pagination and safe metadata', async () => {
    const first = (await attach().expect(201)).body;
    const second = (await attach( upload(), bytes, 'second.pdf').expect(201)).body;
    await del(second.id).expect(200);
    await db.fileObject.createMany({ data: [
      { organizationId: orgs[0], uploadedByUserId: users[0], originalFilename: 'pending.pdf', contentType: 'application/pdf', storageKey: randomUUID(), status: 'UPLOADING' },
      { organizationId: orgs[0], uploadedByUserId: users[0], originalFilename: 'failed.pdf', contentType: 'application/pdf', storageKey: randomUUID(), status: 'FAILED' },
    ] });
    const page = await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${tokens[0]}`).query({ limit: 1 }).expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0]).toMatchObject({ id: first.id, organizationId: orgs[0], status: 'AVAILABLE' });
    expect(page.body.items[0]).not.toHaveProperty('storageKey');
    expect(page.body.items[0]).not.toHaveProperty('storageProvider');
    expect(page.body.nextCursor).toBeNull();
    for (const query of [{ limit: 0 }, { limit: 101 }, { after: 'bad' }, { storageKey: 'forged' }]) {
      await request(app.getHttpServer()).get(path()).set('Authorization', `Bearer ${tokens[0]}`).query(query).expect(400);
    }
    await request(app.getHttpServer()).get(path(orgs[1])).set('Authorization', `Bearer ${tokens[0]}`).expect(403);
  });
  it.each(['member', 'organization', 'user', 'role', 'grant'])('revocation blocks subsequent upload/download/delete: %s', async (kind) => {
    const row = (await attach().expect(201)).body;
    if (kind === 'member') await db.organizationMembership.update({ where: { organizationId_userId: { organizationId: orgs[0], userId: users[0] } }, data: { status: 'REMOVED' } });
    if (kind === 'organization') await db.organization.update({ where: { id: orgs[0] }, data: { status: 'SUSPENDED' } });
    if (kind === 'user') await db.user.update({ where: { id: users[0] }, data: { accountStatus: 'INACTIVE' } });
    if (kind === 'role') await db.role.update({ where: { id: role }, data: { isActive: false } });
    if (kind === 'grant') await db.rolePermission.deleteMany({ where: { roleId: role } });
    const status = kind === 'user' ? 401 : 403;
    await attach().expect(status); await get(row.id, orgs[0], tokens[0], '/content').expect(status); await del(row.id).expect(status);
  });
  it('compensates a storage failure and exposes no physical path in the safe error', async () => {
    jest.spyOn(storage, 'put').mockRejectedValue(new Error('C:/private/secret.txt'));
    const result = await attach().expect(500); expect(JSON.stringify(result.body)).not.toContain('private');
    expect((await db.fileObject.findFirstOrThrow({ where: { organizationId: { in: orgs } } })).status).toBe('FAILED'); expect(await readdir(root)).toEqual([]);
  });
  it('rolls back upload finalization and compensates bytes if audit persistence fails', async () => {
    const record = audit.record.bind(audit);
    jest.spyOn(audit, 'record').mockImplementation((input, tx) => { if (input.event === 'file.uploaded') throw new Error('audit unavailable'); return record(input, tx); });
    await attach().expect(500);
    expect((await db.fileObject.findFirstOrThrow({ where: { organizationId: { in: orgs } } })).status).toBe('FAILED'); expect(await readdir(root)).toEqual([]);
    expect(await db.auditEvent.count({ where: { event: 'file.uploaded' } })).toBe(0);
  });
  it('preserves available bytes if finalization committed but its caller saw an error', async () => {
    const finish = files.finish.bind(files);
    jest.spyOn(files, 'finish').mockImplementation(async (...args) => { await finish(...args); throw new Error('connection lost after commit'); });
    await attach().expect(500);
    const row = await db.fileObject.findFirstOrThrow({ where: { organizationId: { in: orgs } } }); expect(row.status).toBe('AVAILABLE');
    expect(await storage.exists(row.storageKey)).toBe(true); await get(row.id, orgs[0], tokens[0], '/content').expect(200);
  });
  it('retains retryable metadata when compensation fails, then safely retries cleanup', async () => {
    jest.spyOn(storage, 'delete').mockRejectedValue(new Error('disk unavailable'));
    await attach(upload().query({ invalid: 'field' })).expect(500);
    const row = await db.fileObject.findFirstOrThrow({ where: { organizationId: { in: orgs } } }); expect(row.status).toBe('FAILED');
    expect(await readdir(root)).toHaveLength(1);
    jest.restoreAllMocks(); await files.cleanupUpload(row.id); await files.cleanupUpload(row.id);
    expect(await readdir(root)).toEqual([]); await get(row.id).expect(403);
  });
  it('rolls back soft deletion when audit fails', async () => {
    const row = (await attach().expect(201)).body;
    jest.spyOn(audit, 'record').mockRejectedValue(new Error('audit unavailable'));
    await del(row.id).expect(500);
    expect((await db.fileObject.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('AVAILABLE');
    await get(row.id, orgs[0], tokens[0], '/content').expect(200);
  });
  it('checks storage existence on download and hides unavailable lifecycle rows', async () => {
    const row = (await attach().expect(201)).body;
    const stored = await db.fileObject.findUniqueOrThrow({ where: { id: row.id } }); await storage.delete(stored.storageKey);
    await get(row.id, orgs[0], tokens[0], '/content').expect(500);
    await db.fileObject.update({ where: { id: row.id }, data: { status: 'UPLOADING' } });
    await get(row.id).expect(403); await del(row.id).expect(403); await files.cleanupUpload(row.id);
  });
  it('publishes secured OpenAPI routes without internal storage properties', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
    expect(response.body.paths['/organizations/{organizationId}/files'].post['x-required-permission']).toBe('file:upload');
    expect(response.body.components.schemas.FileMetadata.properties.storageKey).toBeUndefined();
  });
});


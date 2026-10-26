import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../backend/src/app.module';
import { configureApplication } from '../../backend/src/app.setup';
import { getAppConfiguration } from '../../backend/src/config/environment';
import { StructuredLogger, type StructuredLogRecord } from '../../backend/src/common/logging/structured-logger';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';
import { FilesService } from '../../backend/src/modules/files/files.service';
import { StorageService } from '../../backend/src/modules/files/storage.service';
import { LocalStorageService } from '../../backend/src/modules/files/local-storage.service';

const url = process.env.RBAC_TEST_DATABASE_URL;
const mysqlDescribe = url ? describe : describe.skip;
const secret = 'collaboration-test-only-secret-not-production';
const actions = ['comments', 'comment', 'attachments', 'link', 'unlink', 'progress'] as const;
type Action = typeof actions[number];
mysqlDescribe('DXOS-WORK-002 tenant-safe task collaboration and progress', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'mysql://unused:unused@localhost:3306/unused' } } });
  let app: INestApplication, storageRoot: string;
  let actor: string, foreign: string, org: string, foreignOrg: string, employee: string;
  let task: string, otherTask: string, foreignTask: string, file: string, foreignFile: string;
  let link: string, foreignLink: string, role: string, session: string, token: string;
  const logs: StructuredLogRecord[] = [];
  const base = (o = org, t = task) => `/api/v1/organizations/${o}/tasks/${t}`;
  const bearer = () => `Bearer ${token}`;
  const http = () => request(app.getHttpServer());
  const comment = (body: object = { body: 'Private comment' }) => http().post(`${base()}/comments`).set('Authorization', bearer()).send(body);
  const attach = (fileId = file) => http().post(`${base()}/attachments`).set('Authorization', bearer()).send({ fileId });
  const patch = (body: object) => http().patch(base()).set('Authorization', bearer()).send(body);
  const events = () => db.auditEvent.findMany({ where: { organizationId: org, event: { startsWith: 'task.' } } });
  const revoke = (key: string) => db.rolePermission.deleteMany({ where: { roleId: role, permission: { key } } });
  function op(action: Action, o = org, t = task, attachmentId = link) {
    const p = base(o, t);
    if (action === 'comment') return http().post(`${p}/comments`).send({ body: 'Private comment' });
    if (action === 'link') return http().post(`${p}/attachments`).send({ fileId: file });
    if (action === 'unlink') return http().delete(`${p}/attachments/${attachmentId}`);
    if (action === 'progress') return http().patch(p).send({ status: 'IN_PROGRESS', progressPercent: 35 });
    return http().get(`${p}/${action}`);
  }
  beforeAll(async () => {
    if (!/^\/dx_os_rbac_test_[a-f0-9]{16}$/.test(new URL(url!).pathname)) throw new Error('Disposable database required.');
    process.env.JWT_ACCESS_SECRET = secret;
    storageRoot = await mkdtemp(join(tmpdir(), 'dxos-collaboration-'));
    const storage = new LocalStorageService(new ConfigService({ FILE_STORAGE_ROOT: storageRoot }));
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db)
      .overrideProvider(StorageService).useValue(storage).compile();
    app = module.createNestApplication();
    configureApplication(app, getAppConfiguration(), new StructuredLogger('debug', (r) => logs.push(r))); await app.init();
  });
  beforeEach(async () => {
    actor = randomUUID(); foreign = randomUUID();
    await db.user.createMany({ data: [actor, foreign].map((id) => ({ id, email: `${id}@example.test`, displayName: 'Member name', passwordHash: 'private-fixture-hash' })) });
    session = randomUUID(); await db.authSession.create({ data: { id: session, userId: actor,
      refreshTokenHash: randomUUID().replaceAll('-', '').repeat(2), expiresAt: new Date(Date.now() + 300000) } });
    token = sign({ sub: actor, sid: session, typ: 'access' }, secret, { expiresIn: 300 });
    const orgs = app.get(OrganizationsService);
    org = (await orgs.create(actor, { name: 'A', slug: `collab-${randomUUID()}` })).id;
    foreignOrg = (await orgs.create(foreign, { name: 'B', slug: `collab-${randomUUID()}` })).id;
    role = (await db.role.findFirstOrThrow({ where: { organizationId: org } })).id;
    for (const key of ['task:read', 'task:update', 'file:read', 'file:upload', 'file:delete']) {
      const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
      await db.rolePermission.create({ data: { roleId: role, permissionId: permission.id } });
    }
    employee = (await db.employee.create({ data: { organizationId: org, userId: actor, employeeCode: 'A', displayName: 'Organization name' } })).id;
    const foreignEmployee = (await db.employee.create({ data: { organizationId: foreignOrg, userId: foreign, employeeCode: 'B', displayName: 'Foreign name' } })).id;
    task = (await db.task.create({ data: { organizationId: org, creatorEmployeeId: employee, title: 'A' } })).id;
    otherTask = (await db.task.create({ data: { organizationId: org, creatorEmployeeId: employee, title: 'A2' } })).id;
    foreignTask = (await db.task.create({ data: { organizationId: foreignOrg, creatorEmployeeId: foreignEmployee, title: 'B' } })).id;
    const createFile = (organizationId: string, uploadedByUserId: string) => db.fileObject.create({ data: {
      organizationId, uploadedByUserId, originalFilename: 'private-file.pdf', contentType: 'application/pdf', size: 42,
      storageKey: randomUUID(), status: 'AVAILABLE' } });
    file = (await createFile(org, actor)).id; foreignFile = (await createFile(foreignOrg, foreign)).id;
    link = (await db.taskAttachment.create({ data: { organizationId: org, taskId: task, fileId: file, linkedByUserId: actor } })).id;
    foreignLink = (await db.taskAttachment.create({ data: { organizationId: foreignOrg, taskId: foreignTask, fileId: foreignFile, linkedByUserId: foreign } })).id;
    logs.length = 0;
  });
  afterEach(async () => {
    jest.restoreAllMocks(); const organizationId = { in: [org, foreignOrg] }; const users = { in: [actor, foreign] };
    await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: users }] } });
    await db.taskComment.deleteMany({ where: { organizationId } }); await db.taskAttachment.deleteMany({ where: { organizationId } });
    await db.fileObject.deleteMany({ where: { organizationId } }); await db.task.deleteMany({ where: { organizationId } });
    await db.employee.deleteMany({ where: { organizationId } }); await db.membershipRole.deleteMany({ where: { organizationId } });
    await db.rolePermission.deleteMany({ where: { role: { organizationId } } }); await db.role.deleteMany({ where: { organizationId } });
    await db.organizationMembership.deleteMany({ where: { organizationId } }); await db.organization.deleteMany({ where: { id: organizationId } });
    await db.authSession.deleteMany({ where: { userId: users } }); await db.user.deleteMany({ where: { id: users } });
  });
  afterAll(async () => {
    await app?.close(); await db.$disconnect(); delete process.env.JWT_ACCESS_SECRET;
    if (storageRoot && dirname(resolve(storageRoot)) === resolve(tmpdir()) && basename(storageRoot).startsWith('dxos-collaboration-')) {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  it.each(actions)('%s requires IAM authentication', async (action) => { await op(action).expect(401); });
  it.each(actions)('%s rejects revoked sessions', async (action) => {
    await db.authSession.update({ where: { id: session }, data: { revokedAt: new Date() } });
    await op(action).set('Authorization', bearer()).expect(401);
  });
  it.each(actions)('%s rejects inactive membership', async (action) => {
    await db.organizationMembership.updateMany({ where: { organizationId: org, userId: actor }, data: { status: 'INACTIVE' } });
    await op(action).set('Authorization', bearer()).expect(403);
  });
  it.each(actions)('%s rejects foreign organization context', async (action) => {
    await op(action, foreignOrg, foreignTask, foreignLink).set('Authorization', bearer()).expect(403);
  });
  it.each(actions)('%s scopes the task before accessing children', async (action) => {
    await op(action, org, foreignTask, foreignLink).set('Authorization', bearer()).expect(404);
    await op(action, org, randomUUID(), foreignLink).set('Authorization', bearer()).expect(404);
    expect(await events()).toHaveLength(0);
  });
  it.each(actions)('%s requires its explicit task grant', async (action) => {
    await revoke(action === 'comments' || action === 'attachments' ? 'task:read' : 'task:update');
    await op(action).set('Authorization', bearer()).expect(403);
  });
  it.each(['attachments', 'link', 'unlink'] as const)('%s independently requires file:read', async (action) => {
    await revoke('file:read'); await op(action).set('Authorization', bearer()).expect(403);
  });
  it('inactive role with administrator name gives no bypass', async () => {
    await db.role.update({ where: { id: role }, data: { key: 'SUPER_ADMIN', isActive: false } });
    await comment().expect(403); await attach().expect(403);
  });
  it('adds an actor-derived, trimmed immutable comment and an atomic content-free audit', async () => {
    const result = await comment({ body: '  A private note\nwith a second line  ' }).set('x-request-id', 'collab-comment-001').expect(201);
    expect(result.body).toEqual({ id: expect.any(String), taskId: task, authorUserId: actor,
      authorDisplayName: 'Organization name', body: 'A private note\nwith a second line', createdAt: expect.any(String) });
    expect(await events()).toEqual([expect.objectContaining({ event: 'task.comment.added', resourceType: 'task_comment',
      resourceId: result.body.id, organizationId: org, actorUserId: actor, requestId: 'collab-comment-001', metadata: {} })]);
    expect(JSON.stringify({ logs, events: await events() })).not.toContain('private note');
    await http().patch(`${base()}/comments/${result.body.id}`).set('Authorization', bearer()).send({ body: 'Edited' }).expect(404);
    await http().delete(`${base()}/comments/${result.body.id}`).set('Authorization', bearer()).expect(404);
  });
  it('allows an authorized member without an Employee profile to comment', async () => {
    await db.organizationMembership.create({ data: { organizationId: org, userId: foreign } });
    const m = await db.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: org, userId: foreign } } });
    await db.membershipRole.create({ data: { organizationId: org, membershipId: m.id, roleId: role } });
    await db.authSession.update({ where: { id: session }, data: { userId: foreign } });
    token = sign({ sub: foreign, sid: session, typ: 'access' }, secret, { expiresIn: 300 });
    const r = await comment().expect(201); expect(r.body.authorUserId).toBe(foreign); expect(r.body.authorDisplayName).toBe('Member name');
  });
  it.each([{}, { body: '' }, { body: '  ' }, { body: null }, { body: 1 }, { body: 'a'.repeat(4001) }, { body: 'bad\u0000text' },
    { body: 'ok', authorUserId: 'spoof' }, { body: 'ok', organizationId: 'spoof' }, { body: 'ok', permissions: ['task:update'] },
    { body: 'ok', taskId: 'spoof' }, { body: 'ok', createdAt: 'spoof' }, { body: 'ok', authorMembership: {} }])('rejects invalid/spoofed comment %j', async (input) => {
    await comment(input).expect(400); expect(await db.taskComment.count({ where: { organizationId: org } })).toBe(0);
  });
  it.each(['comments', 'attachments'])('%s enforces the decoded body limit including compressed input', async (kind) => {
    const compressed = http().post(`${base()}/${kind}`).set('Authorization', bearer()).type('json').set('Content-Encoding', 'gzip');
    compressed.write(gzipSync(JSON.stringify({ body: 'x'.repeat(70000) }))); await compressed.expect(413);
  });
  it('comments paginate chronologically with UUID tie-breaks and scoped cursors', async () => {
    const ids = Array.from({ length: 4 }, () => randomUUID()).sort();
    for (const id of ids) await db.taskComment.create({ data: { id, organizationId: org, taskId: task, authorUserId: actor, body: 'note', createdAt: new Date('2026-09-14T00:00:00.123Z') } });
    const another = await db.taskComment.create({ data: { organizationId: org, taskId: otherTask, authorUserId: actor, body: 'other' } });
    const outside = await db.taskComment.create({ data: { organizationId: foreignOrg, taskId: foreignTask, authorUserId: foreign, body: 'foreign' } });
    const get = (query = {}) => http().get(`${base()}/comments`).set('Authorization', bearer()).query(query);
    const first = (await get({ limit: 2 }).expect(200)).body;
    expect(first.items.map((r: { id: string }) => r.id)).toEqual(ids.slice(0, 2)); expect(first.nextCursor).toBe(ids[1]);
    const last = (await get({ limit: 2, after: first.nextCursor }).expect(200)).body;
    expect(last.items.map((r: { id: string }) => r.id)).toEqual(ids.slice(2)); expect(last.nextCursor).toBeNull();
    for (const after of [another.id, outside.id, randomUUID()]) await get({ after }).expect(400);
    expect(await events()).toHaveLength(0);
  });
  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: 'abc' }, { after: 'bad' }, { roleId: 'crafted' }, { fileId: 'crafted' }])('rejects unsupported pagination %j', async (query) => {
    for (const kind of ['comments', 'attachments']) await http().get(`${base()}/${kind}`).set('Authorization', bearer()).query(query).expect(400);
  });
  it('links idempotently and unlinks only the task association', async () => {
    const before = await db.fileObject.findUniqueOrThrow({ where: { id: file } });
    const existing = await attach().expect(201); expect(existing.body.id).toBe(link); expect(await events()).toHaveLength(0);
    await http().post(`${base(org, otherTask)}/attachments`).set('Authorization', bearer()).send({ fileId: file }).expect(201);
    await http().delete(`${base()}/attachments/${link}`).set('Authorization', bearer()).expect(204);
    expect(await db.fileObject.findUniqueOrThrow({ where: { id: file } })).toEqual(before);
    expect(await db.taskAttachment.count({ where: { organizationId: org, fileId: file } })).toBe(1);
    await http().delete(`${base()}/attachments/${link}`).set('Authorization', bearer()).expect(404);
    expect((await events()).map((r) => r.event).sort()).toEqual(['task.attachment.linked', 'task.attachment.unlinked']);
  });
  it('concurrent duplicate links produce one row and one success audit', async () => {
    await db.taskAttachment.delete({ where: { id: link } });
    const results = await Promise.all([attach().expect(201), attach().expect(201)]);
    expect(results[0].body.id).toBe(results[1].body.id);
    expect(await db.taskAttachment.count({ where: { organizationId: org, taskId: task } })).toBe(1);
    expect(await events()).toHaveLength(1);
  });
  it('foreign files and foreign/wrong-task attachment IDs cannot disclose or mutate data', async () => {
    for (const id of [foreignFile, randomUUID()]) await attach(id).expect(404);
    for (const id of [foreignLink, randomUUID()]) await http().delete(`${base()}/attachments/${id}`).set('Authorization', bearer()).expect(404);
    await http().delete(`${base(org, otherTask)}/attachments/${link}`).set('Authorization', bearer()).expect(404);
    expect(await db.taskAttachment.count()).toBeGreaterThanOrEqual(2); expect(await events()).toHaveLength(0);
  });
  it.each(['UPLOADING', 'FAILED', 'DELETED'] as const)('rejects %s file references and hides their metadata', async (status) => {
    await db.fileObject.update({ where: { id: file }, data: { status } });
    await attach().expect(409);
    const r = await http().get(`${base()}/attachments`).set('Authorization', bearer()).expect(200);
    expect(r.body).toEqual({ items: [], nextCursor: null });
    await http().delete(`${base()}/attachments/${link}`).set('Authorization', bearer()).expect(204);
  });
  it.each([{}, { fileId: 'bad' }, { fileId: null }, { fileId: randomUUID(), organizationId: randomUUID() },
    { fileId: randomUUID(), linkedByUserId: randomUUID() }, { fileId: randomUUID(), storageKey: 'private' }])('rejects invalid attachment input %j', async (body) => {
    await http().post(`${base()}/attachments`).set('Authorization', bearer()).send(body).expect(400);
  });
  it('attachment pagination survives file soft deletion and rejects foreign cursors', async () => {
    const id = (await db.fileObject.create({ data: { organizationId: org, uploadedByUserId: actor,
      originalFilename: 'second.pdf', contentType: 'application/pdf', storageKey: randomUUID(), status: 'AVAILABLE' } })).id;
    await db.taskAttachment.update({ where: { id: link }, data: { createdAt: new Date('2026-01-01Z') } });
    const second = await attach(id).expect(201);
    const get = (query = {}) => http().get(`${base()}/attachments`).set('Authorization', bearer()).query(query);
    const first = (await get({ limit: 1 }).expect(200)).body;
    expect(first.items[0].id).toBe(link); expect(first.nextCursor).toBe(link);
    await db.fileObject.update({ where: { id: file }, data: { status: 'DELETED' } });
    const last = (await get({ limit: 1, after: first.nextCursor }).expect(200)).body;
    expect(last.items.map((r: { id: string }) => r.id)).toEqual([second.body.id]); expect(last.nextCursor).toBeNull();
    for (const after of [foreignLink, randomUUID()]) await get({ after }).expect(400);
  });
  it('uses existing upload/download and preserves file bytes when unlinking', async () => {
    const prefix = `/api/v1/organizations/${org}/files`; const bytes = Buffer.from('%PDF-1.7\nprivate PDF\n%%EOF');
    const uploaded = await http().post(prefix).set('Authorization', bearer()).attach('file', bytes, { filename: 'workflow.pdf', contentType: 'application/pdf' }).expect(201);
    const linked = await attach(uploaded.body.id).expect(201);
    const downloaded = await http().get(`${prefix}/${uploaded.body.id}/content`).set('Authorization', bearer()).expect(200);
    expect(downloaded.body).toEqual(bytes);
    await http().delete(`${base()}/attachments/${linked.body.id}`).set('Authorization', bearer()).expect(204);
    await http().get(`${prefix}/${uploaded.body.id}/content`).set('Authorization', bearer()).expect(200);
  });
  it.each(['comment', 'link', 'unlink', 'progress'] as const)('%s rolls back on audit failure', async (action) => {
    await db.taskAttachment.delete({ where: { id: link } });
    if (action === 'unlink') link = (await db.taskAttachment.create({ data: { organizationId: org, taskId: task, fileId: file, linkedByUserId: actor } })).id;
    const beforeTask = await db.task.findUniqueOrThrow({ where: { id: task } }); const links = await db.taskAttachment.count({ where: { organizationId: org } });
    jest.spyOn(app.get(AuditService), 'record').mockRejectedValue(new Error('sensitive simulated internal error'));
    await op(action).set('Authorization', bearer()).expect(500);
    expect(await db.task.findUniqueOrThrow({ where: { id: task } })).toEqual(beforeTask);
    expect(await db.taskComment.count({ where: { organizationId: org } })).toBe(0);
    expect(await db.taskAttachment.count({ where: { organizationId: org } })).toBe(links); expect(await events()).toHaveLength(0);
    expect(JSON.stringify(logs)).not.toContain('sensitive simulated internal error');
  });
  it.each(['comment', 'link', 'unlink', 'progress'] as const)('%s rechecks a grant revoked after the guard', async (action) => {
    const auth = app.get(AuthorizationService), original = auth.can.bind(auth);
    jest.spyOn(auth, 'can').mockImplementationOnce(async (...args) => { const allowed = await original(...args); await revoke('task:update'); return allowed; });
    await op(action).set('Authorization', bearer()).expect(403); expect(await events()).toHaveLength(0);
  });
  it('rechecks file availability inside the link transaction', async () => {
    const auth = app.get(AuthorizationService), original = auth.can.bind(auth);
    jest.spyOn(auth, 'can').mockImplementationOnce(async (...args) => { const allowed = await original(...args);
      await db.fileObject.update({ where: { id: file }, data: { status: 'DELETED' } }); return allowed; });
    await attach().expect(409); expect(await events()).toHaveLength(0);
  });
  it.each(['DONE', 'CANCELLED'] as const)('%s keeps collaboration mutations locked but reads available', async (status) => {
    await patch({ status }).expect(200);
    for (const action of ['comment', 'link', 'unlink'] as const) await op(action).set('Authorization', bearer()).expect(409);
    for (const action of ['comments', 'attachments'] as const) await op(action).set('Authorization', bearer()).expect(200);
  });
  it('tracks progress while preserving V1 status-only requests and no-op behavior', async () => {
    await patch({ status: 'IN_PROGRESS', progressPercent: 45 }).expect(200);
    const r = await patch({ progressPercent: 60 }).expect(200); expect(r.body.progressPercent).toBe(60);
    const count = (await events()).length;
    const noop = await patch({ progressPercent: 60 }).expect(200); expect(noop.body.updatedAt).toBe(r.body.updatedAt); expect(await events()).toHaveLength(count);
    expect((await patch({ status: 'TODO' }).expect(200)).body.progressPercent).toBe(0);
    expect((await patch({ status: 'DONE' }).expect(200)).body.progressPercent).toBe(100);
    await patch({ progressPercent: 99 }).expect(409);
    const updates = (await events()).filter((e) => e.event === 'task.updated');
    expect(updates.some((e) => JSON.stringify(e.metadata) === '{"changedFields":["progressPercent"]}')).toBe(true);
  });
  it.each([-1, 101, 1.5, '40', null, true])('rejects invalid progress %j', async (progressPercent) => {
    await patch({ status: 'IN_PROGRESS', progressPercent }).expect(400);
  });
  it.each([{ progressPercent: 1 }, { status: 'TODO', progressPercent: 20 }, { status: 'DONE', progressPercent: 99 },
    { status: 'IN_PROGRESS', progressPercent: 100 }, { status: 'CANCELLED', progressPercent: 100 }])('rejects inconsistent lifecycle/progress %j', async (body) => {
    await patch(body).expect(409); expect(await events()).toHaveLength(0);
  });
  it('progress does not imply assignment permission or grant it', async () => {
    await patch({ status: 'IN_PROGRESS', progressPercent: 20, assigneeEmployeeId: employee }).expect(403);
    await patch({ status: 'IN_PROGRESS', progressPercent: 20 }).expect(200);
    expect(await app.get(AuthorizationService).can(actor, 'task:assign', org)).toBe(false);
  });
  it('enforces tenant FKs, restrictive references and numeric range in MySQL', async () => {
    for (const data of [{ organizationId: org, taskId: foreignTask, authorUserId: actor, body: 'bad' },
      { organizationId: org, taskId: task, authorUserId: foreign, body: 'bad' }]) await expect(db.taskComment.create({ data })).rejects.toMatchObject({ code: 'P2003' });
    for (const data of [{ organizationId: org, taskId: foreignTask, fileId: file, linkedByUserId: actor },
      { organizationId: org, taskId: task, fileId: foreignFile, linkedByUserId: actor },
      { organizationId: org, taskId: otherTask, fileId: file, linkedByUserId: foreign }]) await expect(db.taskAttachment.create({ data })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.fileObject.delete({ where: { id: file } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.task.delete({ where: { id: task } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.$executeRaw`UPDATE tasks SET progress_percent = 101 WHERE id = ${task}`).rejects.toThrow();
  });
  it('OpenAPI exactly describes safe responses and read operations emit no audit', async () => {
    const c = (await comment().expect(201)).body, a = (await attach().expect(201)).body;
    const before = (await events()).length;
    const comments = (await http().get(`${base()}/comments`).set('Authorization', bearer()).expect(200)).body;
    const attachments = (await http().get(`${base()}/attachments`).set('Authorization', bearer()).expect(200)).body;
    expect(await events()).toHaveLength(before);
    const docs = (await http().get('/api/v1/docs/openapi.json').expect(200)).body;
    for (const [name, row] of [['TaskComment', c], ['TaskAttachment', a]] as const) {
      expect(Object.keys(row).sort()).toEqual(Object.keys(docs.components.schemas[name].properties).sort());
    }
    expect(Object.keys(a.file).sort()).toEqual(['contentType', 'id', 'originalFilename', 'size']);
    const routes = docs.paths; const template = '/organizations/{organizationId}/tasks/{taskId}';
    expect(routes[`${template}/attachments`].post['x-required-permissions']).toEqual(['task:update', 'file:read']);
    expect(docs.components.schemas.UpdateTask.properties.progressPercent.maximum).toBe(100);
    for (const value of [secret, token, 'passwordHash', 'private-fixture-hash', 'refreshToken', 'storageKey', 'storageProvider', 'authorMembership']) {
      expect(JSON.stringify({ c, a, comments, attachments, logs, events: await events() })).not.toContain(value);
    }
    expect(comments.items).toHaveLength(1); expect(attachments.items.map((r: { id: string }) => r.id)).toEqual([link]);
  });
  it('Files reference boundary returns only public task metadata', async () => {
    const row = await db.$transaction((tx) => app.get(FilesService).availableTaskReference(org, file, tx, actor));
    expect(Object.keys(row).sort()).toEqual(['contentType', 'id', 'originalFilename', 'size']);
  });
});

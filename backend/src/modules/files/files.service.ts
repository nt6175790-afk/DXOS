// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { fileVisibility } from './file-visibility';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { AuthorizationService } from '../rbac/authorization.service';
import { isOrganizationIdentifier, PERMISSIONS, PermissionKey } from '../rbac/permission-catalog';
import { StorageService, StoredUpload } from './storage.service';
import { validateFileMetadata, validateFileSignature } from './file-policy';
import type { FileListQueryDto } from './file-list.dto';
import { FileScannerService } from './file-scanner.service';

const publicFile = { id: true, organizationId: true, uploadedByUserId: true, originalFilename: true,
  contentType: true, size: true, checksum: true, status: true, createdAt: true, updatedAt: true } satisfies Prisma.FileObjectSelect;
export interface ReceivedFile { id: string; transfer: StoredUpload }
export const taskFileProjection = { id: true, originalFilename: true, contentType: true, size: true } satisfies Prisma.FileObjectSelect;

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService,
    private readonly audit: AuditService, private readonly storage: StorageService,
    private readonly scanner: FileScannerService) {}

  // Trusted Work reference query after task/file authorization in the caller's transaction.
  async availableTaskReference(organizationId: string, id: string, tx: Prisma.TransactionClient, actorId: string) {
    const row = await tx.fileObject.findFirst({ where: { organizationId, id, ...await fileVisibility(this.authorization, tx, actorId, organizationId) },
      select: { ...taskFileProjection, status: true } });
    if (!row) throw new NotFoundException();
    if (row.status !== 'AVAILABLE') throw new ConflictException();
    const { status, ...file } = row; void status;
    return file;
  }

  async receive(user: string, org: string, filename: string, contentType: string, stream: Readable): Promise<ReceivedFile> {
    validateFileMetadata(filename, contentType);
    const row = await this.transaction(async (tx) => {
      await this.allow(tx, user, org, PERMISSIONS.FILE_UPLOAD);
      return tx.fileObject.create({ data: { organizationId: org, uploadedByUserId: user,
        originalFilename: filename, contentType, storageProvider: this.storage.provider, storageKey: randomUUID(), createdAt: new Date() } });
    });
    try {
      const transfer = await this.storage.put(row.storageKey, stream);
      validateFileSignature(transfer.prefix, contentType);
      // Private bytes remain UPLOADING and cannot be downloaded until the scan succeeds.
      await this.scanner.scanStored(this.storage, row.storageKey);
      return { id: row.id, transfer };
    } catch (error) { await this.cleanupUpload(row.id); throw error; }
  }

  async finish(user: string, org: string, received?: ReceivedFile) {
    if (!received) throw new BadRequestException('File required');
    return this.transaction(async (tx) => {
      await this.allow(tx, user, org, PERMISSIONS.FILE_UPLOAD);
      const row = await tx.fileObject.findFirst({ where: { id: received.id, organizationId: org, uploadedByUserId: user, status: 'UPLOADING' } });
      if (!row) throw new ForbiddenException();
      const result = await tx.fileObject.update({ where: { id: row.id },
        data: { status: 'AVAILABLE', size: received.transfer.size, checksum: received.transfer.checksum }, select: publicFile });
      await this.audit.record({ event: AUDIT_EVENTS.FILE_UPLOADED, organizationId: org, actorUserId: user, resourceId: row.id }, tx);
      return result;
    });
  }

  // Internal compensation only. Run manually after a crash only when the original request has stopped.
  async cleanupUpload(id: string): Promise<void> {
    const row = await this.transaction(async (tx) => {
      const found = await tx.fileObject.findUnique({ where: { id } });
      if (!found || !['UPLOADING', 'FAILED'].includes(found.status)) return null;
      if (found.status === 'UPLOADING') await tx.fileObject.update({ where: { id }, data: { status: 'FAILED' } });
      return found;
    });
    // Delete only after the FAILED commit is acknowledged; an uncertain DB outcome leaves bytes safe for retry.
    if (row) {
      if (row.storageProvider !== this.storage.provider) throw new Error('Unsupported storage provider');
      await this.storage.delete(row.storageKey);
    }
  }

  async metadata(user: string, org: string, id: string) {
    return this.transaction(async (tx) => {
      await this.allow(tx, user, org, PERMISSIONS.FILE_READ);
      this.identifier(id);
      const row = await tx.fileObject.findFirst({ where: { id, organizationId: org, ...await fileVisibility(this.authorization, tx, user, org), status: 'AVAILABLE' }, select: publicFile });
      if (!row) throw new ForbiddenException();
      return row;
    });
  }

  async list(user: string, org: string, query: FileListQueryDto) {
    return this.transaction(async (tx) => {
      await this.allow(tx, user, org, PERMISSIONS.FILE_READ);
      const rows = await tx.fileObject.findMany({ where: { organizationId: org, ...await fileVisibility(this.authorization, tx, user, org), status: 'AVAILABLE',
        ...(query.after ? { id: { gt: query.after } } : {}) }, select: publicFile,
        orderBy: { id: 'asc' }, take: query.limit + 1 });
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
    });
  }

  async download(user: string, org: string, id: string) {
    const row = await this.transaction(async (tx) => {
      await this.allow(tx, user, org, PERMISSIONS.FILE_READ); this.identifier(id);
      const found = await tx.fileObject.findFirst({ where: { id, organizationId: org, ...await fileVisibility(this.authorization, tx, user, org), status: 'AVAILABLE' } });
      if (!found) throw new ForbiddenException();
      return found;
    });
    if (row.storageProvider !== this.storage.provider) throw new Error('Unsupported storage provider');
    const stream = await this.storage.get(row.storageKey);
    return { stream, contentType: row.contentType, filename: row.originalFilename, size: row.size! };
  }

  async remove(user: string, org: string, id: string) {
    return this.transaction(async (tx) => {
      await this.allow(tx, user, org, PERMISSIONS.FILE_DELETE); this.identifier(id);
      const row = await tx.fileObject.findFirst({ where: { id, organizationId: org, ...await fileVisibility(this.authorization, tx, user, org), status: { in: ['AVAILABLE', 'DELETED'] } } });
      if (!row) throw new ForbiddenException();
      if (row.status === 'AVAILABLE') {
        await tx.aiKnowledgeDocument.deleteMany({ where: { organizationId: org, fileId: id } });
        await tx.fileObject.update({ where: { id }, data: { status: 'DELETED' } });
        await this.audit.record({ event: AUDIT_EVENTS.FILE_DELETED, organizationId: org, actorUserId: user, resourceId: id }, tx);
      }
      return tx.fileObject.findUniqueOrThrow({ where: { id }, select: publicFile });
    });
  }

  private identifier(id: string) { if (!isOrganizationIdentifier(id)) throw new ForbiddenException(); }
  private async allow(tx: Prisma.TransactionClient, user: string, org: string, permission: PermissionKey) {
    if (!(await this.authorization.can(user, permission, org, tx))) throw new ForbiddenException();
  }
  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
}

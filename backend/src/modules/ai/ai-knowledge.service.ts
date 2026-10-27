// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS as P, isOrganizationIdentifier } from '../rbac/permission-catalog';
import { FilesService } from '../files/files.service';
import { PdfTextService } from './pdf-text.service';

@Injectable()
export class AiKnowledgeService {
  constructor(private readonly db: PrismaService, private readonly auth: AuthorizationService,
    private readonly files: FilesService, private readonly pdf: PdfTextService, private readonly audit: AuditService) {}
  private async allow(user: string, org: string, write = false, tx: Prisma.TransactionClient = this.db) {
    for (const key of [P.AI_USE, P.FILE_READ, ...(write ? [P.FILE_UPLOAD] : [])]) if (!await this.auth.can(user, key, org, tx)) throw new ForbiddenException();
  }
  private async source(user: string, org: string, fileId: string, tx: Prisma.TransactionClient = this.db) {
    if (!isOrganizationIdentifier(fileId)) throw new NotFoundException();
    // HR versions are deliberately excluded, including non-sensitive versions: no derived HR text leaks.
    const file = await tx.fileObject.findFirst({ where: { id: fileId, organizationId: org, status: 'AVAILABLE',
      contentType: 'application/pdf', documentVersions: { none: {} } } });
    if (!file?.checksum) throw new NotFoundException();
    return file;
  }
  async list(user: string, org: string) {
    await this.allow(user, org);
    const rows = await this.db.aiKnowledgeDocument.findMany({ where: { organizationId: org,
      file: { status: 'AVAILABLE', documentVersions: { none: {} } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 101,
      select: { id: true, fileId: true, sourceChecksum: true, createdAt: true, file: { select: { originalFilename: true, checksum: true } }, _count: { select: { chunks: true } } } });
    return { items: rows.filter(r => r.sourceChecksum === r.file.checksum).slice(0, 100).map(r => ({ fileId: r.fileId, filename: r.file.originalFilename, indexedAt: r.createdAt, chunks: r._count.chunks })), limit: 100 };
  }
  async index(user: string, org: string, fileId: string) {
    await this.allow(user, org, true); const file = await this.source(user, org, fileId);
    if (file.uploadedByUserId !== user && !await this.auth.can(user, P.FILE_DELETE, org)) throw new ForbiddenException();
    const download = await this.files.download(user, org, fileId);
    const parts: Buffer[] = []; let size = 0;
    for await (const part of download.stream) { const b = Buffer.isBuffer(part) ? part : Buffer.from(part as Uint8Array); size += b.length;
      if (size > 5 * 1024 * 1024) { download.stream.destroy(); throw new ConflictException('Tài liệu vượt giới hạn.'); } parts.push(b); }
    const chunks = await this.pdf.extract(Buffer.concat(parts));
    return this.db.$transaction(async tx => {
      await this.allow(user, org, true, tx); const current = await this.source(user, org, fileId, tx);
      if (current.checksum !== file.checksum) throw new ConflictException('Nguồn đã thay đổi.');
      if (current.uploadedByUserId !== user && !await this.auth.can(user, P.FILE_DELETE, org, tx)) throw new ForbiddenException();
      const existing = await tx.aiKnowledgeDocument.findUnique({ where: { organizationId_fileId: { organizationId: org, fileId } } });
      if (!existing && await tx.aiKnowledgeDocument.count({ where: { organizationId: org } }) >= 100) throw new ConflictException('Tối đa 100 PDF trong kho tri thức của tổ chức.');
      if (existing) await tx.aiKnowledgeDocument.delete({ where: { id: existing.id } });
      const document = await tx.aiKnowledgeDocument.create({ data: { organizationId: org, fileId, indexedByUserId: user, sourceChecksum: current.checksum! } });
      await tx.aiKnowledgeChunk.createMany({ data: chunks.map((c, ordinal) => ({ ...c, ordinal, organizationId: org, documentId: document.id })) });
      await this.audit.record({ event: AUDIT_EVENTS.AI_KNOWLEDGE_INDEXED, organizationId: org, actorUserId: user, resourceId: fileId }, tx);
      return { fileId, filename: current.originalFilename, chunks: chunks.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 });
  }
  async remove(user: string, org: string, fileId: string) {
    return this.db.$transaction(async tx => {
      await this.allow(user, org, true, tx);
      if (!isOrganizationIdentifier(fileId)) throw new NotFoundException();
      const file = await tx.fileObject.findFirst({ where: { organizationId: org, id: fileId } });
      if (!file) throw new NotFoundException();
      if (file.uploadedByUserId !== user && !await this.auth.can(user, P.FILE_DELETE, org, tx)) throw new ForbiddenException();
      await tx.aiKnowledgeDocument.deleteMany({ where: { organizationId: org, fileId } });
      await this.audit.record({ event: AUDIT_EVENTS.AI_KNOWLEDGE_REMOVED, organizationId: org, actorUserId: user, resourceId: fileId }, tx); return { removed: true };
    });
  }
  async search(user: string, org: string, query: string) {
    return this.db.$transaction(async tx => {
      await this.allow(user, org, false, tx);
      const terms = [...new Set(query.toLocaleLowerCase('vi').match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, 6);
      if (!terms.length) return { items: [] };
      // Bounded lexical retrieval; compare checksum and source visibility again before exposing any excerpt.
      const rows = await tx.aiKnowledgeChunk.findMany({ where: { organizationId: org, OR: terms.map(content => ({ content: { contains: content } })),
        document: { organizationId: org, file: { organizationId: org, status: 'AVAILABLE', documentVersions: { none: {} } } } },
        include: { document: { select: { sourceChecksum: true, file: { select: { id: true, checksum: true, originalFilename: true } } } } },
        orderBy: [{ documentId: 'asc' }, { ordinal: 'asc' }], take: 60 });
      const items = rows.filter(r => r.document.sourceChecksum === r.document.file.checksum)
        .map(r => ({ fileId: r.document.file.id, filename: r.document.file.originalFilename, page: r.page, excerpt: r.content,
          score: terms.filter(t => r.content.toLocaleLowerCase('vi').includes(t)).length }))
        .sort((a, b) => b.score - a.score || a.fileId.localeCompare(b.fileId) || a.page - b.page).slice(0, 5);
      return { items };
    });
  }
}

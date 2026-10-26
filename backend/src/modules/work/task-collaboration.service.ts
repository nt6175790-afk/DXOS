// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { fileVisibility } from '../files/file-visibility';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { FilesService, taskFileProjection } from '../files/files.service';
import { collaborationPermissions, type TaskCollaborationKind } from './task-policy';
import type { CreateTaskCommentDto, LinkTaskAttachmentDto, TaskCollaborationPageDto } from './task-collaboration.dto';

const commentProjection = { id: true, taskId: true, authorUserId: true, body: true, createdAt: true,
  authorMembership: { select: { employee: { select: { displayName: true } }, user: { select: { displayName: true } } } } } satisfies Prisma.TaskCommentSelect;
const attachmentProjection = { id: true, taskId: true, linkedByUserId: true, createdAt: true,
  file: { select: taskFileProjection } } satisfies Prisma.TaskAttachmentSelect;
type CommentRow = Prisma.TaskCommentGetPayload<{ select: typeof commentProjection }>;
const commentResponse = ({ authorMembership, ...row }: CommentRow) => ({ ...row,
  authorDisplayName: authorMembership.employee?.displayName ?? authorMembership.user.displayName });
const page = <T extends { id: string }>(rows: T[], limit: number) => {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
};
const boundary = (cursor: { createdAt: Date; id: string } | null) => cursor ? { OR: [
  { createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } },
] } : {};
const chronology = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

@Injectable()
export class TaskCollaborationService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService,
    private readonly audit: AuditService, private readonly files: FilesService) {}

  addComment(actorId: string, organizationId: string, taskId: string, input: CreateTaskCommentDto) {
    return this.transaction(actorId, organizationId, 'POST', 'comments', async (tx) => {
      await this.task(tx, organizationId, taskId, true);
      const row = await tx.taskComment.create({ data: { organizationId, taskId, authorUserId: actorId, body: input.body }, select: commentProjection });
      await this.audit.record({ event: AUDIT_EVENTS.TASK_COMMENT_ADDED, organizationId, actorUserId: actorId, resourceId: row.id }, tx);
      return commentResponse(row);
    });
  }

  listComments(actorId: string, organizationId: string, taskId: string, query: TaskCollaborationPageDto) {
    return this.transaction(actorId, organizationId, 'GET', 'comments', async (tx) => {
      await this.task(tx, organizationId, taskId);
      const scope = { organizationId, taskId };
      const cursor = query.after ? await tx.taskComment.findFirst({ where: { ...scope, id: query.after }, select: { id: true, createdAt: true } }) : null;
      if (query.after && !cursor) throw new BadRequestException();
      const rows = await tx.taskComment.findMany({ where: { ...scope, ...boundary(cursor) },
        select: commentProjection, orderBy: [...chronology], take: query.limit + 1 });
      return page(rows.map(commentResponse), query.limit);
    });
  }

  linkAttachment(actorId: string, organizationId: string, taskId: string, input: LinkTaskAttachmentDto) {
    return this.transaction(actorId, organizationId, 'POST', 'attachments', async (tx) => {
      await this.task(tx, organizationId, taskId, true);
      await this.files.availableTaskReference(organizationId, input.fileId, tx, actorId);
      const existing = await tx.taskAttachment.findUnique({ where: { organizationId_taskId_fileId: {
        organizationId, taskId, fileId: input.fileId } }, select: attachmentProjection });
      if (existing) return existing;
      const row = await tx.taskAttachment.create({ data: { organizationId, taskId, fileId: input.fileId, linkedByUserId: actorId }, select: attachmentProjection });
      await this.audit.record({ event: AUDIT_EVENTS.TASK_ATTACHMENT_LINKED, organizationId, actorUserId: actorId, resourceId: row.id }, tx);
      return row;
    });
  }

  listAttachments(actorId: string, organizationId: string, taskId: string, query: TaskCollaborationPageDto) {
    return this.transaction(actorId, organizationId, 'GET', 'attachments', async (tx) => {
      await this.task(tx, organizationId, taskId);
      const scope = { organizationId, taskId };
      // Resolve the cursor even if its file was soft-deleted, so paging can continue.
      const cursor = query.after ? await tx.taskAttachment.findFirst({ where: { ...scope, id: query.after }, select: { id: true, createdAt: true } }) : null;
      if (query.after && !cursor) throw new BadRequestException();
      const rows = await tx.taskAttachment.findMany({ where: { ...scope, ...boundary(cursor), file: { organizationId, status: 'AVAILABLE', ...await fileVisibility(this.authorization, tx, actorId, organizationId) } },
        select: attachmentProjection, orderBy: [...chronology], take: query.limit + 1 });
      return page(rows, query.limit);
    });
  }

  unlinkAttachment(actorId: string, organizationId: string, taskId: string, attachmentId: string): Promise<void> {
    return this.transaction(actorId, organizationId, 'DELETE', 'attachments', async (tx) => {
      await this.task(tx, organizationId, taskId, true);
      const row = await tx.taskAttachment.findFirst({ where: { id: attachmentId, organizationId, taskId }, select: { id: true } });
      if (!row) throw new NotFoundException();
      await tx.taskAttachment.delete({ where: { id: row.id, organizationId, taskId } });
      await this.audit.record({ event: AUDIT_EVENTS.TASK_ATTACHMENT_UNLINKED, organizationId, actorUserId: actorId, resourceId: row.id }, tx);
    });
  }

  private async task(tx: Prisma.TransactionClient, organizationId: string, id: string, write = false) {
    const row = await tx.task.findUnique({ where: { organizationId_id: { organizationId, id } }, select: { status: true } });
    if (!row) throw new NotFoundException();
    if (write && (row.status === 'DONE' || row.status === 'CANCELLED')) throw new ConflictException();
  }

  private async transaction<T>(actorId: string, organizationId: string, method: string, kind: TaskCollaborationKind,
    operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          for (const permission of collaborationPermissions(method, kind)) {
            if (!(await this.authorization.can(actorId, permission, organizationId, tx))) throw new ForbiddenException();
          }
          return operation(tx);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2034', 'P2002'].includes(error.code)) throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
}

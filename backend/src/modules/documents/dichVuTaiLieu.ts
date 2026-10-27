// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentSensitivity,
  DocumentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { fileVisibility } from '../files/file-visibility';
import { StorageService } from '../files/storage.service';
import {
  CreateDocumentDto,
  CreateDocumentVersionDto,
  DocumentQueryDto,
  UpdateDocumentDto,
} from './documents.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private async canAccessSensitive(userId: string, orgId: string, tx: Prisma.TransactionClient): Promise<boolean> {
    return this.authorization.can(userId, PERMISSIONS.DOCUMENT_SENSITIVE_READ, orgId, tx);
  }

  private async assertActiveMember(userId: string, orgId: string, tx: Prisma.TransactionClient) {
    if (!(await this.authorization.isActiveMember(userId, orgId, tx))) throw new ForbiddenException();
  }

  private async getCallerEmployee(userId: string, orgId: string, tx: Prisma.TransactionClient) {
    return tx.employee.findFirst({
      where: { organizationId: orgId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
  }

  private async assertSensitiveMutation(userId: string, orgId: string, doc: { employeeId: string; sensitivity: string }, tx: Prisma.TransactionClient) {
    if (doc.sensitivity !== 'SENSITIVE') return;
    const owner = await this.getCallerEmployee(userId, orgId, tx);
    if (owner?.id !== doc.employeeId && !(await this.canAccessSensitive(userId, orgId, tx))) throw new ForbiddenException();
  }
  async list(userId: string, orgId: string, query: DocumentQueryDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveMember(userId, orgId, tx);
      const canRead = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx);
      const callerEmp = await this.getCallerEmployee(userId, orgId, tx);

      if (!canRead && !callerEmp) {
        throw new ForbiddenException();
      }

      const hasSensitiveAccess = await this.canAccessSensitive(userId, orgId, tx);

      // Where conditions
      const where: Prisma.EmployeeDocumentWhereInput = {
        organizationId: orgId,
        deletedAt: null,
      };

      // If user does not have general document:read, they can only view their own documents
      if (!canRead && callerEmp) {
        where.employeeId = callerEmp.id;
      } else if (query.employeeId) {
        where.employeeId = query.employeeId;
      }

      if (query.category) {
        where.category = query.category;
      }

      if (query.status) {
        where.status = query.status;
      }

      // Sensitivity filter: if caller lacks sensitive read, only show NORMAL or own documents
      if (query.sensitivity) {
        if (query.sensitivity === DocumentSensitivity.SENSITIVE && !hasSensitiveAccess) {
          if (!callerEmp || (where.employeeId && where.employeeId !== callerEmp.id)) {
            throw new ForbiddenException('Lacks permission to view sensitive documents');
          }
          where.employeeId = callerEmp.id;
        }
        where.sensitivity = query.sensitivity;
      } else if (!hasSensitiveAccess) {
        if (callerEmp) {
          where.OR = [
            { sensitivity: DocumentSensitivity.NORMAL },
            { employeeId: callerEmp.id },
          ];
        } else {
          where.sensitivity = DocumentSensitivity.NORMAL;
        }
      }

      // Expiring soon filter (within 30 days and not yet expired)
      if (query.expiringSoon) {
        const now = new Date();
        const in30Days = new Date();
        in30Days.setDate(in30Days.getDate() + 30);
        where.expiryDate = {
          gte: now,
          lte: in30Days,
        };
        where.status = DocumentStatus.ACTIVE;
      }

      // Search filter
      if (query.search) {
        const term = query.search;
        where.AND = [
          {
            OR: [
              { title: { contains: term } },
              { documentNumber: { contains: term } },
              {
                employee: {
                  displayName: { contains: term },
                },
              },
              {
                employee: {
                  employeeCode: { contains: term },
                },
              },
            ],
          },
        ];
      }

      const take = query.limit ?? 20;
      const documents = await tx.employeeDocument.findMany({
        where,
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
              departmentId: true,
              department: {
                select: { id: true, name: true, code: true },
              },
            },
          },
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              fileName: true,
              fileSize: true,
              contentType: true,
              createdAt: true,
              uploadedByUserId: true,
            },
          },
        },
      });

      const hasNext = documents.length > take;
      const items = hasNext ? documents.slice(0, take) : documents;
      const nextCursor = hasNext ? items[items.length - 1].id : null;

      return {
        items,
        nextCursor,
        total: items.length,
      };
    });
  }

  async getById(userId: string, orgId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveMember(userId, orgId, tx);
      const doc = await tx.employeeDocument.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
              departmentId: true,
              department: {
                select: { id: true, name: true, code: true },
              },
            },
          },
          versions: {
            orderBy: { versionNumber: 'desc' },
            select: {
              id: true,
              versionNumber: true,
              fileName: true,
              fileSize: true,
              contentType: true,
              checksum: true,
              changeSummary: true,
              uploadedByUserId: true,
              createdAt: true,
              fileId: true,
            },
          },
        },
      });

      if (!doc) throw new NotFoundException('Document not found');
      await this.assertSensitiveMutation(userId, orgId, doc, tx);

      const canRead = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx);
      const callerEmp = await this.getCallerEmployee(userId, orgId, tx);
      const isOwner = callerEmp && callerEmp.id === doc.employeeId;

      if (!canRead && !isOwner) {
        throw new ForbiddenException();
      }

      if (doc.sensitivity === DocumentSensitivity.SENSITIVE) {
        const canSensitive = await this.canAccessSensitive(userId, orgId, tx);
        if (!canSensitive && !isOwner) {
          throw new ForbiddenException('Lacks permission to view sensitive document');
        }
      }

      return doc;
    });
  }

  async create(userId: string, orgId: string, dto: CreateDocumentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveMember(userId, orgId, tx);
      const canCreate = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_CREATE, orgId, tx);
      const callerEmp = await this.getCallerEmployee(userId, orgId, tx);
      const isSelf = callerEmp && callerEmp.id === dto.employeeId;

      if (!canCreate && !isSelf) {
        throw new ForbiddenException('Lacks permission to create document');
      }

      // Check employee exists
      const employee = await tx.employee.findFirst({
        where: { id: dto.employeeId, organizationId: orgId, status: 'ACTIVE' },
      });
      if (!employee) throw new BadRequestException('Employee not found or inactive');

      // Check file exists in AVAILABLE state
      const file = await tx.fileObject.findFirst({
        where: { id: dto.fileId, organizationId: orgId, status: 'AVAILABLE', ...await fileVisibility(this.authorization, tx, userId, orgId) },
      });
      if (!file) throw new BadRequestException('File not found or not available');

      const document = await tx.employeeDocument.create({
        data: {
          organizationId: orgId,
          employeeId: dto.employeeId,
          title: dto.title,
          documentNumber: dto.documentNumber,
          category: dto.category,
          sensitivity: dto.sensitivity ?? DocumentSensitivity.NORMAL,
          status: DocumentStatus.ACTIVE,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          notes: dto.notes,
        },
      });

      const version = await tx.documentVersion.create({
        data: {
          organizationId: orgId,
          documentId: document.id,
          versionNumber: 1,
          fileId: file.id,
          fileName: file.originalFilename,
          fileSize: file.size ?? 0,
          contentType: file.contentType,
          checksum: file.checksum,
          changeSummary: dto.changeSummary || 'Phiên bản ban đầu',
          uploadedByUserId: userId,
        },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_UPLOADED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: document.id,
        },
        tx,
      );

      return {
        ...document,
        versions: [version],
      };
    });
  }

  async createVersion(userId: string, orgId: string, id: string, dto: CreateDocumentVersionDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveMember(userId, orgId, tx);
      const doc = await tx.employeeDocument.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
      });
      if (!doc) throw new NotFoundException('Document not found');
      await this.assertSensitiveMutation(userId, orgId, doc, tx);

      const canUpdate = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_UPDATE, orgId, tx);
      const callerEmp = await this.getCallerEmployee(userId, orgId, tx);
      const isOwner = callerEmp && callerEmp.id === doc.employeeId;

      if (!canUpdate && !isOwner) {
        throw new ForbiddenException();
      }

      const file = await tx.fileObject.findFirst({
        where: { id: dto.fileId, organizationId: orgId, status: 'AVAILABLE', ...await fileVisibility(this.authorization, tx, userId, orgId) },
      });
      if (!file) throw new BadRequestException('File not found or not available');

      const lastVersion = await tx.documentVersion.findFirst({
        where: { documentId: doc.id },
        orderBy: { versionNumber: 'desc' },
      });

      const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;

      const version = await tx.documentVersion.create({
        data: {
          organizationId: orgId,
          documentId: doc.id,
          versionNumber: nextVersionNumber,
          fileId: file.id,
          fileName: file.originalFilename,
          fileSize: file.size ?? 0,
          contentType: file.contentType,
          checksum: file.checksum,
          changeSummary: dto.changeSummary || `Cập nhật phiên bản v${nextVersionNumber}`,
          uploadedByUserId: userId,
        },
      });

      await tx.employeeDocument.update({
        where: { id: doc.id },
        data: { updatedAt: new Date() },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_VERSION_CREATED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: version.id,
        },
        tx,
      );

      return version;
    });
  }

  async update(userId: string, orgId: string, id: string, dto: UpdateDocumentDto) {
    return this.prisma.$transaction(async (tx) => {
      return this.updateInTransaction(userId, orgId, id, dto, tx);
    });
  }
  async updateInTransaction(userId: string, orgId: string, id: string, dto: UpdateDocumentDto, tx: Prisma.TransactionClient) {
      await this.assertActiveMember(userId, orgId, tx);
      const canUpdate = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_UPDATE, orgId, tx);
      if (!canUpdate) throw new ForbiddenException();

      const doc = await tx.employeeDocument.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
      });
      if (!doc) throw new NotFoundException('Document not found');
      await this.assertSensitiveMutation(userId, orgId, doc, tx);

      const updated = await tx.employeeDocument.update({
        where: { id: doc.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.documentNumber !== undefined ? { documentNumber: dto.documentNumber } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.sensitivity !== undefined ? { sensitivity: dto.sensitivity } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.issueDate !== undefined ? { issueDate: dto.issueDate ? new Date(dto.issueDate) : null } : {}),
          ...(dto.expiryDate !== undefined ? { expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_UPDATED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: doc.id,
        },
        tx,
      );

      return updated;
  }

  async archive(userId: string, orgId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveMember(userId, orgId, tx);
      const canUpdate = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_UPDATE, orgId, tx);
      if (!canUpdate) throw new ForbiddenException();

      const doc = await tx.employeeDocument.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
      });
      if (!doc) throw new NotFoundException('Document not found');
      await this.assertSensitiveMutation(userId, orgId, doc, tx);

      const updated = await tx.employeeDocument.update({
        where: { id: doc.id },
        data: { status: DocumentStatus.ARCHIVED },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_ARCHIVED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: doc.id,
        },
        tx,
      );

      return updated;
    });
  }

  async restore(userId: string, orgId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveMember(userId, orgId, tx);
      const canUpdate = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_UPDATE, orgId, tx);
      if (!canUpdate) throw new ForbiddenException();

      const doc = await tx.employeeDocument.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
      });
      if (!doc) throw new NotFoundException('Document not found');
      await this.assertSensitiveMutation(userId, orgId, doc, tx);

      const updated = await tx.employeeDocument.update({
        where: { id: doc.id },
        data: { status: DocumentStatus.ACTIVE },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_RESTORED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: doc.id,
        },
        tx,
      );

      return updated;
    });
  }

  async remove(userId: string, orgId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveMember(userId, orgId, tx);
      const canDelete = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_DELETE, orgId, tx);
      if (!canDelete) throw new ForbiddenException();

      const doc = await tx.employeeDocument.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
      });
      if (!doc) throw new NotFoundException('Document not found');
      await this.assertSensitiveMutation(userId, orgId, doc, tx);

      await tx.employeeDocument.update({
        where: { id: doc.id },
        data: { deletedAt: new Date() },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_DELETED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: doc.id,
        },
        tx,
      );

      return { success: true };
    });
  }

  async download(userId: string, orgId: string, documentId: string, versionId?: string) {
    const { version, file } = await this.prisma.$transaction(async (tx) => {
      await this.assertActiveMember(userId, orgId, tx);
      const document = await tx.employeeDocument.findFirst({
        where: { id: documentId, organizationId: orgId, deletedAt: null },
      });
      if (!document) throw new NotFoundException('Document not found');

      const canRead = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx);
      const canDownload = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_DOWNLOAD, orgId, tx);
      const callerEmp = await this.getCallerEmployee(userId, orgId, tx);
      const isOwner = callerEmp && callerEmp.id === document.employeeId;

      if (!canDownload && !canRead && !isOwner) {
        throw new ForbiddenException();
      }

      if (document.sensitivity === DocumentSensitivity.SENSITIVE) {
        const canSensitive = await this.canAccessSensitive(userId, orgId, tx);
        if (!canSensitive && !isOwner) {
          throw new ForbiddenException('Lacks permission to download sensitive document');
        }
      }

      let targetVersion;
      if (versionId) {
        targetVersion = await tx.documentVersion.findFirst({
          where: { id: versionId, documentId: document.id, organizationId: orgId },
        });
      } else {
        targetVersion = await tx.documentVersion.findFirst({
          where: { documentId: document.id, organizationId: orgId },
          orderBy: { versionNumber: 'desc' },
        });
      }
      if (!targetVersion) throw new NotFoundException('Version not found');

      const fileObj = await tx.fileObject.findFirst({
        where: { id: targetVersion.fileId, organizationId: orgId, status: 'AVAILABLE' },
      });
      if (!fileObj) throw new NotFoundException('Underlying file object not found');

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_DOWNLOADED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: document.id,
        },
        tx,
      );

      return { doc: document, version: targetVersion, file: fileObj };
    });

    if (file.storageProvider !== this.storage.provider) {
      throw new Error('Unsupported storage provider');
    }

    const stream = await this.storage.get(file.storageKey);
    return {
      stream,
      filename: version.fileName,
      contentType: version.contentType,
      size: version.fileSize,
    };
  }
}

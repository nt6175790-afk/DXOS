// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { AuditSource, type Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { currentRequest, isValidRequestId } from '../../common/http/request-context';
import { isOrganizationIdentifier, isPermissionKey, type PermissionKey } from '../rbac/permission-catalog';
import { AUDIT_DESCRIPTORS, AUDIT_EVENT_NAMES, AUDIT_EVENTS, type AuditEventName } from './audit-catalog';

export interface AuditInput {
  event: AuditEventName;
  organizationId?: string;
  actorUserId?: string;
  resourceId?: string;
  metadata?: {
    reason?: 'INVALID_CREDENTIALS' | 'ACCOUNT_INACTIVE' | 'ACCOUNT_SUSPENDED' | 'PERMISSION_DENIED';
    permission?: PermissionKey;
    changedFields?: ('name' | 'description' | 'status' | 'displayName' | 'jobTitle' | 'phone' | 'departmentId' | 'title' | 'priority' | 'dueAt' | 'assigneeEmployeeId' | 'progressPercent')[];
  };
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, database: Pick<Prisma.TransactionClient, 'auditEvent'> = this.prisma): Promise<void> {
    const invalid = () => { throw new Error('Invalid audit event input.'); };
    if (!input || !AUDIT_EVENT_NAMES.includes(input.event) ||
      Object.keys(input).some((key) => !['event', 'organizationId', 'actorUserId', 'resourceId', 'metadata'].includes(key))) invalid();
    const descriptor = AUDIT_DESCRIPTORS[input.event];
    for (const value of [input.organizationId, input.actorUserId, input.resourceId]) {
      if (value !== undefined && !isOrganizationIdentifier(value)) invalid();
    }
    if (descriptor.tenant !== Boolean(input.organizationId)) invalid();
    const context = currentRequest.getStore();
    if (context?.actorUserId && input.actorUserId && context.actorUserId !== input.actorUserId) invalid();
    if (context && !isValidRequestId(context.requestId)) invalid();
    const metadata = input.metadata ?? {};
    if ([AUDIT_EVENTS.REPORT_EXPORTED, AUDIT_EVENTS.TASK_COMMENT_ADDED, AUDIT_EVENTS.TASK_ATTACHMENT_LINKED, AUDIT_EVENTS.TASK_ATTACHMENT_UNLINKED,
      AUDIT_EVENTS.TASK_CHECKLIST_ADDED, AUDIT_EVENTS.TASK_CHECKLIST_UPDATED, AUDIT_EVENTS.TASK_CHECKLIST_REMOVED,
      AUDIT_EVENTS.TASK_REVIEWER_CHANGED, AUDIT_EVENTS.CALENDAR_EVENT_CREATED, AUDIT_EVENTS.CALENDAR_EVENT_UPDATED]
      .some((event) => event === input.event) && Object.keys(metadata).length) invalid();
    if (typeof metadata !== 'object' || Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024 || Array.isArray(metadata) ||
      Object.keys(metadata).some((key) => !['reason', 'permission', 'changedFields'].includes(key))) invalid();
    if (metadata.reason !== undefined && !['INVALID_CREDENTIALS', 'ACCOUNT_INACTIVE', 'ACCOUNT_SUSPENDED', 'PERMISSION_DENIED'].includes(metadata.reason)) invalid();
    if (metadata.permission !== undefined && !isPermissionKey(metadata.permission)) invalid();
    if (metadata.changedFields !== undefined) {
      const fields = metadata.changedFields;
      const allowed = input.event === AUDIT_EVENTS.TASK_UPDATED ? ['title', 'description', 'assigneeEmployeeId', 'departmentId', 'status', 'priority', 'dueAt', 'progressPercent']
        : input.event === AUDIT_EVENTS.TASK_ASSIGNED ? ['assigneeEmployeeId']
        : input.event === AUDIT_EVENTS.TASK_STATUS_CHANGED ? ['status']
        : input.event === AUDIT_EVENTS.EMPLOYEE_UPDATED ? ['displayName', 'jobTitle', 'phone', 'departmentId', 'status']
        : input.event === AUDIT_EVENTS.DEPARTMENT_UPDATED ? ['name', 'description', 'status'] : ['name'];
      if (!Array.isArray(fields) || fields.length < 1 || fields.length > allowed.length || new Set(fields).size !== fields.length ||
        fields.some((field) => !allowed.includes(field))) invalid();
    }
    await database.auditEvent.create({ data: {
      event: input.event, organizationId: input.organizationId ?? null,
      actorUserId: context?.actorUserId ?? input.actorUserId ?? null,
      resourceType: descriptor.resourceType, resourceId: input.resourceId ?? null,
      outcome: descriptor.outcome, source: context ? AuditSource.HTTP : AuditSource.SYSTEM,
      requestId: context?.requestId ?? null, metadata, createdAt: new Date(),
    } });
  }
}

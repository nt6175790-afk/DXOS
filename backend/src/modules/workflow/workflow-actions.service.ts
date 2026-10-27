// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TasksService } from '../work/tasks.service';
import { CreateTaskDto } from '../work/task.dto';
import { DocumentsService } from '../documents/documents.service';
import { isOrganizationIdentifier } from '../rbac/permission-catalog';
export function workflowObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try { const result: unknown = JSON.parse(value); if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, unknown>; } catch { /* no raw payload in error */ }
  throw new BadRequestException('Workflow input must be an object');
}
@Injectable()
export class WorkflowActionsService {
  constructor(private readonly tasks: TasksService, private readonly documents: DocumentsService) {}
  async execute(tx: Prisma.TransactionClient, actor: string, org: string,
    instance: { id: string; title: string; data: string | null; entityId: string | null },
    step: { stepIndex: number; stepType: string; actionPayload: string | null }, triggerType: string) {
    if (!isOrganizationIdentifier(actor)) throw new ForbiddenException('An authenticated operator must perform business writes');
    const payload = workflowObject(step.actionPayload), data = workflowObject(instance.data);
    const action = payload.action ?? (step.stepType === 'TASK' ? 'CREATE_TASK' : triggerType === 'CONTRACT_RENEWAL' ? 'RENEW_CONTRACT' : triggerType === 'MISSING_DOCUMENT' ? 'ACTIVATE_DOCUMENT' : null);
    if (action === 'CREATE_TASK') {
      const raw = data.task ?? payload.task ?? { title: instance.title };
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Task input required');
      const input = plainToInstance(CreateTaskDto, raw);
      if (validateSync(input, { whitelist: true, forbidNonWhitelisted: true }).length) throw new BadRequestException('Invalid task input');
      const task = await this.tasks.createInTransaction(actor, org, input, tx);
      return { action, taskId: task.id };
    }
    if (action !== 'RENEW_CONTRACT' && action !== 'ACTIVATE_DOCUMENT') throw new BadRequestException('Unsupported workflow action');
    if (!await tx.workflowStepExecution.findFirst({ where: { organizationId: org, workflowInstanceId: instance.id,
      stepType: 'HUMAN_CONFIRMATION', status: 'COMPLETED', stepIndex: { lt: step.stepIndex } }, select: { id: true } })) throw new ForbiddenException('Document writes require an earlier human confirmation');
    const documentId = data.documentId ?? instance.entityId;
    if (!isOrganizationIdentifier(documentId)) throw new BadRequestException('Choose a document');
    const document = await tx.employeeDocument.findFirst({ where: { id: documentId, organizationId: org, deletedAt: null }, select: { id: true, category: true, expiryDate: true, status: true } });
    if (!document) throw new NotFoundException();
    let expiryDate: string | undefined;
    if (action === 'RENEW_CONTRACT') {
      if (document.category !== 'LABOR_CONTRACT' || typeof data.newExpiryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.newExpiryDate)) throw new BadRequestException('Choose a contract and new expiry date');
      const expiry = new Date(data.newExpiryDate + 'T00:00:00Z');
      if (!Number.isFinite(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== data.newExpiryDate || expiry.getTime() <= Date.now() || (document.expiryDate && expiry <= document.expiryDate)) throw new BadRequestException('New expiry must extend the contract into the future');
      expiryDate = data.newExpiryDate;
    } else if (document.expiryDate && document.expiryDate < new Date()) throw new BadRequestException('Expired documents must be renewed before activation');
    const updated = await this.documents.updateInTransaction(actor, org, document.id, { status: 'ACTIVE', ...(expiryDate ? { expiryDate } : {}) }, tx);
    return { action, documentId: updated.id, status: updated.status, expiryDate: updated.expiryDate?.toISOString().slice(0, 10) ?? null };
  }
}

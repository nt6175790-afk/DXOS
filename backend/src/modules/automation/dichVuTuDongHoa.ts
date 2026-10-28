// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { isOrganizationIdentifier, PERMISSIONS } from '../rbac/permission-catalog';
import { AuthorizationService } from '../rbac/authorization.service';
import { NotificationService } from '../notifications/notification.service';
import { NOTIFICATION_TYPES } from '../notifications/notification-catalog';
import { WorkflowService } from '../workflow/workflow.service';
import {
  AUTOMATION_ACTION_TYPES,
  type AutomationAction,
  type AutomationCondition,
  type TriggerEventContext,
} from './automation.types';

@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger(AutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly workflows: WorkflowService,
    private readonly authorization: AuthorizationService,
  ) {}

  async dispatchTrigger(event: TriggerEventContext, actorId = 'system') {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        organizationId: event.organizationId,
        trigger: event.trigger,
        isActive: true,
      },
    });

    const results = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const rule of rules) {
      const idempotencyKey = `${event.organizationId}:${rule.id}:${event.entityType}:${event.entityId}:${today}`;
      const executionId = randomUUID();
      try {
        const result = await this.transaction(async tx => {
          if (!(await this.lockRule(tx, event, actorId, rule.id))) return null;
          const current = await tx.automationRule.findFirstOrThrow({ where: { id: rule.id, organizationId: event.organizationId } });
          if (!current.isActive || current.trigger !== event.trigger) return null;
          const existing = await tx.automationExecution.findFirst({ where: { organizationId: event.organizationId, automationRuleId: rule.id, idempotencyKey } });
          if (existing) return { ruleId: rule.id, status: 'SKIPPED_IDEMPOTENT', idempotencyKey };

          const conditions = JSON.parse(current.conditions || '[]') as AutomationCondition[];
          if (!this.evaluateConditions(conditions, event.data)) return null;
          const actions = JSON.parse(current.actions || '[]') as AutomationAction[];
          for (const action of actions) await this.executeSafeAction(action, event, actorId, rule.id, tx);
          await tx.automationExecution.create({ data: {
            id: executionId, organizationId: event.organizationId, automationRuleId: rule.id,
            event: event.trigger, entityType: event.entityType, entityId: event.entityId,
            status: 'SUCCESS', idempotencyKey,
            metadata: JSON.stringify({ actionsExecuted: actions.length, eventData: event.data }), completedAt: new Date(),
          } });
          await tx.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
          await this.audit.record({ event: AUDIT_EVENTS.AUTOMATION_EXECUTED, organizationId: event.organizationId,
            actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined, resourceId: executionId }, tx);
          return { ruleId: rule.id, executionId, status: 'SUCCESS' };
        });
        if (result) results.push(result);
      } catch (error: unknown) {
        // The action transaction has rolled back. Never log provider/input data.
        this.logger.error(`Automation rule ${rule.id} failed`, { errorType: error instanceof Error ? error.name : 'UnknownError' });
        const result = await this.transaction(async tx => {
          if (!(await this.lockRule(tx, event, actorId, rule.id))) return null;
          const existing = await tx.automationExecution.findFirst({ where: { organizationId: event.organizationId, automationRuleId: rule.id, idempotencyKey } });
          if (existing) return { ruleId: rule.id, status: 'SKIPPED_IDEMPOTENT', idempotencyKey };
          await tx.automationExecution.create({ data: {
            id: executionId, organizationId: event.organizationId, automationRuleId: rule.id,
            event: event.trigger, entityType: event.entityType, entityId: event.entityId,
            status: 'FAILED', idempotencyKey, error: 'Automation action failed.',
            metadata: JSON.stringify({ eventData: event.data }), completedAt: new Date(),
          } });
          await this.audit.record({ event: AUDIT_EVENTS.AUTOMATION_FAILED, organizationId: event.organizationId,
            actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined, resourceId: executionId }, tx);
          return { ruleId: rule.id, executionId, status: 'FAILED', error: 'Automation action failed.' };
        });
        if (result) results.push(result);
      }
    }
    return results;
  }

  private async lockRule(tx: Prisma.TransactionClient, event: TriggerEventContext, actorId: string, ruleId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM automation_rules WHERE id = ${ruleId} AND organization_id = ${event.organizationId} FOR UPDATE`;
    if (!rows.length) return false;
    if (actorId !== 'system' && !(await this.authorization.can(actorId, PERMISSIONS.AUTOMATION_MANAGE, event.organizationId, tx))) throw new ForbiddenException();
    return true;
  }

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        // The explicit rule lock protects the read/check/write sequence across workers.
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error;
      }
    }
  }

  private async executeSafeAction(
    action: AutomationAction,
    event: TriggerEventContext,
    actorId: string,
    ruleId: string,
    tx: Prisma.TransactionClient,
  ) {
    switch (action.type) {
      case AUTOMATION_ACTION_TYPES.CREATE_NOTIFICATION:
      case AUTOMATION_ACTION_TYPES.SEND_REMINDER: {
        const title = action.params?.title || `Quy tắc tự động [${event.trigger}]`;
        const body = action.params?.message || `Hệ thống ghi nhận sự kiện đối với ${event.entityType} (ID: ${event.entityId}).`;

        // Get an active admin user or use the actor
        const adminMember = await tx.organizationMembership.findFirst({
          where: { organizationId: event.organizationId, status: 'ACTIVE' },
          select: { userId: true },
        });
        const recipientUserId = adminMember?.userId || (isOrganizationIdentifier(actorId) ? actorId : null);

        if (recipientUserId) {
          await this.notifications.createForRecipient({
            organizationId: event.organizationId,
            recipientUserId,
            type: NOTIFICATION_TYPES.AUTOMATION_TRIGGERED,
            metadata: {
              title,
              message: body,
              ruleId,
            },
          }, tx);
        }
        break;
      }

      case AUTOMATION_ACTION_TYPES.TRIGGER_WORKFLOW: {
        const triggerType = action.params?.triggerType || 'CONTRACT_RENEWAL';
        let definition = await tx.workflowDefinition.findFirst({
          where: { organizationId: event.organizationId, triggerType },
        });

        if (!definition) {
          await this.workflows.ensureDefaultDefinitions(event.organizationId, actorId, tx);
          definition = await tx.workflowDefinition.findFirst({
            where: { organizationId: event.organizationId, triggerType },
          });
        }

        if (!definition) throw new BadRequestException('Automation workflow definition is unavailable');
        const docTitle = event.data?.title || event.data?.documentTitle || 'Hợp đồng lao động';
        const employeeName = event.data?.employeeName || 'Nhân sự';
        await this.workflows.startWorkflow(actorId, event.organizationId, {
          workflowDefinitionId: definition.id,
          title: `[Tự động] ${definition.name} - ${employeeName} (${docTitle})`,
          entityType: event.entityType,
          entityId: event.entityId,
          data: event.data,
        }, tx);
        break;
      }

      case AUTOMATION_ACTION_TYPES.CREATE_TASK: {
        // Create an automated task directly in the database
        const creatorMember = await tx.organizationMembership.findFirst({
          where: { organizationId: event.organizationId, status: 'ACTIVE' },
          include: { user: true },
        });
        const employee = await tx.employee.findFirst({
          where: { organizationId: event.organizationId, status: 'ACTIVE' },
        });

        if (!creatorMember || !employee) throw new BadRequestException('Automation requires an active member and employee');
        const taskTitle = action.params?.title || `[Tự động] Xử lý hồ sơ ${event.entityId}`;
        const taskDesc = action.params?.description || `Tạo tự động bởi quy tắc HR Automation cho ${event.entityType}.`;
        await tx.task.create({
          data: {
            organizationId: event.organizationId,
            creatorEmployeeId: employee.id,
            assigneeEmployeeId: employee.id,
            title: taskTitle,
            description: taskDesc,
            status: 'TODO',
            priority: 'HIGH',
            dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        break;
      }

      default:
        throw new BadRequestException('Unsupported automation action');
    }
  }

  private evaluateConditions(conditions: AutomationCondition[], data: Record<string, unknown>): boolean {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every((c) => this.evaluateCondition(c, data));
  }

  private evaluateCondition(condition: AutomationCondition, data: Record<string, unknown>): boolean {
    const actual = data ? data[condition.field] : undefined;
    const expected = condition.value;

    switch (condition.operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'greater_than':
        return Number(actual) > Number(expected);
      case 'less_than':
        return Number(actual) < Number(expected);
      case 'greater_than_or_equal':
        return Number(actual) >= Number(expected);
      case 'less_than_or_equal':
        return Number(actual) <= Number(expected);
      case 'contains':
        return typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase());
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      default:
        return false;
    }
  }

  async listExecutions(actorId: string, organizationId: string, limit = 50) {
    const take = Number(limit);
    if (!Number.isInteger(take) || take < 1) throw new BadRequestException();
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.authorization.can(actorId, PERMISSIONS.AUTOMATION_READ, organizationId, tx))) {
        throw new ForbiddenException();
      }
      return tx.automationExecution.findMany({
      where: { organizationId },
      include: {
        rule: {
          select: { id: true, name: true, trigger: true },
        },
      },
      orderBy: { createdAt: 'desc' },
        take: Math.min(take, 100),
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

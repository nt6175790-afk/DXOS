// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { WorkflowActionsService, workflowObject } from './workflow-actions.service';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { isOrganizationIdentifier, PERMISSIONS } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { NotificationService } from '../notifications/notification.service';
import { NOTIFICATION_TYPES } from '../notifications/notification-catalog';
import {
  WORKFLOW_STATUS,
  WORKFLOW_STEP_STATUS,
  WORKFLOW_STEP_TYPES,
  type WorkflowDefinitionConfig,
  type WorkflowStepConfig,
} from './workflow.types';
import type {
  CancelWorkflowDto,
  ConfirmWorkflowStepDto,
  CreateWorkflowInstanceDto,
} from './workflow.dto';

const DEFAULT_WORKFLOWS: WorkflowDefinitionConfig[] = [
  {
    name: 'Quy trình gia hạn hợp đồng lao động',
    triggerType: 'CONTRACT_RENEWAL',
    description: 'Quy trình tự động phát hiện hợp đồng sắp hết hạn 30 ngày, gửi thông báo, yêu cầu HR xác nhận điều khoản và hoàn tất gia hạn.',
    steps: [
      {
        name: 'Gửi thông báo hợp đồng sắp hết hạn & lập đề xuất',
        type: WORKFLOW_STEP_TYPES.NOTIFICATION,
        description: 'Tự động gửi thông báo cho quản lý nhân sự về hợp đồng cần gia hạn.',
      },
      {
        name: 'HR xác nhận điều khoản gia hạn & phê duyệt',
        type: WORKFLOW_STEP_TYPES.HUMAN_CONFIRMATION,
        description: 'Chuyên viên HR kiểm tra đánh giá hiệu suất, thời hạn và xác nhận gia hạn.',
      },
      {
        name: 'Hoàn tất cập nhật hồ sơ & lưu trữ tài liệu',
        type: WORKFLOW_STEP_TYPES.ACTION,
        description: 'Ghi nhận gia hạn hợp đồng thành công và thông báo cho các bên.',
        payload: { action: 'RENEW_CONTRACT' },
      },
    ],
  },
  {
    name: 'Quy trình bổ sung hồ sơ nhân sự thiếu',
    triggerType: 'MISSING_DOCUMENT',
    description: 'Quy trình nhắc nhở và đôn đốc nhân viên hoàn thiện các giấy tờ bắt buộc còn thiếu.',
    steps: [
      {
        name: 'Gửi thông báo đôn đốc bổ sung giấy tờ',
        type: WORKFLOW_STEP_TYPES.NOTIFICATION,
        description: 'Thông báo danh sách tài liệu bắt buộc còn thiếu cho nhân sự.',
      },
      {
        name: 'HR xác nhận đã nhận đủ hồ sơ bản cứng/số hóa',
        type: WORKFLOW_STEP_TYPES.HUMAN_CONFIRMATION,
        description: 'HR kiểm tra tính hợp lệ của tài liệu nộp bổ sung.',
      },
      {
        name: 'Cập nhật trạng thái tuân thủ hồ sơ',
        type: WORKFLOW_STEP_TYPES.ACTION,
        description: 'Hoàn tất hồ sơ tuân thủ compliance.',
        payload: { action: 'ACTIVATE_DOCUMENT' },
      },
    ],
  },
  { name: 'Quy trình tạo công việc có xác nhận', triggerType: 'TASK_REQUEST',
    description: 'Người có quyền xác nhận nội dung trước khi tạo công việc thật.',
    steps: [{ name: 'Xác nhận nội dung công việc', type: WORKFLOW_STEP_TYPES.HUMAN_CONFIRMATION },
      { name: 'Tạo công việc', type: WORKFLOW_STEP_TYPES.TASK, payload: { action: 'CREATE_TASK' } }] },
];

@Injectable()
export class WorkflowService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly actions: WorkflowActionsService,
  ) {}

  async onModuleInit() {
    // Optionally seed default workflows on startup
  }

  async ensureDefaultDefinitions(organizationId: string, actorId: string) {
    for (const def of DEFAULT_WORKFLOWS) {
      const existing = await this.prisma.workflowDefinition.findFirst({
        where: { organizationId, triggerType: def.triggerType },
      });
      if (!existing) {
        await this.prisma.workflowDefinition.create({
          data: {
            id: randomUUID(),
            organizationId,
            name: def.name,
            triggerType: def.triggerType,
            description: def.description,
            steps: JSON.stringify(def.steps),
            isActive: true,
            createdBy: actorId,
          },
        });
      }
    }
  }

  async listDefinitions(actorId: string, organizationId: string) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.WORKFLOW_READ);
    await this.ensureDefaultDefinitions(organizationId, actorId);
    return this.prisma.workflowDefinition.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listInstances(
    actorId: string,
    organizationId: string,
    query?: { status?: string; limit?: number },
  ) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.WORKFLOW_READ);
    const take = query?.limit ? Math.min(Number(query.limit), 50) : 50;
    return this.prisma.workflowInstance.findMany({
      where: {
        organizationId,
        ...(query?.status ? { status: query.status } : {}),
      },
      include: {
        definition: true,
        stepExecutions: {
          orderBy: { stepIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async getInstance(actorId: string, organizationId: string, instanceId: string) {
    if (actorId !== 'system') {
      await this.assertPermission(actorId, organizationId, PERMISSIONS.WORKFLOW_READ);
    }
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, organizationId },
      include: {
        definition: true,
        stepExecutions: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    });
    if (!instance) {
      throw new NotFoundException(`Workflow instance ${instanceId} not found`);
    }
    return instance;
  }

  async startWorkflow(
    actorId: string,
    organizationId: string,
    dto: CreateWorkflowInstanceDto,
  ) {
    if (actorId !== 'system') {
      await this.assertPermission(actorId, organizationId, PERMISSIONS.WORKFLOW_CREATE);
    }

    const definition = await this.prisma.workflowDefinition.findFirst({
      where: { id: dto.workflowDefinitionId, organizationId },
    });
    if (!definition) {
      throw new NotFoundException(`Workflow definition ${dto.workflowDefinitionId} not found`);
    }
    if (!definition.isActive) {
      throw new BadRequestException('Workflow definition is inactive');
    }

    const steps: WorkflowStepConfig[] = JSON.parse(definition.steps || '[]');
    if (!Array.isArray(steps) || steps.length === 0 || steps.length > 20 || steps.some(s => !Object.values(WORKFLOW_STEP_TYPES).includes(s.type))) {
      throw new BadRequestException('Workflow definition has no steps defined');
    }
    if (dto.data && JSON.stringify(dto.data).length > 16000) throw new BadRequestException('Workflow input is too large');

    // Determine a valid 36-char user ID for ownerUserId
    const adminMember = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      select: { userId: true },
    });
    const ownerUserId = isOrganizationIdentifier(actorId) ? actorId : (adminMember?.userId || randomUUID());

    const instanceId = randomUUID();
    const createdInstance = await this.prisma.$transaction(async (tx) => {
      const instance = await tx.workflowInstance.create({
        data: {
          id: instanceId,
          organizationId,
          workflowDefinitionId: definition.id,
          title: dto.title,
          entityType: dto.entityType,
          entityId: dto.entityId,
          status: WORKFLOW_STATUS.RUNNING,
          currentStepIndex: 0,
          data: dto.data ? JSON.stringify(dto.data) : null,
          ownerUserId,
        },
      });

      // Create step execution records
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await tx.workflowStepExecution.create({
          data: {
            id: randomUUID(),
            organizationId,
            workflowInstanceId: instance.id,
            stepIndex: i,
            stepName: step.name,
            stepType: step.type,
            status: i === 0 ? WORKFLOW_STEP_STATUS.IN_PROGRESS : WORKFLOW_STEP_STATUS.PENDING,
            actionPayload: step.payload ? JSON.stringify(step.payload) : null,
          },
        });
      }

      await this.audit.record(
        {
          event: AUDIT_EVENTS.WORKFLOW_INSTANCE_CREATED,
          organizationId,
          actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined,
          resourceId: instance.id,
        },
        tx,
      );

      return instance;
    });

    // Advance first step(s)
    return this.advanceWorkflow(actorId, organizationId, createdInstance.id);
  }

  async confirmStep(
    actorId: string,
    organizationId: string,
    instanceId: string,
    stepId: string,
    dto: ConfirmWorkflowStepDto,
  ) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.WORKFLOW_UPDATE);

    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, organizationId },
      include: {
        stepExecutions: { orderBy: { stepIndex: 'asc' } },
      },
    });
    if (!instance) {
      throw new NotFoundException(`Workflow instance ${instanceId} not found`);
    }

    const step = instance.stepExecutions.find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundException(`Step execution ${stepId} not found`);
    }

    if (instance.status !== WORKFLOW_STATUS.WAITING ||
      step.stepIndex !== instance.currentStepIndex ||
      step.stepType !== WORKFLOW_STEP_TYPES.HUMAN_CONFIRMATION ||
      step.status !== WORKFLOW_STEP_STATUS.WAITING_CONFIRMATION) {
      throw new BadRequestException(`Step ${step.stepName} is in status ${step.status} and cannot be confirmed`);
    }

    // Complete the confirmed step
    await this.prisma.$transaction(async (tx) => {
      // Claim the instance before changing its step. Concurrent cancellation or
      // confirmation must not revive a cancelled process or duplicate execution.
      const claim = await tx.workflowInstance.updateMany({
        where: { id: instance.id, organizationId, status: WORKFLOW_STATUS.WAITING,
          currentStepIndex: step.stepIndex },
        data: { status: WORKFLOW_STATUS.RUNNING },
      });
      if (claim.count !== 1) throw new ConflictException('Workflow state changed; reload before confirming');
      if (dto.resultPayload) {
        if (Object.keys(dto.resultPayload).some(key => !['documentId', 'newExpiryDate', 'task'].includes(key))) throw new BadRequestException('Unsupported confirmation fields');
        const data = { ...workflowObject(instance.data), ...dto.resultPayload };
        if (JSON.stringify(data).length > 16000) throw new BadRequestException('Workflow input is too large');
        await tx.workflowInstance.update({ where: { id: instance.id }, data: { data: JSON.stringify(data) } });
      }
      await tx.workflowStepExecution.update({
        where: { id: step.id },
        data: {
          status: WORKFLOW_STEP_STATUS.COMPLETED,
          assignedToUserId: actorId,
          comments: dto.comments ?? 'Đã xác nhận phê duyệt bởi Quản trị viên HR.',
          resultPayload: dto.resultPayload ? JSON.stringify(dto.resultPayload) : JSON.stringify({ confirmed: true, at: new Date().toISOString() }),
          completedAt: new Date(),
        },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.WORKFLOW_INSTANCE_CONFIRMED,
          organizationId,
          actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined,
          resourceId: instance.id,
        },
        tx,
      );
    });

    // Advance to next step
    return this.advanceWorkflow(actorId, organizationId, instance.id, step.stepIndex + 1);
  }

  async cancelWorkflow(
    actorId: string,
    organizationId: string,
    instanceId: string,
    dto: CancelWorkflowDto,
  ) {
    if (actorId !== 'system') {
      await this.assertPermission(actorId, organizationId, PERMISSIONS.WORKFLOW_CANCEL);
    }

    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, organizationId },
    });
    if (!instance) {
      throw new NotFoundException(`Workflow instance ${instanceId} not found`);
    }
    if (![WORKFLOW_STATUS.RUNNING, WORKFLOW_STATUS.WAITING, WORKFLOW_STATUS.FAILED].includes(instance.status as 'RUNNING' | 'WAITING' | 'FAILED')) {
      throw new BadRequestException('Only an active workflow can be cancelled');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.workflowInstance.updateMany({
        where: { id: instanceId, organizationId, status: instance.status,
          currentStepIndex: instance.currentStepIndex },
        data: {
          status: WORKFLOW_STATUS.CANCELLED,
          completedAt: new Date(),
          data: JSON.stringify({ ...workflowObject(instance.data), cancellation: { reason: dto.reason ?? null, actorUserId: actorId, at: new Date().toISOString() } }),
        },
      });
      if (claim.count !== 1) throw new ConflictException('Workflow state changed; reload before cancelling');

      await this.audit.record(
        {
          event: AUDIT_EVENTS.WORKFLOW_INSTANCE_CANCELLED,
          organizationId,
          actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined,
          resourceId: instanceId,
        },
        tx,
      );

      return tx.workflowInstance.findFirstOrThrow({ where: { id: instanceId, organizationId } });
    });

    return updated;
  }

  async retry(actorId: string, organizationId: string, instanceId: string) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.WORKFLOW_UPDATE);
    await this.assertPermission(actorId, organizationId, PERMISSIONS.WORKFLOW_READ);
    const instance = await this.prisma.workflowInstance.findFirst({ where: { id: instanceId, organizationId } });
    if (!instance) throw new NotFoundException();
    if (instance.status !== WORKFLOW_STATUS.FAILED) throw new ConflictException('Only failed workflows can be retried');
    await this.prisma.$transaction(async tx => {
      const claimed = await tx.workflowInstance.updateMany({ where: { id: instanceId, organizationId, status: WORKFLOW_STATUS.FAILED }, data: { status: WORKFLOW_STATUS.RUNNING } });
      if (claimed.count !== 1) throw new ConflictException();
      await this.audit.record({ event: AUDIT_EVENTS.WORKFLOW_RETRIED, organizationId, actorUserId: actorId, resourceId: instanceId }, tx);
    });
    return this.advanceWorkflow(actorId, organizationId, instanceId, instance.currentStepIndex);
  }

  private async advanceWorkflow(
    actorId: string,
    organizationId: string,
    instanceId: string,
    startFromIndex = 0,
  ) {
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, organizationId },
      include: {
        definition: true,
        stepExecutions: { orderBy: { stepIndex: 'asc' } },
      },
    });
    if (!instance || instance.status === WORKFLOW_STATUS.COMPLETED || instance.status === WORKFLOW_STATUS.CANCELLED) {
      return instance;
    }

    const steps = instance.stepExecutions;
    const updateActiveState = async (data: { currentStepIndex: number; status?: string }) => {
      const result = await this.prisma.workflowInstance.updateMany({
        where: { id: instance.id, organizationId, status: WORKFLOW_STATUS.RUNNING }, data,
      });
      if (result.count !== 1) throw new ConflictException('Workflow is no longer running');
    };
    for (let i = startFromIndex; i < steps.length; i++) {
      const step = steps[i];
      if (step.status === WORKFLOW_STEP_STATUS.COMPLETED) continue;

      if (step.stepType === WORKFLOW_STEP_TYPES.NOTIFICATION) {
        // Safe notification
        let sent = false;
        try {
          if (isOrganizationIdentifier(actorId)) {
            await this.notifications.createForRecipient({
              organizationId,
              recipientUserId: actorId,
              type: NOTIFICATION_TYPES.AUTOMATION_TRIGGERED,
              metadata: {
                title: `[Quy trình] ${step.stepName}`,
                message: `Đang xử lý bước: ${step.stepName} trong quy trình "${instance.title}".`,
              },
            });
            sent = true;
          }
        } catch {
          // Non-blocking notification delivery
        }

        await this.prisma.workflowStepExecution.update({
          where: { id: step.id },
          data: {
            status: WORKFLOW_STEP_STATUS.COMPLETED,
            executedAt: new Date(),
            completedAt: new Date(),
            resultPayload: JSON.stringify({ sent, timestamp: new Date().toISOString() }),
          },
        });
        await updateActiveState({ currentStepIndex: i });
      } else if (step.stepType === WORKFLOW_STEP_TYPES.HUMAN_CONFIRMATION) {
        // Pauses here! Human confirmation required
        await this.prisma.workflowStepExecution.update({
          where: { id: step.id },
          data: {
            status: WORKFLOW_STEP_STATUS.WAITING_CONFIRMATION,
            executedAt: new Date(),
          },
        });
        await updateActiveState({
            status: WORKFLOW_STATUS.WAITING,
            currentStepIndex: i,
        });

        // Notify that human confirmation is needed
        try {
          if (isOrganizationIdentifier(actorId)) {
            await this.notifications.createForRecipient({
              organizationId,
              recipientUserId: actorId,
              type: NOTIFICATION_TYPES.WORKFLOW_WAITING_CONFIRMATION,
              metadata: {
                title: `Cần xác nhận: ${step.stepName}`,
                message: `Quy trình "${instance.title}" đang chờ xác nhận từ HR.`,
                workflowInstanceId: instance.id,
                stepName: step.stepName,
              },
            });
          }
        } catch {
          // ignore notification failure
        }

        // Return current paused state
        return this.getInstance(actorId, organizationId, instance.id);
      } else if (step.stepType === WORKFLOW_STEP_TYPES.ACTION || step.stepType === WORKFLOW_STEP_TYPES.TASK) {
        try {
          await this.prisma.$transaction(async tx => {
            const locked = await tx.workflowInstance.updateMany({ where: { id: instance.id, organizationId, status: WORKFLOW_STATUS.RUNNING }, data: { currentStepIndex: i } });
            if (locked.count !== 1) throw new ConflictException('Workflow is no longer running');
            const fresh = await tx.workflowStepExecution.findFirstOrThrow({ where: { id: step.id, organizationId, workflowInstanceId: instance.id } });
            if (fresh.status === WORKFLOW_STEP_STATUS.COMPLETED) return;
            const current = await tx.workflowInstance.findFirstOrThrow({ where: { id: instance.id, organizationId } });
            const result = await this.actions.execute(tx, actorId, organizationId, current, fresh, instance.definition.triggerType);
            await tx.workflowStepExecution.update({ where: { id: step.id }, data: { status: WORKFLOW_STEP_STATUS.COMPLETED, executedAt: new Date(), completedAt: new Date(), resultPayload: JSON.stringify(result) } });
            await this.audit.record({ event: AUDIT_EVENTS.WORKFLOW_STEP_COMPLETED, organizationId, actorUserId: actorId, resourceId: instance.id }, tx);
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        } catch {
          await this.prisma.$transaction(async tx => {
            const changed = await tx.workflowInstance.updateMany({ where: { id: instance.id, organizationId, status: WORKFLOW_STATUS.RUNNING }, data: { status: WORKFLOW_STATUS.FAILED, currentStepIndex: i } });
            if (changed.count) {
              await tx.workflowStepExecution.update({ where: { id: step.id }, data: { status: WORKFLOW_STEP_STATUS.FAILED, resultPayload: JSON.stringify({ errorCode: 'WORKFLOW_ACTION_FAILED', message: 'Kiểm tra dữ liệu đầu vào và quyền nghiệp vụ trước khi thử lại.' }) } });
              await this.audit.record({ event: AUDIT_EVENTS.WORKFLOW_STEP_FAILED, organizationId, actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined, resourceId: instance.id }, tx);
            }
          });
          return this.getInstance(actorId, organizationId, instance.id);
        }
      }
    }

    // All steps completed!
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.workflowInstance.updateMany({
        where: { id: instance.id, organizationId, status: WORKFLOW_STATUS.RUNNING },
        data: {
          status: WORKFLOW_STATUS.COMPLETED,
          completedAt: new Date(),
        },
      });
      if (result.count !== 1) throw new ConflictException('Workflow is no longer running');

      await this.audit.record(
        {
          event: AUDIT_EVENTS.WORKFLOW_INSTANCE_COMPLETED,
          organizationId,
          actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined,
          resourceId: instance.id,
        },
        tx,
      );
    });

    try {
      if (isOrganizationIdentifier(actorId)) {
        await this.notifications.createForRecipient({
          organizationId,
          recipientUserId: actorId,
          type: NOTIFICATION_TYPES.WORKFLOW_COMPLETED,
          metadata: {
            title: `Hoàn tất: ${instance.title}`,
            message: `Quy trình "${instance.title}" đã hoàn tất tất cả các bước thành công.`,
            workflowInstanceId: instance.id,
          },
        });
      }
    } catch {
      // ignore
    }

    return this.getInstance(actorId, organizationId, instance.id);
  }

  private async assertPermission(actorId: string, organizationId: string, permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) {
    if (actorId === 'system') return;
    const permissions = await this.authorization.effectivePermissions(actorId, organizationId);
    if (!permissions || (!permissions.includes(permission) && !permissions.includes(PERMISSIONS.WORKFLOW_MANAGE))) {
      throw new ForbiddenException(`Missing required permission: ${permission}`);
    }
  }
}

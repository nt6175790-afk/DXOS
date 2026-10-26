// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { isOrganizationIdentifier, PERMISSIONS } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGERS,
  type AutomationAction,
  type AutomationCondition,
} from './automation.types';
import type {
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
} from './automation.dto';

interface StandardRuleTemplate {
  name: string;
  description: string;
  trigger: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

const STANDARD_RULES: StandardRuleTemplate[] = [
  {
    name: 'Tự động rà soát hợp đồng hết hạn trong 30 ngày & tạo quy trình gia hạn',
    description: 'Phát hiện hợp đồng lao động sẽ hết hạn trong 30 ngày tới, tự động gửi thông báo và khởi chạy quy trình gia hạn hợp đồng có sự phê duyệt của HR.',
    trigger: AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_30D,
    conditions: [
      { field: 'category', operator: 'equals', value: 'LABOR_CONTRACT' },
    ],
    actions: [
      {
        type: AUTOMATION_ACTION_TYPES.TRIGGER_WORKFLOW,
        params: { triggerType: 'CONTRACT_RENEWAL' },
      },
      {
        type: AUTOMATION_ACTION_TYPES.CREATE_NOTIFICATION,
        params: {
          title: 'Hợp đồng lao động sắp hết hạn trong 30 ngày',
          message: 'Hệ thống đã tự động tạo quy trình gia hạn hợp đồng cần HR xác nhận.',
        },
      },
    ],
  },
  {
    name: 'Cảnh báo khẩn cấp hồ sơ hết hạn trong 7 ngày',
    description: 'Cảnh báo nhân sự và quản trị viên khi bất kỳ hồ sơ nào của nhân viên còn 7 ngày hết hạn.',
    trigger: AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_7D,
    conditions: [],
    actions: [
      {
        type: AUTOMATION_ACTION_TYPES.CREATE_NOTIFICATION,
        params: {
          title: 'Cảnh báo khẩn cấp: Hồ sơ hết hạn trong 7 ngày',
          message: 'Vui lòng kiểm tra và xử lý gia hạn hồ sơ trước ngày hết hạn.',
        },
      },
    ],
  },
  {
    name: 'Tự động phát hiện thiếu tài liệu bắt buộc & kích hoạt quy trình bổ sung',
    description: 'Quét các hồ sơ nhân viên còn thiếu giấy tờ bắt buộc theo quy định công ty và tạo quy trình đôn đốc.',
    trigger: AUTOMATION_TRIGGERS.MISSING_MANDATORY_DOCUMENT,
    conditions: [],
    actions: [
      {
        type: AUTOMATION_ACTION_TYPES.TRIGGER_WORKFLOW,
        params: { triggerType: 'MISSING_DOCUMENT' },
      },
      {
        type: AUTOMATION_ACTION_TYPES.CREATE_NOTIFICATION,
        params: {
          title: 'Thiếu tài liệu nhân sự bắt buộc',
          message: 'Nhân viên chưa hoàn thiện hồ sơ tuân thủ theo chính sách.',
        },
      },
    ],
  },
  {
    name: 'Nhắc nhở kỳ đánh giá hiệu suất nhân viên',
    description: 'Gửi thông báo nhắc nhở nhân viên và quản lý hoàn thành biểu mẫu đánh giá hiệu suất đúng thời hạn.',
    trigger: AUTOMATION_TRIGGERS.PERFORMANCE_REVIEW_DUE,
    conditions: [],
    actions: [
      {
        type: AUTOMATION_ACTION_TYPES.CREATE_NOTIFICATION,
        params: {
          title: 'Nhắc nhở: Hạn đánh giá hiệu suất nhân sự',
          message: 'Kỳ đánh giá hiệu suất sắp đến hạn chốt kết quả, vui lòng hoàn tất phiếu đánh giá.',
        },
      },
    ],
  },
];

@Injectable()
export class AutomationRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async ensureStandardRules(organizationId: string, actorId: string) {
    for (const rule of STANDARD_RULES) {
      const existing = await this.prisma.automationRule.findFirst({
        where: { organizationId, trigger: rule.trigger },
      });
      if (!existing) {
        await this.prisma.automationRule.create({
          data: {
            id: randomUUID(),
            organizationId,
            name: rule.name,
            description: rule.description,
            trigger: rule.trigger,
            conditions: JSON.stringify(rule.conditions),
            actions: JSON.stringify(rule.actions),
            isActive: true,
            createdBy: actorId,
          },
        });
      }
    }
  }

  async listRules(actorId: string, organizationId: string) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.AUTOMATION_READ);
    await this.ensureStandardRules(organizationId, actorId);
    return this.prisma.automationRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRule(actorId: string, organizationId: string, ruleId: string) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.AUTOMATION_READ);
    const rule = await this.prisma.automationRule.findFirst({
      where: { id: ruleId, organizationId },
    });
    if (!rule) throw new NotFoundException(`Automation rule ${ruleId} not found`);
    return rule;
  }

  async createRule(
    actorId: string,
    organizationId: string,
    dto: CreateAutomationRuleDto,
  ) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.AUTOMATION_CREATE);

    const ruleId = randomUUID();
    const created = await this.prisma.automationRule.create({
      data: {
        id: ruleId,
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
        trigger: dto.trigger,
        conditions: typeof dto.conditions === 'string' ? dto.conditions : JSON.stringify(dto.conditions),
        actions: typeof dto.actions === 'string' ? dto.actions : JSON.stringify(dto.actions),
        isActive: dto.isActive ?? true,
        createdBy: actorId,
      },
    });

    await this.audit.record({
      event: AUDIT_EVENTS.AUTOMATION_RULE_CREATED,
      organizationId,
      actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined,
      resourceId: created.id,
    });

    return created;
  }

  async updateRule(
    actorId: string,
    organizationId: string,
    ruleId: string,
    dto: UpdateAutomationRuleDto,
  ) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.AUTOMATION_UPDATE);
    const existing = await this.getRule(actorId, organizationId, ruleId);

    const updated = await this.prisma.automationRule.update({
      where: { id: existing.id },
      data: {
        name: dto.name ?? existing.name,
        description: dto.description !== undefined ? dto.description : existing.description,
        trigger: dto.trigger ?? existing.trigger,
        conditions: dto.conditions ? (typeof dto.conditions === 'string' ? dto.conditions : JSON.stringify(dto.conditions)) : existing.conditions,
        actions: dto.actions ? (typeof dto.actions === 'string' ? dto.actions : JSON.stringify(dto.actions)) : existing.actions,
        isActive: dto.isActive !== undefined ? dto.isActive : existing.isActive,
        updatedBy: isOrganizationIdentifier(actorId) ? actorId : undefined,
      },
    });

    await this.audit.record({
      event: AUDIT_EVENTS.AUTOMATION_RULE_UPDATED,
      organizationId,
      actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined,
      resourceId: updated.id,
    });

    return updated;
  }

  async toggleRule(
    actorId: string,
    organizationId: string,
    ruleId: string,
    isActive: boolean,
  ) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.AUTOMATION_UPDATE);
    const existing = await this.getRule(actorId, organizationId, ruleId);

    const updated = await this.prisma.automationRule.update({
      where: { id: existing.id },
      data: { isActive, updatedBy: isOrganizationIdentifier(actorId) ? actorId : undefined },
    });

    await this.audit.record({
      event: AUDIT_EVENTS.AUTOMATION_RULE_TOGGLED,
      organizationId,
      actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined,
      resourceId: updated.id,
    });

    return updated;
  }

  async deleteRule(actorId: string, organizationId: string, ruleId: string) {
    await this.assertPermission(actorId, organizationId, PERMISSIONS.AUTOMATION_DELETE);
    const existing = await this.getRule(actorId, organizationId, ruleId);

    await this.prisma.automationRule.delete({
      where: { id: existing.id },
    });

    await this.audit.record({
      event: AUDIT_EVENTS.AUTOMATION_RULE_DELETED,
      organizationId,
      actorUserId: isOrganizationIdentifier(actorId) ? actorId : undefined,
      resourceId: ruleId,
    });

    return { success: true };
  }

  private async assertPermission(actorId: string, organizationId: string, permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) {
    if (actorId === 'system') return;
    const permissions = await this.authorization.effectivePermissions(actorId, organizationId);
    if (!permissions || (!permissions.includes(permission) && !permissions.includes(PERMISSIONS.AUTOMATION_MANAGE))) {
      throw new ForbiddenException(`Missing required permission: ${permission}`);
    }
  }
}

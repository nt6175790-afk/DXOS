// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS as P, isOrganizationIdentifier } from '../rbac/permission-catalog';
import { TasksService } from '../work/tasks.service';
import { CreateTaskDto } from '../work/task.dto';
import { AiService } from './ai.service';
import { ConfirmAiTaskDto } from './ai-actions.dto';

const DRAFT_SYSTEM = 'DXOS_TASK_DRAFT_V1. Extract a task draft from the user request. Return ONLY one JSON object with title (1-200 chars), optional description, priority (LOW|MEDIUM|HIGH|URGENT), dueAt (ISO timestamp with timezone, only if explicit). Never include IDs, organization, permissions, status or tools. Omit uncertain fields. Do not execute anything. Answer task text in Vietnamese.';
@Injectable()
export class AiTaskDraftsService {
  constructor(private readonly db: PrismaService, private readonly auth: AuthorizationService,
    private readonly ai: AiService, private readonly tasks: TasksService) {}
  private async allow(user: string, org: string, tx: Prisma.TransactionClient = this.db) {
    for (const key of [P.AI_USE, P.TASK_CREATE]) if (!await this.auth.can(user, key, org, tx)) throw new ForbiddenException();
  }
  async propose(user: string, org: string, prompt: string) {
    await this.allow(user, org);
    if (await this.db.aiTaskDraft.count({ where: { userId: user, organizationId: org, taskId: null, expiresAt: { gt: new Date() } } }) >= 20) throw new ConflictException('Quá nhiều bản nháp đang chờ xác nhận.');
    const result = await this.ai.generate(user, org, { messages: [{ role: 'user', content: prompt }], temperature: 0, maxOutputTokens: 700 }, DRAFT_SYSTEM);
    let payload: CreateTaskDto;
    try {
      const raw: unknown = JSON.parse(result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !['title', 'description', 'priority', 'dueAt'].includes(k))) throw new Error();
      payload = plainToInstance(CreateTaskDto, raw);
      if (validateSync(payload, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }).length) throw new Error();
    } catch { throw new BadGatewayException('AI chưa tạo được bản nháp hợp lệ. Hãy mô tả lại công việc.'); }
    return this.db.$transaction(async tx => {
      await this.allow(user, org, tx);
      await tx.aiTaskDraft.deleteMany({ where: { userId: user, organizationId: org, taskId: null, expiresAt: { lte: new Date() } } });
      if (await tx.aiTaskDraft.count({ where: { userId: user, organizationId: org, taskId: null, expiresAt: { gt: new Date() } } }) >= 20) throw new ConflictException('Quá nhiều bản nháp.');
      const row = await tx.aiTaskDraft.create({ data: { organizationId: org, userId: user,
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 1800000) } });
      return { id: row.id, task: payload, expiresAt: row.expiresAt, provider: result.provider, requiresConfirmation: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async confirm(user: string, org: string, id: string, input: ConfirmAiTaskDto) {
    if (!isOrganizationIdentifier(id) || input.confirm !== true) throw new BadRequestException();
    try {
      return await this.db.$transaction(async tx => {
        await this.allow(user, org, tx);
        const row = await tx.aiTaskDraft.findFirst({ where: { id, organizationId: org, userId: user } });
        if (!row) throw new NotFoundException();
        if (row.taskId) return { taskId: row.taskId, replayed: true };
        if (row.expiresAt <= new Date()) throw new ConflictException('Bản nháp đã hết hạn.');
        // Lock this draft before the business effect; effect, reference and task audit commit together.
        const locked = await tx.aiTaskDraft.updateMany({ where: { id, organizationId: org, userId: user, committedAt: null, taskId: null }, data: { committedAt: new Date() } });
        if (locked.count !== 1) throw new ConflictException('Bản nháp đang được xử lý.');
        const { confirm, ...task } = input; void confirm;
        const result = await this.tasks.createInTransaction(user, org, task, tx);
        await tx.aiTaskDraft.update({ where: { id }, data: { taskId: result.id } });
        return { taskId: result.id, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('Vui lòng xác nhận lại bản nháp.');
      throw error;
    }
  }
}

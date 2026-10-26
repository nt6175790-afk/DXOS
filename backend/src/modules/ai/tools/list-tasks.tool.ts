// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { TaskPriority } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { TasksService } from '../../work/tasks.service';
import { formatVnDateTime, overdue } from '../agent/vn-time';
import { clip, departmentName, holds, LimitArg, limitOf, limitSchema, objectSchema } from './tool.types';
import type { AiCitation, AiTool, ToolContext, ToolOutcome } from './tool.types';

const VIEWS = ['overdue', 'mine', 'due_soon', 'open'] as const;

export class ListTasksArgs {
  @IsIn(VIEWS) view!: (typeof VIEWS)[number];
  /** Only used by view=due_soon (clamped to 1–30); ignored by other views instead of failing the call. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(366) withinDays?: number;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() assigneeEmployeeId?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
  @IsString() @Length(2, 100) titleContains?: string;
  @LimitArg() limit?: number;
}

@Injectable()
export class ListTasksTool implements AiTool<ListTasksArgs> {
  readonly name = 'list_tasks';
  readonly description = 'List OPEN tasks (TODO or IN_PROGRESS) with id, title, priority, due time (Vietnam time), overdue flag, assignee and department. ' +
    'view=overdue: past due. view=due_soon: due within `withinDays` (default 3). view=open: all open tasks. ' +
    'view=mine: tasks assigned to the user who is asking; the server already knows who that is, so never ask the user for an id. ' +
    'To find a task by name use view=open with titleContains (part of the title), then get_task with its id; never ask the user for a task id. ' +
    'Optional filters: titleContains, departmentId (from list_departments), assigneeEmployeeId, priority; omit filters you do not need. ' +
    'Counting: `total` = number of matching tasks, `overdueTotal` = how many of them are overdue. Use these numbers; never count the items, the list may be cut to `limit`.';
  readonly parameters = objectSchema({
    view: { type: 'string', enum: [...VIEWS] },
    withinDays: { type: 'integer', minimum: 1, maximum: 30, description: 'Only for view=due_soon. Default 3.' },
    departmentId: { type: 'string', format: 'uuid' },
    assigneeEmployeeId: { type: 'string', format: 'uuid' },
    priority: { type: 'string', enum: Object.values(TaskPriority) },
    titleContains: { type: 'string', minLength: 2, maxLength: 100, description: 'Part of the task title, case- and accent-insensitive.' },
    limit: limitSchema(10, 20),
  }, ['view']);
  readonly argsType = ListTasksArgs;
  readonly requiredPermissions = [PERMISSIONS.TASK_READ];

  constructor(private readonly tasks: TasksService) {}

  async execute(args: ListTasksArgs, context: ToolContext): Promise<ToolOutcome> {
    const now = context.now;
    const result = await this.tasks.listForAssistant(context.userId, context.organizationId, {
      view: args.view, now, withinDays: Math.min(Math.max(args.withinDays ?? 3, 1), 30), limit: limitOf(args.limit, 10, 20),
      departmentId: args.departmentId, assigneeEmployeeId: args.assigneeEmployeeId, priority: args.priority, titleContains: args.titleContains,
    });
    const base = { view: args.view, asOf: formatVnDateTime(now), total: result.total, overdueTotal: result.overdueTotal };
    if (result.notAnEmployee) return { status: 'EMPTY', data: { ...base, reason: 'NOT_AN_EMPLOYEE', items: [] } };
    if (!result.total) return { status: 'EMPTY', data: { ...base, items: [] } };

    // Names follow the regular screens: people need employee:read, departments need department:read.
    const names = holds(context, PERMISSIONS.EMPLOYEE_READ);
    const items = result.items.map((task) => ({
      id: task.id,
      title: clip(task.title, 160),
      status: task.status,
      priority: task.priority,
      due: task.dueAt ? formatVnDateTime(task.dueAt) : null,
      ...overdue(task.dueAt, now),
      progressPercent: task.progressPercent,
      assignee: names ? task.assignee?.displayName ?? null : null,
      department: departmentName(context, task.department?.name),
    }));
    const citations: AiCitation[] = items.map((task) => ({ type: 'task', id: task.id, label: task.title.slice(0, 120), href: `/tasks/${task.id}` }));
    return { status: 'OK', data: { ...base, truncated: result.total > items.length, items }, citations };
  }
}

import { Injectable } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { TasksService } from '../../work/tasks.service';
import { formatVnDateTime, overdue } from '../agent/vn-time';
import { clip, departmentName, holds, objectSchema } from './tool.types';
import type { AiTool, ToolContext, ToolOutcome } from './tool.types';

export class GetTaskArgs {
  @IsUUID() taskId!: string;
}

@Injectable()
export class GetTaskTool implements AiTool<GetTaskArgs> {
  readonly name = 'get_task';
  readonly description = 'Details of ONE task by id (take the id from list_tasks; find it by name with titleContains): status, priority, progress, due time, overdue flag, ' +
    'people involved, checklist progress and the 3 latest comments. Use it for follow-up questions about a specific task.';
  readonly parameters = objectSchema({ taskId: { type: 'string', format: 'uuid' } }, ['taskId']);
  readonly argsType = GetTaskArgs;
  readonly requiredPermissions = [PERMISSIONS.TASK_READ];

  constructor(private readonly tasks: TasksService) {}

  async execute(args: GetTaskArgs, context: ToolContext): Promise<ToolOutcome> {
    const result = await this.tasks.getForAssistant(context.userId, context.organizationId, args.taskId);
    if (!result) return { status: 'EMPTY', data: { reason: 'NOT_FOUND' } };
    const { task } = result;
    const names = holds(context, PERMISSIONS.EMPLOYEE_READ);
    const open = task.status === 'TODO' || task.status === 'IN_PROGRESS';
    return {
      status: 'OK',
      data: {
        task: {
          id: task.id,
          title: clip(task.title, 200),
          description: task.description ? clip(task.description, 300) : null,
          status: task.status,
          priority: task.priority,
          progressPercent: task.progressPercent,
          due: task.dueAt ? formatVnDateTime(task.dueAt) : null,
          ...overdue(open ? task.dueAt : null, context.now),
          assignee: names ? task.assignee?.displayName ?? null : null,
          creator: names ? task.creator.displayName : null,
          reviewer: names ? task.reviewer?.employee.displayName ?? null : null,
          department: departmentName(context, task.department?.name),
          updated: formatVnDateTime(task.updatedAt),
        },
        checklist: { done: result.checklistDone, total: result.checklistTotal },
        latestComments: result.comments.map((c) => ({
          author: c.authorMembership.employee?.displayName ?? c.authorMembership.user.displayName,
          at: formatVnDateTime(c.createdAt),
          text: clip(c.body, 200),
        })),
      },
      citations: [{ type: 'task', id: task.id, label: clip(task.title, 120), href: `/tasks/${task.id}` }],
    };
  }
}

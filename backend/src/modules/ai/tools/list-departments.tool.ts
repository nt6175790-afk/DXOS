// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { DepartmentsService } from '../../departments/departments.service';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { objectSchema } from './tool.types';
import type { AiTool, ToolContext, ToolOutcome } from './tool.types';

const STATUSES = ['ACTIVE', 'INACTIVE', 'ALL'] as const;

export class ListDepartmentsArgs {
  /** Not named `status` so it cannot be confused with the result's status field. */
  @IsOptional() @IsIn(STATUSES) departmentStatus?: (typeof STATUSES)[number];
}

@Injectable()
export class ListDepartmentsTool implements AiTool<ListDepartmentsArgs> {
  readonly name = 'list_departments';
  readonly description = 'List the organization\'s departments with id, name, code, number of active employees and open tasks. ' +
    'Use it to count departments, compare their size, or find a department id by name before calling other tools. ' +
    'Counts are null when the user may not see them.';
  readonly parameters = objectSchema({
    departmentStatus: { type: 'string', enum: [...STATUSES], description: 'Which departments to list. Default ACTIVE.' },
  });
  readonly argsType = ListDepartmentsArgs;
  readonly requiredPermissions = [PERMISSIONS.DEPARTMENT_READ];

  constructor(private readonly departments: DepartmentsService) {}

  async execute(args: ListDepartmentsArgs, context: ToolContext): Promise<ToolOutcome> {
    const status = args.departmentStatus ?? 'ACTIVE';
    const summary = await this.departments.summarizeForAssistant(context.userId, context.organizationId, status);
    if (!summary.total) return { status: 'EMPTY', data: { statusFilter: status, total: 0, items: [] } };
    return {
      status: 'OK',
      data: { statusFilter: status, total: summary.total, truncated: summary.hasMore, items: summary.items },
      citations: [{ type: 'department', id: null, label: 'Danh sách phòng ban', href: '/departments' }],
    };
  }
}

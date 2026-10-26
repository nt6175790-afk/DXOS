// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { EmployeesService } from '../../people/employees.service';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { departmentName, LimitArg, limitOf, limitSchema, objectSchema } from './tool.types';
import type { AiTool, ToolContext, ToolOutcome } from './tool.types';

export class FindEmployeeArgs {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
  @IsString() @Length(2, 80) query!: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @LimitArg() limit?: number;
}

@Injectable()
export class FindEmployeeTool implements AiTool<FindEmployeeArgs> {
  readonly name = 'find_employee';
  readonly description = 'Find employees by (part of) name or employee code, case- and accent-insensitive. Returns id, code, name, job title, ' +
    'department and status. Use the id with other tools (e.g. list_tasks assigneeEmployeeId). No contact details are returned.';
  readonly parameters = objectSchema({
    query: { type: 'string', minLength: 2, maxLength: 80 },
    departmentId: { type: 'string', format: 'uuid' },
    limit: limitSchema(5, 10),
  }, ['query']);
  readonly argsType = FindEmployeeArgs;
  readonly requiredPermissions = [PERMISSIONS.EMPLOYEE_READ];

  constructor(private readonly employees: EmployeesService) {}

  async execute(args: FindEmployeeArgs, context: ToolContext): Promise<ToolOutcome> {
    const result = await this.employees.searchForAssistant(context.userId, context.organizationId,
      { text: args.query, departmentId: args.departmentId, limit: limitOf(args.limit, 5, 10) });
    if (!result.total) return { status: 'EMPTY', data: { query: args.query, total: 0, items: [] } };
    const items = result.items.map((e) => ({ id: e.id, employeeCode: e.employeeCode, name: e.displayName, jobTitle: e.jobTitle,
      department: departmentName(context, e.department?.name), status: e.status }));
    return { status: 'OK', data: { query: args.query, total: result.total, truncated: result.total > items.length, items },
      citations: items.map((e) => ({ type: 'employee' as const, id: e.id, label: e.name, href: '/people' })) };
  }
}

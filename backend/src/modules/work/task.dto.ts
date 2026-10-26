// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { IsEnum, IsInt, IsString, IsUUID, Length, Matches, Max, Min, ValidateBy, ValidateIf } from 'class-validator';
import { isTaskTimestamp } from './task-policy';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value;
export class EmptyTaskQueryDto {}

export class TaskOptionalFieldsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @Length(1, 10000) @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  description?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null) @Transform(lower) @IsUUID()
  assigneeEmployeeId?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null) @Transform(lower) @IsUUID()
  departmentId?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @ValidateBy({ name: 'taskTimestamp', validator: { validate: isTaskTimestamp,
    defaultMessage: () => 'dueAt must be a valid timestamp with timezone, millisecond precision and UTC year 1000–9999.' } })
  dueAt?: string | null;
}
export class CreateTaskDto extends TaskOptionalFieldsDto {
  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u)
  title!: string;
}
export class UpdateTaskDto extends TaskOptionalFieldsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsInt() @Min(0) @Max(100)
  progressPercent?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u)
  title?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(TaskStatus)
  status?: TaskStatus;
}
export class TaskIdDto {
  @IsUUID() organizationId!: string;
  @IsUUID() taskId!: string;
}
export class ListTasksDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100)
  limit = 25;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID() after?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(TaskStatus) status?: TaskStatus;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(TaskPriority) priority?: TaskPriority;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID() assigneeEmployeeId?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID() departmentId?: string;
}

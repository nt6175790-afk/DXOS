// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { IsBoolean, IsDefined, IsInt, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { TaskIdDto } from './task.dto';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value;

export class SetTaskReviewerDto {
  @IsDefined()
  @ValidateIf((_object, value: unknown) => value !== null) @Transform(lower) @IsUUID()
  reviewerEmployeeId!: string | null;
}

export class CreateTaskChecklistItemDto {
  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u)
  title!: string;
}

export class UpdateTaskChecklistItemDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u)
  title?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsBoolean()
  isCompleted?: boolean;
}

export class TaskChecklistItemIdDto extends TaskIdDto {
  @IsUUID() itemId!: string;
}

export class TaskActivityQueryDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100)
  limit = 25;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  after?: string;
}

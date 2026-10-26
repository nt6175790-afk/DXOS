// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { TaskIdDto } from './task.dto';

export class CreateTaskCommentDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 4000) @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  body!: string;
}
export class LinkTaskAttachmentDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID() fileId!: string;
}
export class TaskAttachmentIdDto extends TaskIdDto {
  @IsUUID() attachmentId!: string;
}
export class TaskCollaborationPageDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100)
  limit = 25;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  after?: string;
}

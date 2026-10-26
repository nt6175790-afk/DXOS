// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

export const searchCategories = ['employees', 'tasks', 'documents', 'departments', 'notifications'] as const;
export type SearchCategory = typeof searchCategories[number];
export class SearchQueryDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(2, 100) @Matches(/^\P{Cc}+$/u)
  q!: string;
  @IsIn(['all', ...searchCategories])
  type: SearchCategory | 'all' = 'all';
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(25)
  limit = 5;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  after?: string;
}

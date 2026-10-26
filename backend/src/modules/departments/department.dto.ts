// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { DepartmentStatus } from '@prisma/client';
import { IsEnum, IsInt, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class EmptyDepartmentQueryDto {}

export class CreateDepartmentDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @Length(1, 64) @Matches(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/)
  code!: string;

  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u)
  name!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @Length(1, 1000) @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  description?: string | null;
}

export class UpdateDepartmentDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @Length(1, 1000) @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  description?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;
}

export class DepartmentIdDto {
  @IsUUID() departmentId!: string;
  // Tenant UUID validation and indistinguishable 403 happen in the existing guard.
  @IsUUID() organizationId!: string;
}

export class ListDepartmentsDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100)
  limit = 25;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  after?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;
}

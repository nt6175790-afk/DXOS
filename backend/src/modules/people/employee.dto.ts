// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { EmployeeStatus } from '@prisma/client';
import { IsEnum, IsInt, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class EmptyEmployeeQueryDto {}

export class EmployeeOptionalFieldsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null) @IsUUID()
  departmentId?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u)
  jobTitle?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @Length(9, 16) @Matches(/^\+[1-9][0-9]{7,14}$/)
  phone?: string | null;
}

export class CreateEmployeeDto extends EmployeeOptionalFieldsDto {
  @IsUUID() userId!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @Length(1, 64) @Matches(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/)
  employeeCode!: string;

  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u)
  displayName!: string;
}

export class UpdateEmployeeDto extends EmployeeOptionalFieldsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u)
  displayName?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class EmployeeIdDto {
  @IsUUID() organizationId!: string;
  @IsUUID() employeeId!: string;
}

export class ListEmployeesDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100)
  limit = 25;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  after?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  departmentId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  userId?: string;
}

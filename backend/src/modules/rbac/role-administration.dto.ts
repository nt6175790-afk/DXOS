// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class MemberListQueryDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100)
  limit = 25;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  after?: string;
}

export class RoleListQueryDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100)
  limit = 25;

  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  after?: string;
}

export class AssignRoleDto {
  @IsUUID()
  roleId!: string;
}

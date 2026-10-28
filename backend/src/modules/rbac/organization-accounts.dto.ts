// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PERMISSIONS } from './permission-catalog';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class AccountListDto {
  @IsOptional() @IsUUID('4') after?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100) limit = 25;
}
export class CreateOrganizationUserDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @Length(3, 320) email!: string;
  @IsString() @Length(16, 128) password!: string;
  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u) displayName!: string;
}
export class UpdateOrganizationUserDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u) displayName?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED']) membershipStatus?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}
export class CreateOrganizationRoleDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{1,62}$/) key!: string;
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsIn(Object.values(PERMISSIONS), { each: true }) permissionKeys!: string[];
}
export class UpdateOrganizationRoleDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @Transform(trim) @IsString() @Length(1, 100) name?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsBoolean() isActive?: boolean;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsIn(Object.values(PERMISSIONS), { each: true }) permissionKeys?: string[];
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { LeaveStatus, LeaveType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateBy } from 'class-validator';
import { isTaskTimestamp } from '../work/task-policy';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const timestamp = () => ValidateBy({ name: 'leaveTimestamp', validator: { validate: isTaskTimestamp } });

export class CreateLeaveRequestDto {
  @IsUUID()
  employeeId!: string;

  @IsEnum(LeaveType)
  leaveType!: LeaveType;

  @timestamp()
  startsAt!: string;

  @timestamp()
  endsAt!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 500)
  @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  reason!: string;
}

export class ListLeaveRequestsDto {
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  mine?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsUUID()
  after?: string;
}

export class ApproveLeaveRequestDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  note?: string;
}

export class RejectLeaveRequestDto {
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  reason!: string;
}

export class CancelLeaveRequestDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  reason?: string;
}

export class LeaveParamDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  leaveId!: string;
}

export class EmptyLeaveQueryDto {}

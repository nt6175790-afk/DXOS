// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { ApprovalRequestType, ApprovalStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateBy } from 'class-validator';
import { isTaskTimestamp } from '../work/task-policy';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const timestamp = () => ValidateBy({ name: 'approvalTimestamp', validator: { validate: isTaskTimestamp } });

export class CreateAttendanceAdjustmentDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate!: string;

  @timestamp()
  targetCheckInAt!: string;

  @IsOptional()
  @timestamp()
  targetCheckOutAt?: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @Transform(trim)
  @IsString()
  @Length(3, 1000)
  @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  reason!: string;
}

export class ListApprovalsQueryDto {
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @IsOptional()
  @IsEnum(ApprovalRequestType)
  type?: ApprovalRequestType;

  @IsOptional()
  @IsUUID()
  requesterId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  mine?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  pending?: boolean;

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

export class ApproveRequestDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  note?: string;
}

export class RejectRequestDto {
  @Transform(trim)
  @IsString()
  @Length(3, 1000)
  @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  reason!: string;
}

export class CancelRequestDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  @Matches(/^(?:\P{Cc}|\n|\t)+$/u)
  reason?: string;
}

export class ApprovalParamDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  approvalId!: string;
}

export class EmptyApprovalQueryDto {}

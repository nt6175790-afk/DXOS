// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { AttendanceStatus } from '@prisma/client';
import { IsDefined, IsISO8601, IsNumber, ValidateNested } from 'class-validator';

export class AttendancePositionDto {
  @IsNumber() @Min(-90) @Max(90)
  latitude!: number;

  @IsNumber() @Min(-180) @Max(180)
  longitude!: number;

  @IsNumber() @Min(0) @Max(50)
  accuracyMeters!: number;

  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  capturedAt!: string;
}

export class AttendanceLocationDto {
  @IsString() @MaxLength(120) @Matches(/\S/)
  label!: string;

  @IsNumber() @Min(-90) @Max(90)
  latitude!: number;

  @IsNumber() @Min(-180) @Max(180)
  longitude!: number;
}

export class AttendanceOrgParamDto {
  @IsUUID()
  organizationId!: string;
}

export class CheckInDto {
  @IsDefined() @ValidateNested() @Type(() => AttendancePositionDto)
  location!: AttendancePositionDto;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CheckOutDto {
  @IsDefined() @ValidateNested() @Type(() => AttendancePositionDto)
  location!: AttendancePositionDto;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListAttendanceDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'workDate must be in YYYY-MM-DD format' })
  workDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be in YYYY-MM-DD format' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be in YYYY-MM-DD format' })
  to?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(String(value), 10) : 25))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;

  @IsOptional()
  @IsUUID()
  after?: string;
}

export class AttendanceSummaryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be in YYYY-MM-DD format' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be in YYYY-MM-DD format' })
  to?: string;
}

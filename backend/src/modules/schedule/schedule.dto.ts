// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ScheduleOrgParamDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;
}

export class ScheduleParamDto extends ScheduleOrgParamDto {
  @IsString()
  @IsNotEmpty()
  scheduleId!: string;
}

export class EmployeeScheduleParamDto extends ScheduleOrgParamDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;
}

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsOptional()
  @IsString()
  shiftId?: string;

  // Single date assignment
  @IsOptional()
  @IsDateString()
  workDate?: string;

  // Batch date range assignment
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  @IsOptional()
  @IsBoolean()
  isOff?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  shiftId?: string;

  @IsOptional()
  @IsBoolean()
  isOff?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListSchedulesDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;
}

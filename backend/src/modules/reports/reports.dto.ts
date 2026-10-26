// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { AttendanceStatus, EmployeeStatus, LeaveStatus, PayrollPeriodStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class ReportQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo!: string;
  @IsOptional() @IsIn(['day', 'week', 'month']) interval: 'day' | 'week' | 'month' = 'day';
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsEnum(EmployeeStatus) employeeStatus?: EmployeeStatus;
  @IsOptional() @IsEnum(AttendanceStatus) attendanceStatus?: AttendanceStatus;
  @IsOptional() @IsEnum(LeaveStatus) leaveStatus?: LeaveStatus;
  @IsOptional() @IsEnum(PayrollPeriodStatus) payrollStatus: PayrollPeriodStatus = 'FINALIZED';
  @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100) limit: number = 25;
  @IsOptional() @IsUUID() after?: string;
}

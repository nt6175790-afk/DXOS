// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { PayrollPeriodStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePayrollPeriodDto {
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodStart!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodEnd!: string;
}

export class RequestPayrollApprovalDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  reason?: string;
}

export class FinalizePayrollDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  notes?: string;
}

export class ListPayrollPeriodQueryDto {
  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;
}

export class ListPayrollRecordQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

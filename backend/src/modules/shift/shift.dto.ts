// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ShiftOrgParamDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;
}

export class ShiftParamDto extends ShiftOrgParamDto {
  @IsString()
  @IsNotEmpty()
  shiftId!: string;
}

export class CreateShiftDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã ca chỉ gồm chữ cái, số, dấu gạch ngang hoặc gạch dưới' })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: 'Giờ bắt đầu không đúng định dạng HH:mm hoặc HH:mm:ss' })
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: 'Giờ kết thúc không đúng định dạng HH:mm hoặc HH:mm:ss' })
  endTime!: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: 'Giờ bắt đầu nghỉ không đúng định dạng HH:mm' })
  breakStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: 'Giờ kết thúc nghỉ không đúng định dạng HH:mm' })
  breakEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  gracePeriodMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã ca chỉ gồm chữ cái, số, dấu gạch ngang hoặc gạch dưới' })
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  endTime?: string;

  @IsOptional()
  @IsString()
  breakStart?: string;

  @IsOptional()
  @IsString()
  breakEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  gracePeriodMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ListShiftsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;
}

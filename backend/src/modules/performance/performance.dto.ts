// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform, Type } from 'class-transformer';
import {
  PerformanceCycleStatus,
  PerformanceGoalStatus,
  PerformanceReviewStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateReviewCycleDto {
  @Transform(trim)
  @IsString()
  @Length(2, 150)
  name!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  description?: string;
}

export class UpdateReviewCycleDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 150)
  name?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  description?: string;

  @IsOptional()
  @IsEnum(PerformanceCycleStatus)
  status?: PerformanceCycleStatus;
}

export class CreateGoalDto {
  @IsUUID()
  cycleId!: string;

  @IsUUID()
  employeeId!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsEnum(PerformanceGoalStatus)
  status?: PerformanceGoalStatus;
}

export class UpdateGoalDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsEnum(PerformanceGoalStatus)
  status?: PerformanceGoalStatus;
}

export class CreateKpiDto {
  @IsUUID()
  cycleId!: string;

  @IsUUID()
  employeeId!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 200)
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  targetValue!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualValue?: number;

  @Transform(trim)
  @IsString()
  @Length(1, 50)
  unit!: string;
}

export class UpdateKpiDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  targetValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualValue?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  unit?: string;
}

export class CreateReviewDto {
  @IsUUID()
  cycleId!: string;

  @IsUUID()
  employeeId!: string;

  @IsUUID()
  reviewerId!: string;
}

export class SubmitSelfAssessmentDto {
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  selfAssessment!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  selfRating!: number;
}

export class SubmitManagerReviewDto {
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  managerReview!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  managerRating!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  summaryFeedback?: string;
}

export class CompleteReviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  finalRating?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  summaryFeedback?: string;
}

export class ListCycleQueryDto {
  @IsOptional()
  @IsEnum(PerformanceCycleStatus)
  status?: PerformanceCycleStatus;
}

export class ListGoalQueryDto {
  @IsOptional()
  @IsUUID()
  cycleId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class ListKpiQueryDto {
  @IsOptional()
  @IsUUID()
  cycleId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class ListReviewQueryDto {
  @IsOptional()
  @IsUUID()
  cycleId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsEnum(PerformanceReviewStatus)
  status?: PerformanceReviewStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mine?: boolean;
}

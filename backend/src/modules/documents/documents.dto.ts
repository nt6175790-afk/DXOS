// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform, Type } from 'class-transformer';
import {
  DocumentCategory,
  DocumentSensitivity,
  DocumentStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
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

export class CreateDocumentDto {
  @IsUUID()
  employeeId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  documentNumber?: string;

  @IsEnum(DocumentCategory)
  category!: DocumentCategory;

  @IsOptional()
  @IsEnum(DocumentSensitivity)
  sensitivity?: DocumentSensitivity;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issueDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expiryDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  notes?: string;

  @IsUUID()
  fileId!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  changeSummary?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  documentNumber?: string;

  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @IsOptional()
  @IsEnum(DocumentSensitivity)
  sensitivity?: DocumentSensitivity;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issueDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expiryDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

export class CreateDocumentVersionDto {
  @IsUUID()
  fileId!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  changeSummary?: string;
}

export class DocumentQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsEnum(DocumentSensitivity)
  sensitivity?: DocumentSensitivity;

  @IsOptional()
  @Transform(trim)
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  expiringSoon?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class CreateRequirementDto {
  @IsEnum(DocumentCategory)
  category!: DocumentCategory;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsUUID()
  applicableDepartmentId?: string;
}

export class UpdateRequirementDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsUUID()
  applicableDepartmentId?: string;
}

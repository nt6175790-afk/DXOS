// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { WORKFLOW_STATUS } from './workflow.types';

export class ListWorkflowInstancesDto {
  @IsOptional()
  @IsIn(Object.values(WORKFLOW_STATUS))
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateWorkflowInstanceDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID('4')
  workflowDefinitionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsString()
  @IsOptional()
  entityType?: string;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class ConfirmWorkflowStepDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  comments?: string;

  @IsOptional()
  @IsObject()
  resultPayload?: Record<string, unknown>;
}

export class CancelWorkflowDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason?: string;
}

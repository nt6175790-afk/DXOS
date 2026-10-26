// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AutomationAction, AutomationCondition } from './automation.types';

export class CreateAutomationRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trigger!: string;

  @IsArray()
  conditions!: AutomationCondition[];

  @IsArray()
  actions!: AutomationAction[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateAutomationRuleDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  trigger?: string;

  @IsArray()
  @IsOptional()
  conditions?: AutomationCondition[];

  @IsArray()
  @IsOptional()
  actions?: AutomationAction[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class RunAutomationDto {
  @IsString()
  @IsOptional()
  trigger?: string;
}

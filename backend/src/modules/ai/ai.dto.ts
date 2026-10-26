// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AI_LIMITS } from './ai-policy';

export class AiMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';
  @IsString()
  @Matches(/\S/)
  @MaxLength(AI_LIMITS.messageChars)
  content!: string;
}
export class AiMetadataDto {
  @IsIn(['general'])
  purpose!: 'general';
}
export class GenerateAiDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(AI_LIMITS.messages)
  @ValidateNested({ each: true })
  @Type(() => AiMessageDto)
  messages!: AiMessageDto[];
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/)
  model?: string;
  @IsInt()
  @Min(1)
  @Max(AI_LIMITS.outputTokens)
  maxOutputTokens: number = AI_LIMITS.defaultOutputTokens;
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(2)
  temperature: number = 0;
  @IsOptional()
  @ValidateNested()
  @Type(() => AiMetadataDto)
  metadata?: AiMetadataDto;
}
export class EmptyAiQuery {}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Equals, IsString, Length, Matches } from 'class-validator';
import { CreateTaskDto } from '../work/task.dto';
export class ProposeAiTaskDto {
  @IsString() @Length(3, 2000) @Matches(/\S/) prompt!: string;
}
export class ConfirmAiTaskDto extends CreateTaskDto {
  @Equals(true) confirm!: true;
}
export class SearchKnowledgeDto {
  @IsString() @Length(2, 200) @Matches(/\S/) query!: string;
}

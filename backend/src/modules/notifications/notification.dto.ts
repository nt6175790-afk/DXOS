// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class NotificationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsUUID()
  after?: string;

  @IsOptional()
  @IsIn(['read', 'unread'])
  state?: 'read' | 'unread';

  @IsOptional()
  @IsIn(['work', 'organization', 'other'])
  category?: 'work' | 'organization' | 'other';
}

export class MarkNotificationReadDto {}
export class EmptyNotificationQueryDto {}

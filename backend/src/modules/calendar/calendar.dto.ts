// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Transform } from 'class-transformer';
import { CalendarEventKind, CalendarEventStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsString, IsUUID, Length, Matches, Max, Min, ValidateBy, ValidateIf } from 'class-validator';
import { isTaskTimestamp } from '../work/task-policy';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const timestamp = () => ValidateBy({ name: 'calendarTimestamp', validator: { validate: isTaskTimestamp } });
export class CalendarQueryDto {
  @timestamp() from!: string;
  @timestamp() until!: string;
  @IsIn(['all', 'tasks', 'events']) type: 'all' | 'tasks' | 'events' = 'all';
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100) limit = 50;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID() after?: string;
}
class OptionalEventFieldsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @Length(1, 4000) @Matches(/^(?:\P{Cc}|\n|\t)+$/u) description?: string | null;
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u) location?: string | null;
}
export class CreateCalendarEventDto extends OptionalEventFieldsDto {
  @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u) title!: string;
  @IsEnum(CalendarEventKind) kind!: CalendarEventKind;
  @timestamp() startsAt!: string;
  @timestamp() endsAt!: string;
}
export class UpdateCalendarEventDto extends OptionalEventFieldsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @Transform(trim) @IsString() @Length(1, 200) @Matches(/^\P{Cc}+$/u) title?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(CalendarEventKind) kind?: CalendarEventKind;
  @ValidateIf((_object, value: unknown) => value !== undefined) @timestamp() startsAt?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @timestamp() endsAt?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(CalendarEventStatus) status?: CalendarEventStatus;
}
export class CalendarEventIdDto { @IsUUID() organizationId!: string; @IsUUID() eventId!: string }
export class EmptyCalendarQueryDto {}

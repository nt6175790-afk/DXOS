import { Injectable } from '@nestjs/common';
import { CalendarService } from '../../calendar/calendar.service';
import type { CalendarQueryDto } from '../../calendar/calendar.dto';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { PeriodArgs, periodSchema, rangeView, resolveRange } from '../agent/period';
import { formatVnDateTime } from '../agent/vn-time';
import { clip, LimitArg, limitOf, limitSchema, objectSchema } from './tool.types';
import type { AiCitation, AiTool, ToolContext, ToolOutcome } from './tool.types';

const PERIOD = { fallback: 'this_week', maxDays: 62 } as const;

export class ListCalendarEventsArgs extends PeriodArgs {
  @LimitArg() limit?: number;
}

@Injectable()
export class ListCalendarEventsTool implements AiTool<ListCalendarEventsArgs> {
  readonly name = 'list_calendar_events';
  readonly description = 'Meetings and events in a period (Vietnam time), plus task deadlines falling in it when the user may read tasks. ' +
    'Default this_week; max 62 days.';
  readonly parameters = objectSchema({
    ...periodSchema(PERIOD.fallback, PERIOD.maxDays),
    limit: limitSchema(15, 20, 'Per list. '),
  });
  readonly argsType = ListCalendarEventsArgs;
  readonly requiredPermissions = [PERMISSIONS.CALENDAR_READ];

  constructor(private readonly calendar: CalendarService) {}

  async execute(args: ListCalendarEventsArgs, context: ToolContext): Promise<ToolOutcome> {
    const range = resolveRange(args, context.now, PERIOD.fallback, PERIOD.maxDays);
    const limit = limitOf(args.limit, 15, 20);
    const result = await this.calendar.list(context.userId, context.organizationId, {
      from: range.startUtc.toISOString(), until: range.endUtc.toISOString(), type: 'all', limit,
    } as CalendarQueryDto);
    const events = (result.events?.items ?? []).map((e) => ({
      id: e.id, title: clip(e.title, 160), kind: e.kind, status: e.status,
      starts: formatVnDateTime(e.startsAt), ends: formatVnDateTime(e.endsAt), location: e.location ? clip(e.location, 120) : null,
    }));
    const deadlines = (result.tasks?.items ?? []).map((t) => ({
      id: t.id, title: clip(t.title, 160), status: t.status, priority: t.priority, due: t.dueAt ? formatVnDateTime(t.dueAt) : null,
    }));
    const data = {
      range: rangeView(range),
      events, moreEvents: Boolean(result.events?.nextCursor),
      taskDeadlines: result.tasks ? deadlines : null, moreTaskDeadlines: Boolean(result.tasks?.nextCursor),
    };
    if (!events.length && !deadlines.length) return { status: 'EMPTY', data };
    const citations: AiCitation[] = [
      ...events.map((e): AiCitation => ({ type: 'event', id: e.id, label: e.title.slice(0, 120), href: '/calendar' })),
      ...deadlines.map((t): AiCitation => ({ type: 'task', id: t.id, label: t.title.slice(0, 120), href: `/tasks/${t.id}` })),
    ];
    return { status: 'OK', data, citations };
  }
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import type { CalendarQueryDto, CreateCalendarEventDto, UpdateCalendarEventDto } from './calendar.dto';

const eventProjection = { id: true, title: true, description: true, kind: true, startsAt: true, endsAt: true, location: true, status: true, createdAt: true, updatedAt: true } satisfies Prisma.CalendarEventSelect;
const taskProjection = { id: true, title: true, status: true, priority: true, dueAt: true, progressPercent: true } satisfies Prisma.TaskSelect;
function page<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit); return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}
function interval(startsAt: Date, endsAt: Date, maxDays: number) {
  const duration = endsAt.getTime() - startsAt.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > maxDays * 86400000) throw new BadRequestException();
}
@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService, private readonly audit: AuditService) {}
  list(actor: string, organizationId: string, query: CalendarQueryDto) {
    return this.transaction(actor, organizationId, null, async (tx) => {
      const grants = await this.authorization.effectivePermissions(actor, organizationId, tx);
      if (!grants) throw new ForbiddenException();
      const tasks = grants.includes(PERMISSIONS.TASK_READ); const events = grants.includes(PERMISSIONS.CALENDAR_READ);
      if ((!tasks && !events) || (query.type === 'tasks' && !tasks) || (query.type === 'events' && !events)) throw new ForbiddenException();
      const from = new Date(query.from); const until = new Date(query.until); interval(from, until, 62);
      if (query.type === 'all' && query.after) throw new BadRequestException();
      return {
        tasks: tasks && query.type !== 'events' ? await this.tasks(tx, organizationId, from, until, query) : null,
        events: events && query.type !== 'tasks' ? await this.events(tx, organizationId, from, until, query) : null,
      };
    });
  }
  create(actor: string, organizationId: string, input: CreateCalendarEventDto) {
    return this.transaction(actor, organizationId, PERMISSIONS.CALENDAR_CREATE, async (tx) => {
      const startsAt = new Date(input.startsAt); const endsAt = new Date(input.endsAt); interval(startsAt, endsAt, 31);
      const event = await tx.calendarEvent.create({ data: { organizationId, createdByUserId: actor, title: input.title,
        kind: input.kind, startsAt, endsAt, description: input.description ?? null, location: input.location ?? null }, select: eventProjection });
      await this.audit.record({ event: AUDIT_EVENTS.CALENDAR_EVENT_CREATED, organizationId, actorUserId: actor, resourceId: event.id }, tx);
      return event;
    });
  }
  update(actor: string, organizationId: string, eventId: string, input: UpdateCalendarEventDto) {
    return this.transaction(actor, organizationId, PERMISSIONS.CALENDAR_UPDATE, async (tx) => {
      if (!Object.values(input).some((value) => value !== undefined)) throw new BadRequestException();
      const where = { organizationId_id: { organizationId, id: eventId } };
      const existing = await tx.calendarEvent.findUnique({ where, select: eventProjection });
      if (!existing) throw new NotFoundException();
      const startsAt = input.startsAt === undefined ? existing.startsAt : new Date(input.startsAt);
      const endsAt = input.endsAt === undefined ? existing.endsAt : new Date(input.endsAt); interval(startsAt, endsAt, 31);
      const data = { title: input.title, kind: input.kind, startsAt, endsAt, description: input.description, location: input.location, status: input.status };
      const changed = Object.entries(data).some(([key, value]) => {
        const previous = existing[key as keyof typeof existing];
        return value !== undefined && (value instanceof Date && previous instanceof Date ? value.getTime() !== previous.getTime() : value !== previous);
      });
      if (!changed) return existing;
      if (existing.status === 'CANCELLED') throw new ConflictException();
      const event = await tx.calendarEvent.update({ where, data, select: eventProjection });
      await this.audit.record({ event: AUDIT_EVENTS.CALENDAR_EVENT_UPDATED, organizationId, actorUserId: actor, resourceId: event.id }, tx);
      return event;
    });
  }
  private async tasks(tx: Prisma.TransactionClient, organizationId: string, from: Date, until: Date, query: CalendarQueryDto) {
    const scope = { organizationId, dueAt: { gte: from, lt: until }, status: { not: 'CANCELLED' as const } };
    const cursor = query.after ? await tx.task.findFirst({ where: { ...scope, id: query.after }, select: { id: true, dueAt: true } }) : null;
    if (query.after && !cursor) throw new BadRequestException();
    const rows = await tx.task.findMany({ where: { ...scope, ...(cursor ? { OR: [{ dueAt: { gt: cursor.dueAt! } }, { dueAt: cursor.dueAt, id: { gt: cursor.id } }] } : {}) },
      select: taskProjection, take: query.limit + 1, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }] });
    return page(rows, query.limit);
  }
  private async events(tx: Prisma.TransactionClient, organizationId: string, from: Date, until: Date, query: CalendarQueryDto) {
    const scope = { organizationId, startsAt: { lt: until }, endsAt: { gt: from } };
    const cursor = query.after ? await tx.calendarEvent.findFirst({ where: { ...scope, id: query.after }, select: { id: true, startsAt: true } }) : null;
    if (query.after && !cursor) throw new BadRequestException();
    const rows = await tx.calendarEvent.findMany({ where: { ...scope, ...(cursor ? { OR: [{ startsAt: { gt: cursor.startsAt } }, { startsAt: cursor.startsAt, id: { gt: cursor.id } }] } : {}) },
      select: eventProjection, take: query.limit + 1, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] });
    return page(rows, query.limit);
  }
  private async transaction<T>(actor: string, organizationId: string, permission: PermissionKey | null, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          if (permission && !(await this.authorization.can(actor, permission, organizationId, tx))) throw new ForbiddenException();
          return operation(tx);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 });
      } catch (error) {
        if (error instanceof ForbiddenException) await this.audit.record({ event: AUDIT_EVENTS.AUTHORIZATION_DENIED, actorUserId: actor, metadata: { reason: 'PERMISSION_DENIED' } });
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
}

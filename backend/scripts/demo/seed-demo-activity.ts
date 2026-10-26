// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../src/database/prisma.service';
import {
  calculateEarlyLeaveMinutes, calculateLateMinutes, calculateWorkedMinutes, getVietnamDateParts, VIETNAM_OFFSET_MS,
} from '../../src/modules/attendance/attendance.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AUDIT_EVENTS } from '../../src/modules/audit/audit-catalog';
import { LeaveService } from '../../src/modules/leave/leave.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { AuthorizationService } from '../../src/modules/rbac/authorization.service';
import { DEMO_ADMIN_EMAIL, DEMO_ORGANIZATION_SLUG, DEMO_PEOPLE, demoId } from './demo-fixtures';
import { DemoSeedError, localDemoDatabase } from './seed-demo-dataset';

const DAY = 86_400_000;
type PersonKey = (typeof DEMO_PEOPLE)[number]['key'];
/** [check-in, check-out | null] in Vietnam time, or null for "no record that day". */
type Pattern = Partial<Record<PersonKey, [string, string | null] | null>>;

/** Last three working days before today: most recent first (W1, W2, W3). */
const ATTENDANCE: Pattern[] = [
  { admin: ['08:55', '18:05'], an: ['09:25', '18:10'], anh: ['08:50', '17:00'], nam: ['08:58', null], ha: null },
  { admin: ['08:57', '18:02'], an: ['08:59', '18:00'], anh: ['09:12', '18:05'], nam: ['08:55', '18:01'], ha: ['08:50', '18:00'] },
  { admin: ['09:00', '18:00'], an: null, anh: ['08:54', '18:03'], nam: ['09:40', '18:30'], ha: ['08:56', '18:04'] },
];

const isWeekday = (date: Date) => ![0, 6].includes(date.getUTCDay());
const at = (day: Date, hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return new Date(day.getTime() + (h * 60 + m) * 60_000 - VIETNAM_OFFSET_MS); };
function workdays(from: Date, step: 1 | -1, count: number): Date[] {
  const days: Date[] = [];
  for (let d = new Date(from.getTime() + step * DAY); days.length < count; d = new Date(d.getTime() + step * DAY)) if (isWeekday(d)) days.push(d);
  return days;
}

/**
 * Local-only demo activity around "now" so the AI tools have something to find: three working days of attendance
 * (late, early leave, missing check-out, no check-in), leave requests created and approved through LeaveService
 * (so approvals, notifications, calendar entries and audit follow the real rules) and two upcoming meetings.
 * Idempotent per week: records keyed by date are created once; existing data and operator edits are kept.
 */
export async function seedDemoActivity(source: NodeJS.ProcessEnv, now = new Date()) {
  const db = new PrismaClient({ datasources: { db: { url: localDemoDatabase(source) } } });
  const prisma = db as unknown as PrismaService;
  const authorization = new AuthorizationService(prisma);
  const audit = new AuditService(prisma);
  const leaves = new LeaveService(prisma, authorization, audit, new NotificationService(prisma, authorization, audit));
  const created = { schedules: 0, attendance: 0, leaves: 0, approvedLeaves: 0, events: 0 };
  try {
    const organization = await db.organization.findUnique({ where: { slug: DEMO_ORGANIZATION_SLUG }, select: { id: true } });
    const admin = await db.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL }, select: { id: true } });
    if (!organization || !admin) throw new DemoSeedError('RUN_SEED_DEMO_FIRST');
    const org = organization.id;
    const shift = await db.shift.findUnique({ where: { organizationId_code: { organizationId: org, code: 'DEMO-DAY' } } });
    if (!shift?.isActive) throw new DemoSeedError('RUN_SEED_DEMO_FIRST');
    const people = new Map<PersonKey, { employeeId: string; userId: string }>();
    for (const person of DEMO_PEOPLE) {
      const employee = await db.employee.findFirst({ where: { organizationId: org, user: { email: person.email }, status: 'ACTIVE' },
        select: { id: true, userId: true } });
      if (employee) people.set(person.key, { employeeId: employee.id, userId: employee.userId });
    }
    const today = getVietnamDateParts(now).workDate;
    const past = workdays(today, -1, ATTENDANCE.length);
    const next = workdays(today, 1, 3);

    // 1. Schedules and attendance for the last three working days.
    for (const [index, day] of past.entries()) {
      for (const [key, times] of Object.entries(ATTENDANCE[index]) as [PersonKey, [string, string | null] | null][]) {
        const person = people.get(key);
        if (!person) continue;
        await db.$transaction(async (tx) => {
          const where = { organizationId_employeeId_workDate: { organizationId: org, employeeId: person.employeeId, workDate: day } };
          let schedule = await tx.workSchedule.findUnique({ where });
          if (!schedule) {
            schedule = await tx.workSchedule.create({ data: { id: demoId(org, 'schedule', person.employeeId + ':' + day.toISOString().slice(0, 10)),
              organizationId: org, employeeId: person.employeeId, workDate: day, shiftId: shift.id, notes: 'Lịch demo; quản lý có thể điều chỉnh.' } });
            await audit.record({ event: AUDIT_EVENTS.SCHEDULE_CREATED, organizationId: org, actorUserId: admin.id, resourceId: schedule.id }, tx);
            created.schedules++;
          }
          if (!times || schedule.isOff || schedule.shiftId !== shift.id) return;
          if (await tx.attendanceRecord.findUnique({ where })) return;
          const checkInAt = at(day, times[0]);
          const checkOutAt = times[1] ? at(day, times[1]) : null;
          const lateMinutes = calculateLateMinutes(checkInAt, shift, day);
          const record = await tx.attendanceRecord.create({ data: {
            id: demoId(org, 'attendance', person.employeeId + ':' + day.toISOString().slice(0, 10)), organizationId: org,
            employeeId: person.employeeId, shiftId: shift.id, workDate: day, checkInAt, checkOutAt,
            status: lateMinutes > 0 ? 'LATE' : 'PRESENT', lateMinutes,
            earlyLeaveMinutes: checkOutAt ? calculateEarlyLeaveMinutes(checkOutAt, shift, day) : 0,
            workedMinutes: checkOutAt ? calculateWorkedMinutes(checkInAt, checkOutAt, shift, day) : null,
          } });
          await audit.record({ event: AUDIT_EVENTS.ATTENDANCE_CHECK_IN, organizationId: org, actorUserId: person.userId, resourceId: record.id }, tx);
          if (checkOutAt) await audit.record({ event: AUDIT_EVENTS.ATTENDANCE_CHECK_OUT, organizationId: org, actorUserId: person.userId, resourceId: record.id }, tx);
          created.attendance++;
        });
      }
    }

    // 2. Leave requests through the real service: submitted by the employee, approved by the admin where stated.
    const plan: { key: PersonKey; type: 'SICK' | 'ANNUAL' | 'PERSONAL'; day: Date; from: string; to: string; reason: string; approve: boolean }[] = [
      { key: 'ha', type: 'SICK', day: past[0], from: '09:00', to: '18:00', reason: 'Nghỉ ốm (dữ liệu demo)', approve: true },
      { key: 'anh', type: 'ANNUAL', day: next[0], from: '09:00', to: '18:00', reason: 'Việc gia đình (dữ liệu demo)', approve: false },
      { key: 'nam', type: 'PERSONAL', day: next[2], from: '13:00', to: '18:00', reason: 'Làm giấy tờ cá nhân (dữ liệu demo)', approve: false },
    ];
    for (const item of plan) {
      const person = people.get(item.key);
      if (!person) continue;
      const startsAt = at(item.day, item.from);
      const existing = await db.leaveRequest.findFirst({ where: { organizationId: org, employeeId: person.employeeId, startsAt, reason: item.reason } });
      if (existing) continue;
      const leave = await leaves.create(person.userId, org, { employeeId: person.employeeId, leaveType: item.type,
        startsAt: startsAt.toISOString(), endsAt: at(item.day, item.to).toISOString(), reason: item.reason });
      created.leaves++;
      if (item.approve) {
        await leaves.approve(admin.id, org, leave.id, { note: 'Đã duyệt (dữ liệu demo)' });
        created.approvedLeaves++;
      }
    }

    // 3. Upcoming meetings.
    const meetings = [
      { key: 'giao-ban', day: next[0], from: '09:00', to: '09:30', title: 'Họp giao ban đầu tuần', location: 'Phòng họp 1' },
      { key: 'review-q4', day: next[2], from: '14:00', to: '15:00', title: 'Review tiến độ dự án Q4', location: 'Phòng họp 2' },
    ];
    for (const meeting of meetings) {
      const id = demoId(org, 'event', meeting.key + ':' + meeting.day.toISOString().slice(0, 10));
      if (await db.calendarEvent.findUnique({ where: { id } })) continue;
      await db.$transaction(async (tx) => {
        await tx.calendarEvent.create({ data: { id, organizationId: org, createdByUserId: admin.id, title: meeting.title, kind: 'MEETING',
          startsAt: at(meeting.day, meeting.from), endsAt: at(meeting.day, meeting.to), location: meeting.location } });
        await audit.record({ event: AUDIT_EVENTS.CALENDAR_EVENT_CREATED, organizationId: org, actorUserId: admin.id, resourceId: id }, tx);
      });
      created.events++;
    }
    return { created, today: today.toISOString().slice(0, 10), workdays: past.map((d) => d.toISOString().slice(0, 10)),
      upcoming: next.map((d) => d.toISOString().slice(0, 10)) };
  } finally {
    await db.$disconnect();
  }
}

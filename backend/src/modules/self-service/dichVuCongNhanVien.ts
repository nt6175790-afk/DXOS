import { ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceStatus, EmployeeStatus, LeaveStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import type { MyScheduleQueryDto } from './self-service.dto';

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function getVietnamNow(): {
  now: Date;
  year: number;
  month: number;
  day: number;
  todayDate: Date;
  yesterdayDate: Date;
  dayStartUtc: Date;
  dayEndUtc: Date;
} {
  const now = new Date();
  const local = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();

  const todayDate = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
  const dayStartUtc = new Date(todayDate.getTime() - VIETNAM_OFFSET_MS);
  const dayEndUtc = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - VIETNAM_OFFSET_MS);

  return { now, year, month, day, todayDate, yesterdayDate, dayStartUtc, dayEndUtc };
}

function parseDateOnly(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0));
}

const dayNamesVi = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

@Injectable()
export class SelfServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * The caller's own account name and employee profile for the AI assistant (read-only, no contact data). Scoped to
   * the route organization and the authenticated user; `employee` is null without an employee record there.
   */
  async profileForAssistant(organizationId: string, userId: string) {
    const [account, employee] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
      this.prisma.employee.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { employeeCode: true, displayName: true, jobTitle: true, department: { select: { name: true, parent: { select: { name: true } } } } },
      }),
    ]);
    return { accountName: account?.displayName ?? null, employee };
  }

  async getMyScheduleOverview(organizationId: string, userId: string, query: MyScheduleQueryDto) {
    const isMember = await this.authz.isActiveMember(userId, organizationId);
    if (!isMember) {
      throw new ForbiddenException('Bạn không phải thành viên của tổ chức này.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      include: {
        department: {
          select: { id: true, name: true, code: true },
        },
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    if (!employee || employee.status !== EmployeeStatus.ACTIVE) {
      return {
        isEmployee: false,
        employee: null,
        today: null,
        nextShift: null,
        schedules: [],
        attendanceRecords: [],
        leaveRequests: [],
        summary: {
          totalScheduledDays: 0,
          workedDays: 0,
          offDays: 0,
          leaveDays: 0,
          lateCount: 0,
          earlyLeaveCount: 0,
          totalWorkedMinutes: 0,
          totalWorkedHours: 0,
        },
      };
    }

    const { year, month, todayDate, yesterdayDate, dayStartUtc, dayEndUtc } = getVietnamNow();

    // 1. Determine query date range
    let startDate: Date;
    let endDate: Date;

    if (query.from && query.to) {
      startDate = parseDateOnly(query.from);
      const toParts = query.to.split('-').map(Number);
      endDate = new Date(Date.UTC(toParts[0], toParts[1] - 1, toParts[2], 23, 59, 59, 999));
    } else if (query.month) {
      const [y, m] = query.month.split('-').map(Number);
      startDate = new Date(Date.UTC(y, m - 1, 1));
      endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    } else {
      startDate = new Date(Date.UTC(year, month, 1));
      endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    }

    // 2. Fetch today's schedule, attendance, and approved leave
    const [todaySchedule, yesterdaySchedule, todayAttendance, yesterdayAttendance, todayLeave] =
      await Promise.all([
        this.prisma.workSchedule.findUnique({
          where: {
            organizationId_employeeId_workDate: {
              organizationId,
              employeeId: employee.id,
              workDate: todayDate,
            },
          },
          include: {
            shift: true,
          },
        }),
        this.prisma.workSchedule.findUnique({
          where: {
            organizationId_employeeId_workDate: {
              organizationId,
              employeeId: employee.id,
              workDate: yesterdayDate,
            },
          },
          include: {
            shift: true,
          },
        }),
        this.prisma.attendanceRecord.findUnique({
          where: {
            organizationId_employeeId_workDate: {
              organizationId,
              employeeId: employee.id,
              workDate: todayDate,
            },
          },
          include: {
            shift: true,
          },
        }),
        this.prisma.attendanceRecord.findUnique({
          where: {
            organizationId_employeeId_workDate: {
              organizationId,
              employeeId: employee.id,
              workDate: yesterdayDate,
            },
          },
          include: {
            shift: true,
          },
        }),
        this.prisma.leaveRequest.findFirst({
          where: {
            organizationId,
            employeeId: employee.id,
            status: LeaveStatus.APPROVED,
            startsAt: { lte: dayEndUtc },
            endsAt: { gte: dayStartUtc },
          },
        }),
      ]);

    // Check for ongoing overnight shift from yesterday
    let activeSchedule = todaySchedule;
    let activeAttendance = todayAttendance;

    if (
      !activeAttendance &&
      yesterdayAttendance &&
      !yesterdayAttendance.checkOutAt &&
      yesterdayAttendance.shift?.isOvernight
    ) {
      activeAttendance = yesterdayAttendance;
    }

    if (
      (!activeSchedule || activeSchedule.isOff) &&
      yesterdaySchedule &&
      !yesterdaySchedule.isOff &&
      yesterdaySchedule.shift?.isOvernight &&
      !yesterdayAttendance?.checkOutAt
    ) {
      activeSchedule = yesterdaySchedule;
    }

    // Calculate today's status
    let todayStatus = 'NO_SCHEDULE';
    if (todayLeave) {
      todayStatus = 'LEAVE';
    } else if (activeSchedule?.isOff) {
      todayStatus = 'OFF';
    } else if (activeSchedule?.shift) {
      if (activeAttendance) {
        if (activeAttendance.checkOutAt) {
          todayStatus = 'COMPLETED';
        } else if (activeAttendance.lateMinutes > 0 || activeAttendance.status === AttendanceStatus.LATE) {
          todayStatus = 'LATE';
        } else {
          todayStatus = 'CHECKED_IN';
        }
      } else {
        todayStatus = 'NOT_CHECKED_IN';
      }
    }

    const todayDayOfWeek = dayNamesVi[new Date(todayDate.getTime() + VIETNAM_OFFSET_MS).getUTCDay()];

    const todayInfo = {
      date: todayDate.toISOString().slice(0, 10),
      dayOfWeek: todayDayOfWeek,
      schedule: activeSchedule,
      shift: activeSchedule?.shift ?? null,
      isOff: activeSchedule?.isOff ?? false,
      attendance: activeAttendance,
      attendanceStatus: todayStatus,
      approvedLeave: todayLeave,
    };

    // 3. Find next shift (strictly in the future from now)
    const upcomingSchedules = await this.prisma.workSchedule.findMany({
      where: {
        organizationId,
        employeeId: employee.id,
        workDate: {
          gte: todayDate,
        },
        isOff: false,
        shiftId: { not: null },
      },
      include: {
        shift: true,
      },
      orderBy: { workDate: 'asc' },
      take: 5,
    });

    let nextShiftSchedule = null;
    for (const item of upcomingSchedules) {
      const itemDate = item.workDate ? new Date(item.workDate) : null;
      const isToday = itemDate && itemDate.getTime() === todayDate.getTime();
      if (isToday) {
        // If today's attendance already checked out or completed, skip today
        if (activeAttendance && activeAttendance.checkOutAt) {
          continue;
        }
        // If today hasn't checked out yet, today is next/current shift
        nextShiftSchedule = item;
        break;
      } else {
        nextShiftSchedule = item;
        break;
      }
    }

    const nextShift = nextShiftSchedule
      ? {
          date: nextShiftSchedule.workDate.toISOString().slice(0, 10),
          dayOfWeek:
            dayNamesVi[new Date(nextShiftSchedule.workDate.getTime() + VIETNAM_OFFSET_MS).getUTCDay()],
          shift: nextShiftSchedule.shift,
          notes: nextShiftSchedule.notes,
        }
      : null;

    // 4. Fetch schedules, attendance, leaves for the requested range
    const [schedules, attendanceRecords, leaveRequests] = await Promise.all([
      this.prisma.workSchedule.findMany({
        where: {
          organizationId,
          employeeId: employee.id,
          workDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          shift: true,
        },
        orderBy: { workDate: 'asc' },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          organizationId,
          employeeId: employee.id,
          workDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          shift: true,
        },
        orderBy: { workDate: 'asc' },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          organizationId,
          employeeId: employee.id,
          startsAt: { lte: endDate },
          endsAt: { gte: startDate },
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    // 5. Calculate monthly summary metrics
    const totalScheduledDays = schedules.filter((s) => !s.isOff && s.shiftId !== null).length;
    const offDays = schedules.filter((s) => s.isOff).length;
    const workedDays = attendanceRecords.length;
    const approvedLeaves = leaveRequests.filter((l) => l.status === LeaveStatus.APPROVED);
    const leaveDays = approvedLeaves.reduce((sum, l) => sum + (l.daysCount || 0), 0);
    const lateCount = attendanceRecords.filter(
      (a) => a.lateMinutes > 0 || a.status === AttendanceStatus.LATE,
    ).length;
    const earlyLeaveCount = attendanceRecords.filter((a) => a.earlyLeaveMinutes > 0).length;
    const totalWorkedMinutes = attendanceRecords.reduce((sum, a) => sum + (a.workedMinutes || 0), 0);
    const totalWorkedHours = Number((totalWorkedMinutes / 60).toFixed(1));

    return {
      isEmployee: true,
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        displayName: employee.displayName,
        jobTitle: employee.jobTitle,
        phone: employee.phone,
        email: employee.user?.email || null,
        status: employee.status,
        department: employee.department,
      },
      today: todayInfo,
      nextShift,
      schedules,
      attendanceRecords,
      leaveRequests,
      summary: {
        totalScheduledDays,
        workedDays,
        offDays,
        leaveDays,
        lateCount,
        earlyLeaveCount,
        totalWorkedMinutes,
        totalWorkedHours,
      },
    };
  }
}

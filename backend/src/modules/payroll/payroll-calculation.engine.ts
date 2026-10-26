// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AttendanceRecord,
  AttendanceStatus,
  CompensationProfile,
  Employee,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  Prisma,
  WorkSchedule,
} from '@prisma/client';

export interface EmployeePayrollInput {
  employee: Employee;
  compensation: CompensationProfile;
  attendanceRecords: AttendanceRecord[];
  approvedLeaves: LeaveRequest[];
  workSchedules: WorkSchedule[];
}

export interface CalculatedEmployeePayroll {
  employeeId: string;
  compensationProfileId: string;
  baseSalary: Prisma.Decimal;
  workingDays: Prisma.Decimal;
  workedDays: Prisma.Decimal;
  absentDays: Prisma.Decimal;
  paidLeaveDays: Prisma.Decimal;
  unpaidLeaveDays: Prisma.Decimal;
  overtimeMinutes: number;
  overtimeAmount: Prisma.Decimal;
  allowanceAmount: Prisma.Decimal;
  deductionAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  currency: string;
  items: Array<{
    type: 'EARNING' | 'ALLOWANCE' | 'OVERTIME' | 'DEDUCTION' | 'BONUS' | 'OTHER';
    name: string;
    amount: Prisma.Decimal;
    quantity?: Prisma.Decimal | null;
    unit?: string | null;
    notes?: string | null;
  }>;
}

export function calculateWorkingDays(
  periodStart: Date,
  periodEnd: Date,
  workSchedules: WorkSchedule[],
): number {
  let count = 0;
  const current = new Date(periodStart.getTime());
  current.setUTCHours(0, 0, 0, 0);

  let end = new Date(periodEnd.getTime());
  if (
    end.getUTCHours() === 0 &&
    end.getUTCMinutes() === 0 &&
    end.getUTCSeconds() === 0 &&
    end.getTime() > current.getTime()
  ) {
    end = new Date(end.getTime() - 1);
  }

  // Index schedules by YYYY-MM-DD
  const scheduleMap = new Map<string, WorkSchedule>();
  for (const ws of workSchedules) {
    const key = ws.workDate.toISOString().slice(0, 10);
    scheduleMap.set(key, ws);
  }

  while (current.getTime() <= end.getTime()) {
    const dateKey = current.toISOString().slice(0, 10);
    const schedule = scheduleMap.get(dateKey);

    if (schedule) {
      if (!schedule.isOff) {
        count += 1;
      }
    } else {
      // Default: Monday (1) to Friday (5) are working days
      const dayOfWeek = current.getUTCDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        count += 1;
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

export function calculateEmployeePayrollRecord(
  periodStart: Date,
  periodEnd: Date,
  input: EmployeePayrollInput,
): CalculatedEmployeePayroll {
  const { employee, compensation, attendanceRecords, approvedLeaves, workSchedules } = input;

  // 1. Working Days
  const workingDaysNum = calculateWorkingDays(periodStart, periodEnd, workSchedules);
  const workingDays = new Prisma.Decimal(workingDaysNum);

  // 2. Worked Days from Attendance
  let workedDaysNum = 0;
  const totalOvertimeMinutes = 0;

  for (const record of attendanceRecords) {
    if (
      record.status === AttendanceStatus.PRESENT ||
      record.status === AttendanceStatus.LATE
    ) {
      workedDaysNum += 1;
    } else if (record.status === AttendanceStatus.INCOMPLETE) {
      workedDaysNum += 0.5;
    }
  }
  const workedDays = new Prisma.Decimal(workedDaysNum);

  // 3. Leaves
  let paidLeaveDaysNum = 0;
  let unpaidLeaveDaysNum = 0;

  for (const leave of approvedLeaves) {
    if (leave.status === LeaveStatus.APPROVED) {
      if (leave.leaveType === LeaveType.UNPAID) {
        unpaidLeaveDaysNum += leave.daysCount;
      } else {
        paidLeaveDaysNum += leave.daysCount;
      }
    }
  }
  const paidLeaveDays = new Prisma.Decimal(paidLeaveDaysNum);
  const unpaidLeaveDays = new Prisma.Decimal(unpaidLeaveDaysNum);

  // 4. Absent Days
  const totalAccounted = workedDays.plus(paidLeaveDays).plus(unpaidLeaveDays);
  const diff = workingDays.minus(totalAccounted);
  const absentDays = diff.isPositive() ? diff : new Prisma.Decimal(0);

  // 5. Monetary Calculations with Prisma.Decimal
  const baseSalary = compensation.baseSalary;
  const currency = compensation.currency || 'VND';

  const dailyRate = workingDays.isZero()
    ? new Prisma.Decimal(0)
    : baseSalary.dividedBy(workingDays);

  const effectivePaidDays = workedDays.plus(paidLeaveDays);
  const earnedSalary = workingDays.isZero()
    ? new Prisma.Decimal(0)
    : dailyRate.times(effectivePaidDays).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const overtimeAmount = new Prisma.Decimal(0);
  const allowanceAmount = new Prisma.Decimal(0);
  const deductionAmount = new Prisma.Decimal(0);

  const grossAmount = earnedSalary.plus(overtimeAmount).plus(allowanceAmount);
  const netAmount = grossAmount.minus(deductionAmount);

  // 6. Generate Line Items
  const items: CalculatedEmployeePayroll['items'] = [
    {
      type: 'EARNING',
      name: 'Lương thời gian (Công thực tế & Nghỉ hưởng lương)',
      amount: earnedSalary,
      quantity: effectivePaidDays,
      unit: 'ngày công',
      notes: `Đơn giá: ${dailyRate.toFixed(2)} ${currency}/ngày (${effectivePaidDays.toFixed(1)}/${workingDays.toFixed(1)} ngày)`,
    },
  ];

  return {
    employeeId: employee.id,
    compensationProfileId: compensation.id,
    baseSalary,
    workingDays,
    workedDays,
    absentDays,
    paidLeaveDays,
    unpaidLeaveDays,
    overtimeMinutes: totalOvertimeMinutes,
    overtimeAmount,
    allowanceAmount,
    deductionAmount,
    grossAmount,
    netAmount,
    currency,
    items,
  };
}

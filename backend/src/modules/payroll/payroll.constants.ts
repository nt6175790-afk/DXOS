// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Prisma } from '@prisma/client';

export const compensationProfileProjection = {
  id: true,
  organizationId: true,
  employeeId: true,
  baseSalary: true,
  currency: true,
  effectiveFrom: true,
  effectiveTo: true,
  isActive: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      displayName: true,
      jobTitle: true,
      departmentId: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  },
} satisfies Prisma.CompensationProfileSelect;

export const payrollItemProjection = {
  id: true,
  payrollRecordId: true,
  type: true,
  name: true,
  amount: true,
  quantity: true,
  unit: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.PayrollItemSelect;

export const payrollRecordProjection = {
  id: true,
  organizationId: true,
  payrollPeriodId: true,
  employeeId: true,
  compensationProfileId: true,
  baseSalary: true,
  workingDays: true,
  workedDays: true,
  absentDays: true,
  paidLeaveDays: true,
  unpaidLeaveDays: true,
  overtimeMinutes: true,
  overtimeAmount: true,
  allowanceAmount: true,
  deductionAmount: true,
  grossAmount: true,
  netAmount: true,
  currency: true,
  calculatedAt: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      displayName: true,
      jobTitle: true,
      departmentId: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  },
  items: {
    select: payrollItemProjection,
  },
} satisfies Prisma.PayrollRecordSelect;

export const payrollPeriodProjection = {
  id: true,
  organizationId: true,
  name: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  totalGross: true,
  totalNet: true,
  employeeCount: true,
  calculatedAt: true,
  approvedAt: true,
  approvedById: true,
  finalizedAt: true,
  finalizedById: true,
  createdAt: true,
  updatedAt: true,
  approvedBy: {
    select: {
      id: true,
      displayName: true,
      employeeCode: true,
    },
  },
  finalizedBy: {
    select: {
      id: true,
      displayName: true,
      employeeCode: true,
    },
  },
} satisfies Prisma.PayrollPeriodSelect;

export type CompensationProfileResponse = Prisma.CompensationProfileGetPayload<{
  select: typeof compensationProfileProjection;
}>;

export type PayrollPeriodResponse = Prisma.PayrollPeriodGetPayload<{
  select: typeof payrollPeriodProjection;
}>;

export type PayrollRecordResponse = Prisma.PayrollRecordGetPayload<{
  select: typeof payrollRecordProjection;
}>;

export type PayrollItemResponse = Prisma.PayrollItemGetPayload<{
  select: typeof payrollItemProjection;
}>;

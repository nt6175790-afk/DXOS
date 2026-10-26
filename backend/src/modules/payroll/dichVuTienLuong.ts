// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalRequestType,
  ApprovalStatus,
  EmployeeStatus,
  LeaveStatus,
  PayrollPeriodStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { NotificationService } from '../notifications/notification.service';
import {
  calculateEmployeePayrollRecord,
  type CalculatedEmployeePayroll,
  type EmployeePayrollInput,
} from './payroll-calculation.engine';
import {
  payrollPeriodProjection,
  payrollRecordProjection,
  type PayrollPeriodResponse,
  type PayrollRecordResponse,
} from './payroll.constants';
import type {
  CreatePayrollPeriodDto,
  FinalizePayrollDto,
  ListPayrollPeriodQueryDto,
  ListPayrollRecordQueryDto,
  RequestPayrollApprovalDto,
} from './payroll.dto';

function parseDateOnly(dateStr: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  return new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr), 0, 0, 0));
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async createPeriod(
    actorUserId: string,
    organizationId: string,
    dto: CreatePayrollPeriodDto,
  ): Promise<PayrollPeriodResponse> {
    const canCreate =
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_CREATE, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId));

    if (!canCreate) {
      throw new ForbiddenException('You do not have permission to create payroll periods');
    }

    const periodStart = parseDateOnly(dto.periodStart);
    const periodEnd = parseDateOnly(dto.periodEnd);

    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException('periodEnd must be on or after periodStart');
    }

    // Check duplicate period name
    const existing = await this.prisma.payrollPeriod.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: dto.name,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Payroll period '${dto.name}' already exists in this organization`);
    }

    const created = await this.prisma.payrollPeriod.create({
      data: {
        organizationId,
        name: dto.name,
        periodStart,
        periodEnd,
        status: PayrollPeriodStatus.DRAFT,
      },
      select: payrollPeriodProjection,
    });

    await this.audit.record({
      event: AUDIT_EVENTS.PAYROLL_PERIOD_CREATED,
      organizationId,
      actorUserId,
      resourceId: created.id,
    });

    return created;
  }

  async calculatePeriod(
    actorUserId: string,
    organizationId: string,
    periodId: string,
  ): Promise<PayrollPeriodResponse> {
    const canCalculate =
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_CALCULATE, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId));

    if (!canCalculate) {
      throw new ForbiddenException('You do not have permission to calculate payroll');
    }

    const period = await this.prisma.payrollPeriod.findUnique({
      where: { organizationId_id: { organizationId, id: periodId } },
    });

    if (!period) {
      throw new NotFoundException('Payroll period not found');
    }

    if (period.status === PayrollPeriodStatus.FINALIZED) {
      throw new ConflictException('Cannot recalculate a finalized payroll period');
    }

    if (period.status === PayrollPeriodStatus.PENDING_APPROVAL) {
      throw new ConflictException('Payroll period is currently pending approval');
    }

    // 1. Batch fetch active employees
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        status: EmployeeStatus.ACTIVE,
      },
      include: {
        department: true,
      },
    });

    const employeeIds = employees.map((e) => e.id);

    // 2. Batch fetch active compensation profiles
    const compensationProfiles = await this.prisma.compensationProfile.findMany({
      where: {
        organizationId,
        employeeId: { in: employeeIds },
        isActive: true,
        effectiveFrom: { lte: period.periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.periodStart } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const compMap = new Map<string, (typeof compensationProfiles)[0]>();
    for (const comp of compensationProfiles) {
      if (!compMap.has(comp.employeeId)) {
        compMap.set(comp.employeeId, comp);
      }
    }

    // 3. Batch fetch attendance records in period
    const attendanceRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        organizationId,
        employeeId: { in: employeeIds },
        workDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
    });

    const attMap = new Map<string, typeof attendanceRecords>();
    for (const att of attendanceRecords) {
      const list = attMap.get(att.employeeId) || [];
      list.push(att);
      attMap.set(att.employeeId, list);
    }

    // 4. Batch fetch approved leaves in period
    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId,
        employeeId: { in: employeeIds },
        status: LeaveStatus.APPROVED,
        startsAt: { lte: new Date(period.periodEnd.getTime() + 24 * 60 * 60 * 1000) },
        endsAt: { gte: period.periodStart },
      },
    });

    const leaveMap = new Map<string, typeof leaves>();
    for (const leave of leaves) {
      const list = leaveMap.get(leave.employeeId) || [];
      list.push(leave);
      leaveMap.set(leave.employeeId, list);
    }

    // 5. Batch fetch work schedules in period
    const schedules = await this.prisma.workSchedule.findMany({
      where: {
        organizationId,
        employeeId: { in: employeeIds },
        workDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
    });

    const schedMap = new Map<string, typeof schedules>();
    for (const sched of schedules) {
      const list = schedMap.get(sched.employeeId) || [];
      list.push(sched);
      schedMap.set(sched.employeeId, list);
    }

    // 6. Perform calculation for each employee with compensation
    const calculatedRecords: CalculatedEmployeePayroll[] = [];
    let totalGross = new Prisma.Decimal(0);
    let totalNet = new Prisma.Decimal(0);

    for (const employee of employees) {
      const comp = compMap.get(employee.id);
      if (!comp) continue; // Skip employees without configured compensation profile

      const input: EmployeePayrollInput = {
        employee,
        compensation: comp,
        attendanceRecords: attMap.get(employee.id) || [],
        approvedLeaves: leaveMap.get(employee.id) || [],
        workSchedules: schedMap.get(employee.id) || [],
      };

      const record = calculateEmployeePayrollRecord(period.periodStart, period.periodEnd, input);
      calculatedRecords.push(record);
      totalGross = totalGross.plus(record.grossAmount);
      totalNet = totalNet.plus(record.netAmount);
    }

    // 7. Save in a transaction
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Clean up previous records if recalculating
      await tx.payrollRecord.deleteMany({
        where: {
          organizationId,
          payrollPeriodId: period.id,
        },
      });

      // Insert new records and items
      for (const rec of calculatedRecords) {
        await tx.payrollRecord.create({
          data: {
            organizationId,
            payrollPeriodId: period.id,
            employeeId: rec.employeeId,
            compensationProfileId: rec.compensationProfileId,
            baseSalary: rec.baseSalary,
            workingDays: rec.workingDays,
            workedDays: rec.workedDays,
            absentDays: rec.absentDays,
            paidLeaveDays: rec.paidLeaveDays,
            unpaidLeaveDays: rec.unpaidLeaveDays,
            overtimeMinutes: rec.overtimeMinutes,
            overtimeAmount: rec.overtimeAmount,
            allowanceAmount: rec.allowanceAmount,
            deductionAmount: rec.deductionAmount,
            grossAmount: rec.grossAmount,
            netAmount: rec.netAmount,
            currency: rec.currency,
            calculatedAt: now,
            items: {
              create: rec.items.map((it) => ({
                type: it.type,
                name: it.name,
                amount: it.amount,
                quantity: it.quantity ?? null,
                unit: it.unit ?? null,
                notes: it.notes ?? null,
              })),
            },
          },
        });
      }

      // Update period summary
      const updated = await tx.payrollPeriod.update({
        where: { organizationId_id: { organizationId, id: period.id } },
        data: {
          status: PayrollPeriodStatus.CALCULATED,
          totalGross,
          totalNet,
          employeeCount: calculatedRecords.length,
          calculatedAt: now,
        },
        select: payrollPeriodProjection,
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.PAYROLL_CALCULATED,
          organizationId,
          actorUserId,
          resourceId: period.id,
        },
        tx,
      );

      return updated;
    });
  }

  async requestApproval(
    actorUserId: string,
    organizationId: string,
    periodId: string,
    dto: RequestPayrollApprovalDto,
  ): Promise<PayrollPeriodResponse> {
    const canRequest =
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_CALCULATE, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId));

    if (!canRequest) {
      throw new ForbiddenException('You do not have permission to request payroll approval');
    }

    const requesterEmployee = await this.prisma.employee.findUnique({
      where: { organizationId_userId: { organizationId, userId: actorUserId } },
      select: { id: true, userId: true, displayName: true },
    });

    if (!requesterEmployee) {
      throw new NotFoundException('Employee profile not found for user');
    }

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.payrollPeriod.findUnique({
        where: { organizationId_id: { organizationId, id: periodId } },
      });

      if (!period) {
        throw new NotFoundException('Payroll period not found');
      }

      if (period.status !== PayrollPeriodStatus.CALCULATED) {
        throw new ConflictException(
          'Only calculated payroll periods can be submitted for approval',
        );
      }

      // Create unified ApprovalRequest
      const approval = await tx.approvalRequest.create({
        data: {
          organizationId,
          requesterId: requesterEmployee.id,
          type: ApprovalRequestType.PAYROLL,
          status: ApprovalStatus.PENDING,
          title: `Phê duyệt kỳ lương: ${period.name}`,
          reason: dto.reason || `Yêu cầu phê duyệt bảng lương ${period.name}`,
          referenceId: period.id,
          payload: {
            payrollPeriodId: period.id,
            name: period.name,
            totalGross: period.totalGross.toString(),
            totalNet: period.totalNet.toString(),
            employeeCount: period.employeeCount,
          },
        },
      });
      void approval;

      const updated = await tx.payrollPeriod.update({
        where: { organizationId_id: { organizationId, id: period.id } },
        data: {
          status: PayrollPeriodStatus.PENDING_APPROVAL,
        },
        select: payrollPeriodProjection,
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.PAYROLL_APPROVAL_REQUESTED,
          organizationId,
          actorUserId,
          resourceId: period.id,
        },
        tx,
      );

      return updated;
    });
  }

  async finalizePeriod(
    actorUserId: string,
    organizationId: string,
    periodId: string,
    dto: FinalizePayrollDto,
  ): Promise<PayrollPeriodResponse> {
    void dto;
    const canFinalize =
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_FINALIZE, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId));

    if (!canFinalize) {
      throw new ForbiddenException('You do not have permission to finalize payroll');
    }

    const actorEmployee = await this.prisma.employee.findUnique({
      where: { organizationId_userId: { organizationId, userId: actorUserId } },
      select: { id: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.payrollPeriod.findUnique({
        where: { organizationId_id: { organizationId, id: periodId } },
      });

      if (!period) {
        throw new NotFoundException('Payroll period not found');
      }

      if (period.status !== PayrollPeriodStatus.APPROVED) {
        throw new ConflictException(
          'Only approved payroll periods can be finalized. Current status: ' + period.status,
        );
      }

      const now = new Date();
      const updated = await tx.payrollPeriod.update({
        where: { organizationId_id: { organizationId, id: period.id } },
        data: {
          status: PayrollPeriodStatus.FINALIZED,
          finalizedAt: now,
          finalizedById: actorEmployee?.id ?? null,
        },
        select: payrollPeriodProjection,
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.PAYROLL_FINALIZED,
          organizationId,
          actorUserId,
          resourceId: period.id,
        },
        tx,
      );

      return updated;
    });
  }

  async listPeriods(
    actorUserId: string,
    organizationId: string,
    query: ListPayrollPeriodQueryDto,
  ): Promise<PayrollPeriodResponse[]> {
    const canRead =
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_READ, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId));

    if (!canRead) {
      throw new ForbiddenException('You do not have permission to view payroll periods');
    }

    return this.prisma.payrollPeriod.findMany({
      where: {
        organizationId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { periodStart: 'desc' },
      select: payrollPeriodProjection,
    });
  }

  async getPeriod(
    actorUserId: string,
    organizationId: string,
    periodId: string,
  ): Promise<PayrollPeriodResponse> {
    const canRead =
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_READ, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId));

    if (!canRead) {
      throw new ForbiddenException('You do not have permission to view payroll periods');
    }

    const period = await this.prisma.payrollPeriod.findUnique({
      where: { organizationId_id: { organizationId, id: periodId } },
      select: payrollPeriodProjection,
    });

    if (!period) {
      throw new NotFoundException('Payroll period not found');
    }

    return period;
  }

  async listRecords(
    actorUserId: string,
    organizationId: string,
    periodId: string,
    query: ListPayrollRecordQueryDto,
  ): Promise<PayrollRecordResponse[]> {
    const canRead =
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_READ, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId));

    if (!canRead) {
      throw new ForbiddenException('You do not have permission to view payroll records');
    }

    return this.prisma.payrollRecord.findMany({
      where: {
        organizationId,
        payrollPeriodId: periodId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      orderBy: { employee: { displayName: 'asc' } },
      select: payrollRecordProjection,
    });
  }

  async getRecord(
    actorUserId: string,
    organizationId: string,
    recordId: string,
  ): Promise<PayrollRecordResponse> {
    const record = await this.prisma.payrollRecord.findUnique({
      where: { organizationId_id: { organizationId, id: recordId } },
      select: payrollRecordProjection,
    });

    if (!record) {
      throw new NotFoundException('Payroll record not found');
    }

    const actorEmployee = await this.prisma.employee.findUnique({
      where: { organizationId_userId: { organizationId, userId: actorUserId } },
      select: { id: true },
    });

    const isSelf = actorEmployee?.id === record.employeeId;
    if (!isSelf) {
      const canRead =
        (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_READ, organizationId)) ||
        (await this.authz.can(actorUserId, PERMISSIONS.PAYROLL_MANAGE, organizationId));

      if (!canRead) {
        throw new ForbiddenException('You do not have permission to view this payroll record');
      }
    }

    return record;
  }

  async getMyPayroll(
    actorUserId: string,
    organizationId: string,
  ): Promise<PayrollRecordResponse[]> {
    const actorEmployee = await this.prisma.employee.findUnique({
      where: { organizationId_userId: { organizationId, userId: actorUserId } },
      select: { id: true },
    });

    if (!actorEmployee) {
      return [];
    }

    return this.prisma.payrollRecord.findMany({
      where: {
        organizationId,
        employeeId: actorEmployee.id,
        payrollPeriod: {
          status: { in: [PayrollPeriodStatus.APPROVED, PayrollPeriodStatus.FINALIZED] },
        },
      },
      orderBy: { payrollPeriod: { periodStart: 'desc' } },
      select: payrollRecordProjection,
    });
  }
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export const reportGrants = ['report:read', 'report:export', 'employee:read', 'department:read', 'attendance:read', 'attendance:manage', 'schedule:read', 'leave:read', 'leave:approve', 'payroll:read', 'performance:read', 'performance:manage', 'goal:read', 'kpi:read', 'organization:read'] as const;
export async function seedReports(db: PrismaClient, passwordHash = 'fixture-not-a-login-hash') {
  const suffix = randomUUID();
  const actor = await db.user.create({ data: { email: `reports-${suffix}@example.test`, displayName: 'Quản lý báo cáo', passwordHash } });
  const second = await db.user.create({ data: { email: `second-${suffix}@example.test`, displayName: 'Nhân viên riêng tư', passwordHash } });
  const foreign = await db.user.create({ data: { email: `foreign-${suffix}@example.test`, displayName: 'Foreign private user', passwordHash } });
  const org = await db.organization.create({ data: { name: 'Báo cáo thử nghiệm', slug: `reports-${suffix}` } });
  const foreignOrg = await db.organization.create({ data: { name: 'Foreign secret tenant', slug: `foreign-${suffix}` } });
  const member = await db.organizationMembership.create({ data: { organizationId: org.id, userId: actor.id } });
  await db.organizationMembership.createMany({ data: [{ organizationId: org.id, userId: second.id }, { organizationId: foreignOrg.id, userId: foreign.id }] });
  const role = await db.role.create({ data: { organizationId: org.id, name: 'Report operator', key: 'report-operator' } });
  await db.membershipRole.create({ data: { organizationId: org.id, membershipId: member.id, roleId: role.id } });
  for (const key of reportGrants) {
    const permission = await db.permission.upsert({ where: { key }, update: {}, create: { key, name: key } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const department = await db.department.create({ data: { organizationId: org.id, code: 'HR', name: 'Nhân sự & vận hành' } });
  const foreignDepartment = await db.department.create({ data: { organizationId: foreignOrg.id, code: 'SECRET', name: 'Foreign private department' } });
  const employee = await db.employee.create({ data: { organizationId: org.id, userId: actor.id, employeeCode: 'E1', displayName: 'Private employee name', departmentId: department.id, createdAt: new Date('2026-08-31T17:00:00Z') } });
  const employee2 = await db.employee.create({ data: { organizationId: org.id, userId: second.id, employeeCode: 'E2', displayName: 'Another private name', status: 'INACTIVE', createdAt: new Date('2026-08-31T16:59:59Z') } });
  const foreignEmployee = await db.employee.create({ data: { organizationId: foreignOrg.id, userId: foreign.id, employeeCode: 'F1', displayName: 'Foreign employee private', departmentId: foreignDepartment.id } });
  const shift = await db.shift.create({ data: { organizationId: org.id, code: 'DAY', name: 'Ca ngày', startTime: '08:00', endTime: '17:00' } });
  for (const day of [1, 2, 3]) await db.workSchedule.create({ data: { organizationId: org.id, employeeId: employee.id, shiftId: shift.id, workDate: new Date(`2026-09-0${day}T00:00:00Z`), isOff: day === 3 } });
  for (const [day, status, lateMinutes, earlyLeaveMinutes, workedMinutes] of [[1, 'PRESENT', 0, 0, 480], [2, 'LATE', 30, 10, 440], [3, 'INCOMPLETE', 0, 0, null], [4, 'ABSENT', 0, 0, null]] as const) {
    await db.attendanceRecord.create({ data: { organizationId: org.id, employeeId: employee.id, shiftId: shift.id, workDate: new Date(`2026-09-0${day}T00:00:00Z`), checkInAt: new Date(`2026-09-0${day}T01:00:00Z`), checkOutAt: workedMinutes === null ? null : new Date(`2026-09-0${day}T10:00:00Z`), status, lateMinutes, earlyLeaveMinutes, workedMinutes, note: 'private attendance note' } });
  }
  for (const [status, startsAt, daysCount] of [['APPROVED', '2026-08-31T17:00:00Z', 0.5], ['PENDING', '2026-09-02T01:00:00Z', 2], ['REJECTED', '2026-09-03T01:00:00Z', 1], ['CANCELLED', '2026-09-04T01:00:00Z', 1], ['APPROVED', '2026-08-31T16:59:59Z', 9]] as const) {
    await db.leaveRequest.create({ data: { organizationId: org.id, employeeId: employee.id, createdByUserId: actor.id, leaveType: 'ANNUAL', status, startsAt: new Date(startsAt), endsAt: new Date('2026-10-02T01:00:00Z'), daysCount, reason: 'private medical reason', reviewerNote: 'private reviewer note' } });
  }
  const period = await db.payrollPeriod.create({ data: { organizationId: org.id, name: 'Tháng 9', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30'), status: 'FINALIZED', finalizedAt: new Date('2026-09-30') } });
  const payrollData = { organizationId: org.id, payrollPeriodId: period.id, employeeId: employee.id, baseSalary: '9000000.11', workingDays: 22, workedDays: 20, absentDays: 0, paidLeaveDays: 2, unpaidLeaveDays: 0, grossAmount: '10000000.11', netAmount: '9000000.01', currency: 'VND' };
  await db.payrollRecord.create({ data: payrollData });
  await db.payrollRecord.create({ data: { ...payrollData, employeeId: employee2.id, grossAmount: '10000000.22', netAmount: '9000000.02' } });
  const foreignPeriod = await db.payrollPeriod.create({ data: { organizationId: foreignOrg.id, name: 'Foreign payroll', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30'), status: 'FINALIZED' } });
  await db.payrollRecord.create({ data: { ...payrollData, organizationId: foreignOrg.id, payrollPeriodId: foreignPeriod.id, employeeId: foreignEmployee.id, netAmount: '999999999.99' } });
  const cycle = await db.performanceReviewCycle.create({ data: { organizationId: org.id, name: 'Quý 3', startDate: new Date('2026-07-01'), endDate: new Date('2026-09-30') } });
  await db.performanceReview.create({ data: { organizationId: org.id, cycleId: cycle.id, employeeId: employee.id, reviewerId: employee2.id, status: 'COMPLETED', finalRating: 4, selfAssessment: 'private assessment', summaryFeedback: 'private feedback' } });
  await db.performanceReview.create({ data: { organizationId: org.id, cycleId: cycle.id, employeeId: employee2.id, reviewerId: employee.id, status: 'DRAFT', finalRating: 1 } });
  await db.performanceGoal.create({ data: { organizationId: org.id, cycleId: cycle.id, employeeId: employee.id, title: 'private goal title', progress: 75 } });
  await db.performanceKpi.create({ data: { organizationId: org.id, cycleId: cycle.id, employeeId: employee.id, name: 'Private KPI', unit: '%', targetValue: 100, actualValue: 80, score: 4 } });
  return { actor, second, foreign, org, foreignOrg, department, foreignDepartment, employee, employee2, foreignEmployee, role, member, period, foreignPeriod, payrollData };
}
export async function removeReportsFixture(db: PrismaClient, seed: Awaited<ReturnType<typeof seedReports>>) {
  const organizationId = { in: [seed.org.id, seed.foreignOrg.id] }, users = { in: [seed.actor.id, seed.second.id, seed.foreign.id] };
  await db.auditEvent.deleteMany({ where: { OR: [{ organizationId }, { actorUserId: users }] } });
  await db.performanceKpi.deleteMany({ where: { organizationId } }); await db.performanceGoal.deleteMany({ where: { organizationId } }); await db.performanceReview.deleteMany({ where: { organizationId } }); await db.performanceReviewCycle.deleteMany({ where: { organizationId } });
  await db.payrollRecord.deleteMany({ where: { organizationId } }); await db.payrollPeriod.deleteMany({ where: { organizationId } });
  await db.workSchedule.deleteMany({ where: { organizationId } }); await db.attendanceRecord.deleteMany({ where: { organizationId } }); await db.shift.deleteMany({ where: { organizationId } }); await db.leaveRequest.deleteMany({ where: { organizationId } }); await db.employee.deleteMany({ where: { organizationId } }); await db.department.deleteMany({ where: { organizationId } });
  await db.membershipRole.deleteMany({ where: { organizationId } }); await db.rolePermission.deleteMany({ where: { role: { organizationId } } }); await db.role.deleteMany({ where: { organizationId } }); await db.organizationMembership.deleteMany({ where: { organizationId } }); await db.organization.deleteMany({ where: { id: organizationId } }); await db.authSession.deleteMany({ where: { userId: users } }); await db.user.deleteMany({ where: { id: users } });
}

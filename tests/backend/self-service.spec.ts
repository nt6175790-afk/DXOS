// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ForbiddenException } from '@nestjs/common';
import { SelfServiceService } from '../../backend/src/modules/self-service/self-service.service';
import { AttendanceStatus, EmployeeStatus, LeaveStatus } from '@prisma/client';

describe('SelfServiceService Unit & Integration Tests', () => {
  let service: SelfServiceService;
  function createPrismaMock() { return {
      employee: {
        findUnique: jest.fn(),
      },
      workSchedule: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      attendanceRecord: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      leaveRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    }; }
  let prismaMock: ReturnType<typeof createPrismaMock>;
  function createAuthzMock() { return {
      isActiveMember: jest.fn().mockResolvedValue(true),
    }; }
  let authzMock: ReturnType<typeof createAuthzMock>;

  const mockOrgId = '00000000-0000-0000-0000-000000000001';
  const mockUserId = '00000000-0000-0000-0000-000000000002';
  const mockEmpId = '00000000-0000-0000-0000-000000000003';
  const mockShiftId = '00000000-0000-0000-0000-000000000004';

  const mockEmployee = {
    id: mockEmpId,
    organizationId: mockOrgId,
    userId: mockUserId,
    employeeCode: 'EMP-001',
    displayName: 'Nguyễn Văn Test',
    jobTitle: 'Chuyên viên Nhân sự',
    phone: '+84901234567',
    status: EmployeeStatus.ACTIVE,
    department: {
      id: 'dept-1',
      name: 'Phòng Nhân sự',
      code: 'HR',
    },
    user: {
      id: mockUserId,
      email: 'test.employee@dxos.local',
      displayName: 'Nguyễn Văn Test',
    },
  };

  const mockShift = {
    id: mockShiftId,
    organizationId: mockOrgId,
    name: 'Ca hành chính',
    code: 'HC',
    startTime: '08:00',
    endTime: '17:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    gracePeriodMinutes: 15,
    isOvernight: false,
    isActive: true,
  };

  beforeEach(() => {
    prismaMock = createPrismaMock();

    authzMock = createAuthzMock();

    service = new SelfServiceService(prismaMock as unknown as ConstructorParameters<typeof SelfServiceService>[0], authzMock as unknown as ConstructorParameters<typeof SelfServiceService>[1]);
  });

  describe('Security & Tenant Isolation', () => {
    it('throws ForbiddenException if user is not an active member of organization', async () => {
      authzMock.isActiveMember.mockResolvedValue(false);

      await expect(
        service.getMyScheduleOverview(mockOrgId, mockUserId, {}),
      ).rejects.toThrow(ForbiddenException);

      expect(authzMock.isActiveMember).toHaveBeenCalledWith(mockUserId, mockOrgId);
      expect(prismaMock.employee.findUnique).not.toHaveBeenCalled();
    });

    it('returns isEmployee: false if user does not have an employee profile in the org', async () => {
      prismaMock.employee.findUnique.mockResolvedValue(null);

      const result = await service.getMyScheduleOverview(mockOrgId, mockUserId, {});

      expect(result.isEmployee).toBe(false);
      expect(result.employee).toBeNull();
      expect(result.schedules).toEqual([]);
      expect(result.summary.totalScheduledDays).toBe(0);
    });

    it('scopes all queries strictly to organizationId and the authenticated user employeeId', async () => {
      prismaMock.employee.findUnique.mockResolvedValue(mockEmployee);
      prismaMock.workSchedule.findUnique.mockResolvedValue(null);
      prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);
      prismaMock.leaveRequest.findFirst.mockResolvedValue(null);
      prismaMock.workSchedule.findMany.mockResolvedValue([]);
      prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
      prismaMock.leaveRequest.findMany.mockResolvedValue([]);

      await service.getMyScheduleOverview(mockOrgId, mockUserId, { month: '2026-09' });

      // Verify employee query scoped by org and user
      expect(prismaMock.employee.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_userId: {
            organizationId: mockOrgId,
            userId: mockUserId,
          },
        },
        include: expect.any(Object),
      });

      // Verify list queries scoped to organizationId and employeeId
      expect(prismaMock.workSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrgId,
            employeeId: mockEmpId,
          }),
        }),
      );

      expect(prismaMock.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrgId,
            employeeId: mockEmpId,
          }),
        }),
      );
    });
  });

  describe('Today & Next Shift Resolution', () => {
    it('resolves OFF status when today schedule is marked isOff', async () => {
      prismaMock.employee.findUnique.mockResolvedValue(mockEmployee);
      prismaMock.workSchedule.findUnique.mockImplementation(({ where }: { where: { organizationId_employeeId_workDate: { workDate: Date } } }) => {
        return Promise.resolve({
          id: 'sched-today',
          workDate: where.organizationId_employeeId_workDate.workDate,
          isOff: true,
          shiftId: null,
          shift: null,
        });
      });
      prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);
      prismaMock.leaveRequest.findFirst.mockResolvedValue(null);
      prismaMock.workSchedule.findMany.mockResolvedValue([]);
      prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
      prismaMock.leaveRequest.findMany.mockResolvedValue([]);

      const result = await service.getMyScheduleOverview(mockOrgId, mockUserId, {});

      expect(result.today!.isOff).toBe(true);
      expect(result.today!.attendanceStatus).toBe('OFF');
    });

    it('resolves LEAVE status when employee has approved leave today', async () => {
      prismaMock.employee.findUnique.mockResolvedValue(mockEmployee);
      prismaMock.workSchedule.findUnique.mockResolvedValue(null);
      prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);
      prismaMock.leaveRequest.findFirst.mockResolvedValue({
        id: 'leave-today',
        leaveType: 'ANNUAL',
        startsAt: new Date(),
        endsAt: new Date(),
        status: LeaveStatus.APPROVED,
        daysCount: 1,
      });
      prismaMock.workSchedule.findMany.mockResolvedValue([]);
      prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
      prismaMock.leaveRequest.findMany.mockResolvedValue([]);

      const result = await service.getMyScheduleOverview(mockOrgId, mockUserId, {});

      expect(result.today!.approvedLeave).toBeDefined();
      expect(result.today!.attendanceStatus).toBe('LEAVE');
    });

    it('resolves COMPLETED status when today attendance has checkOutAt', async () => {
      prismaMock.employee.findUnique.mockResolvedValue(mockEmployee);
      prismaMock.workSchedule.findUnique.mockResolvedValue({
        id: 'sched-1',
        isOff: false,
        shift: mockShift,
      });
      prismaMock.attendanceRecord.findUnique.mockResolvedValue({
        id: 'att-1',
        checkInAt: new Date('2026-09-19T08:00:00Z'),
        checkOutAt: new Date('2026-09-19T17:05:00Z'),
        status: AttendanceStatus.PRESENT,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        workedMinutes: 545,
        shift: mockShift,
      });
      prismaMock.leaveRequest.findFirst.mockResolvedValue(null);
      prismaMock.workSchedule.findMany.mockResolvedValue([]);
      prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
      prismaMock.leaveRequest.findMany.mockResolvedValue([]);

      const result = await service.getMyScheduleOverview(mockOrgId, mockUserId, {});

      expect(result.today!.attendanceStatus).toBe('COMPLETED');
    });
  });

  describe('Monthly Summary Calculations', () => {
    it('correctly aggregates scheduled days, worked days, late count, and total hours', async () => {
      prismaMock.employee.findUnique.mockResolvedValue(mockEmployee);
      prismaMock.workSchedule.findUnique.mockResolvedValue(null);
      prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);
      prismaMock.leaveRequest.findFirst.mockResolvedValue(null);

      // 3 scheduled work days, 1 off day
      prismaMock.workSchedule.findMany.mockResolvedValue([
        { id: 's1', isOff: false, shiftId: mockShiftId, shift: mockShift, workDate: new Date('2026-09-01T00:00:00Z') },
        { id: 's2', isOff: false, shiftId: mockShiftId, shift: mockShift, workDate: new Date('2026-09-02T00:00:00Z') },
        { id: 's3', isOff: false, shiftId: mockShiftId, shift: mockShift, workDate: new Date('2026-09-03T00:00:00Z') },
        { id: 's4', isOff: true, shiftId: null, shift: null, workDate: new Date('2026-09-04T00:00:00Z') },
      ]);

      // 2 attendance records: 1 on time, 1 late (30 mins)
      prismaMock.attendanceRecord.findMany.mockResolvedValue([
        { id: 'a1', status: AttendanceStatus.PRESENT, lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 480 },
        { id: 'a2', status: AttendanceStatus.LATE, lateMinutes: 30, earlyLeaveMinutes: 0, workedMinutes: 450 },
      ]);

      // 1 approved leave of 1.5 days
      prismaMock.leaveRequest.findMany.mockResolvedValue([
        { id: 'l1', status: LeaveStatus.APPROVED, daysCount: 1.5 },
      ]);

      const result = await service.getMyScheduleOverview(mockOrgId, mockUserId, { month: '2026-09' });

      expect(result.summary.totalScheduledDays).toBe(3);
      expect(result.summary.offDays).toBe(1);
      expect(result.summary.workedDays).toBe(2);
      expect(result.summary.leaveDays).toBe(1.5);
      expect(result.summary.lateCount).toBe(1);
      expect(result.summary.totalWorkedMinutes).toBe(930);
      expect(result.summary.totalWorkedHours).toBe(15.5);
    });
  });
});

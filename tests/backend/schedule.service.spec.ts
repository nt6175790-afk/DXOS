// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScheduleService } from '../../backend/src/modules/schedule/schedule.service';

describe('ScheduleService Unit Tests', () => {
  let service: ScheduleService;
  function createPrismaMock() { return {
      employee: {
        findUnique: jest.fn(),
      },
      shift: {
        findUnique: jest.fn(),
      },
      workSchedule: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((cb): unknown => cb(prismaMock)),
    }; }
  let prismaMock: ReturnType<typeof createPrismaMock>;
  function createAuthzMock() { return {
      can: jest.fn().mockResolvedValue(true),
    }; }
  let authzMock: ReturnType<typeof createAuthzMock>;
  function createAuditMock() { return {
      record: jest.fn().mockResolvedValue(undefined),
    }; }
  let auditMock: ReturnType<typeof createAuditMock>;
  function createNotificationMock() { return {
      createForRecipient: jest.fn().mockResolvedValue(undefined),
    }; }
  let notificationMock: ReturnType<typeof createNotificationMock>;

  const mockOrgId = '00000000-0000-0000-0000-000000000001';
  const mockUserId = '00000000-0000-0000-0000-000000000002';
  const mockEmpId = '00000000-0000-0000-0000-000000000003';
  const mockShiftId = '00000000-0000-0000-0000-000000000004';

  beforeEach(() => {
    prismaMock = createPrismaMock();
    authzMock = createAuthzMock();
    auditMock = createAuditMock();
    notificationMock = createNotificationMock();

    service = new ScheduleService(prismaMock as unknown as ConstructorParameters<typeof ScheduleService>[0], authzMock as unknown as ConstructorParameters<typeof ScheduleService>[1], auditMock as unknown as ConstructorParameters<typeof ScheduleService>[2], notificationMock as unknown as ConstructorParameters<typeof ScheduleService>[3]);
  });

  describe('assignSchedule', () => {
    it('throws NotFoundException if employee does not exist or is inactive', async () => {
      prismaMock.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.assignSchedule(mockOrgId, mockUserId, {
          employeeId: 'non-existent',
          shiftId: mockShiftId,
          workDate: '2026-09-20',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if shift does not exist or is inactive when isOff is false', async () => {
      prismaMock.employee.findUnique.mockResolvedValue({ id: mockEmpId, status: 'ACTIVE', userId: mockUserId });
      prismaMock.shift.findUnique.mockResolvedValue({ id: mockShiftId, isActive: false });

      await expect(
        service.assignSchedule(mockOrgId, mockUserId, {
          employeeId: mockEmpId,
          shiftId: mockShiftId,
          workDate: '2026-09-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('assigns single date schedule successfully', async () => {
      prismaMock.employee.findUnique.mockResolvedValue({ id: mockEmpId, status: 'ACTIVE', userId: mockUserId });
      prismaMock.shift.findUnique.mockResolvedValue({ id: mockShiftId, isActive: true });

      const created = {
        id: 'sched-1',
        organizationId: mockOrgId,
        employeeId: mockEmpId,
        shiftId: mockShiftId,
        workDate: new Date('2026-09-20T00:00:00.000Z'),
        isOff: false,
      };
      prismaMock.workSchedule.upsert.mockResolvedValue(created);

      const res = await service.assignSchedule(mockOrgId, mockUserId, {
        employeeId: mockEmpId,
        shiftId: mockShiftId,
        workDate: '2026-09-20',
      });

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('sched-1');
      expect(auditMock.record).toHaveBeenCalled();
    });

    it('assigns batch date range schedule filtered by days of week', async () => {
      prismaMock.employee.findUnique.mockResolvedValue({ id: mockEmpId, status: 'ACTIVE', userId: mockUserId });
      prismaMock.shift.findUnique.mockResolvedValue({ id: mockShiftId, isActive: true });
      prismaMock.workSchedule.upsert.mockImplementation((args: { create: { employeeId: string; shiftId: string; workDate: Date; isOff: boolean } }) => ({
        id: 'sched-batch',
        ...args.create,
      }));

      // 2026-09-21 (Mon) to 2026-09-25 (Fri) = 5 days
      const res = await service.assignSchedule(mockOrgId, mockUserId, {
        employeeId: mockEmpId,
        shiftId: mockShiftId,
        startDate: '2026-09-21',
        endDate: '2026-09-25',
        daysOfWeek: [1, 2, 3, 4, 5],
      });

      expect(res).toHaveLength(5);
      expect(auditMock.record).toHaveBeenCalledTimes(5);
    });
  });

  describe('updateSchedule', () => {
    it('throws NotFoundException if schedule does not exist', async () => {
      prismaMock.workSchedule.findUnique.mockResolvedValue(null);

      await expect(
        service.updateSchedule(mockOrgId, 'non-existent', mockUserId, { isOff: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates schedule successfully to off day', async () => {
      prismaMock.workSchedule.findUnique.mockResolvedValue({
        id: 'sched-1',
        organizationId: mockOrgId,
        employee: { userId: mockUserId },
        isOff: false,
        shiftId: mockShiftId,
      });

      prismaMock.workSchedule.update.mockResolvedValue({
        id: 'sched-1',
        organizationId: mockOrgId,
        isOff: true,
        shiftId: null,
      });

      const res = await service.updateSchedule(mockOrgId, 'sched-1', mockUserId, { isOff: true });
      expect(res.isOff).toBe(true);
      expect(auditMock.record).toHaveBeenCalled();
    });
  });
});

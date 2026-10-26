// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ShiftService } from '../../backend/src/modules/shift/shift.service';

describe('ShiftService Unit Tests', () => {
  let service: ShiftService;
  function createPrismaMock() { return {
      shift: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    }; }
  let prismaMock: ReturnType<typeof createPrismaMock>;
  function createAuditMock() { return {
      record: jest.fn().mockResolvedValue(undefined),
    }; }
  let auditMock: ReturnType<typeof createAuditMock>;

  const mockOrgId = '00000000-0000-0000-0000-000000000001';
  const mockUserId = '00000000-0000-0000-0000-000000000002';

  beforeEach(() => {
    prismaMock = createPrismaMock();
    auditMock = createAuditMock();
    service = new ShiftService(prismaMock as unknown as ConstructorParameters<typeof ShiftService>[0], auditMock as unknown as ConstructorParameters<typeof ShiftService>[1]);
  });

  describe('createShift', () => {
    it('creates a shift successfully when code is unique', async () => {
      prismaMock.shift.findUnique.mockResolvedValue(null);
      const createdShift = {
        id: 'shift-1',
        organizationId: mockOrgId,
        name: 'Ca hành chính',
        code: 'HC',
        startTime: '09:00',
        endTime: '18:00',
        gracePeriodMinutes: 10,
        isOvernight: false,
        isActive: true,
      };
      prismaMock.shift.create.mockResolvedValue(createdShift);

      const result = await service.createShift(mockOrgId, mockUserId, {
        name: 'Ca hành chính',
        code: 'HC',
        startTime: '09:00',
        endTime: '18:00',
        gracePeriodMinutes: 10,
      });

      expect(result).toEqual(createdShift);
      expect(auditMock.record).toHaveBeenCalled();
    });

    it('throws ConflictException if shift code already exists in the organization', async () => {
      prismaMock.shift.findUnique.mockResolvedValue({ id: 'existing-shift' });

      await expect(
        service.createShift(mockOrgId, mockUserId, {
          name: 'Ca sáng',
          code: 'HC',
          startTime: '06:00',
          endTime: '14:00',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateShift', () => {
    it('throws NotFoundException if shift does not exist', async () => {
      prismaMock.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.updateShift(mockOrgId, 'non-existent', mockUserId, { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates shift properties successfully', async () => {
      prismaMock.shift.findUnique.mockResolvedValue({
        id: 'shift-1',
        organizationId: mockOrgId,
        code: 'HC',
        isActive: true,
      });
      prismaMock.shift.update.mockResolvedValue({
        id: 'shift-1',
        organizationId: mockOrgId,
        name: 'Ca hành chính (Sửa)',
        code: 'HC',
        isActive: true,
      });

      const result = await service.updateShift(mockOrgId, 'shift-1', mockUserId, {
        name: 'Ca hành chính (Sửa)',
      });

      expect(result.name).toBe('Ca hành chính (Sửa)');
      expect(auditMock.record).toHaveBeenCalled();
    });
  });

  describe('deleteShift', () => {
    it('throws ConflictException if shift is referenced by schedules or attendance records', async () => {
      prismaMock.shift.findUnique.mockResolvedValue({
        id: 'shift-1',
        _count: { workSchedules: 5, attendanceRecords: 10 },
      });

      await expect(service.deleteShift(mockOrgId, 'shift-1', mockUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deletes shift when it is unused', async () => {
      prismaMock.shift.findUnique.mockResolvedValue({
        id: 'shift-1',
        _count: { workSchedules: 0, attendanceRecords: 0 },
      });
      prismaMock.shift.delete.mockResolvedValue({ id: 'shift-1' });

      const res = await service.deleteShift(mockOrgId, 'shift-1', mockUserId);
      expect(res.success).toBe(true);
      expect(prismaMock.shift.delete).toHaveBeenCalled();
    });
  });
});

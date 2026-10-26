// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ApiErrorException } from '../../common/errors/api-error.exception';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import type { AttendanceLocationDto, AttendancePositionDto } from './attendance.dto';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';

export const ATTENDANCE_RADIUS_METERS = 100;
const publicLocation = { label: true, latitude: true, longitude: true, updatedAt: true } as const;

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const lat = rad(b.latitude - a.latitude), lon = rad(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function assertAttendancePosition(office: { latitude: number; longitude: number } | null,
  sample: AttendancePositionDto | undefined, now: Date): void {
  const reject = (status: HttpStatus, code: string, message: string): never => { throw new ApiErrorException(status, code, message); };
  if (!office) reject(HttpStatus.CONFLICT, 'ATTENDANCE_LOCATION_NOT_CONFIGURED', 'Công ty chưa thiết lập vị trí chấm công. Vui lòng liên hệ quản lý.');
  if (!sample || !Number.isFinite(sample.latitude) || Math.abs(sample.latitude) > 90 ||
    !Number.isFinite(sample.longitude) || Math.abs(sample.longitude) > 180 ||
    !Number.isFinite(sample.accuracyMeters) || sample.accuracyMeters < 0 || sample.accuracyMeters > 50 ||
    typeof sample.capturedAt !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(sample.capturedAt) || !Number.isFinite(Date.parse(sample.capturedAt))) {
    reject(HttpStatus.BAD_REQUEST, 'ATTENDANCE_LOCATION_INVALID', 'Cần vị trí GPS hợp lệ với sai số không quá 50 m.');
  }
  const position = sample!;
  const age = now.getTime() - Date.parse(position.capturedAt);
  if (age > 60000 || age < -5000) reject(HttpStatus.BAD_REQUEST, 'ATTENDANCE_LOCATION_EXPIRED', 'Vị trí đã cũ. Hãy cập nhật GPS và thử lại.');
  // One micrometre tolerance avoids rejecting an exact boundary due to floating point rounding.
  if (distanceMeters(office!, position) + position.accuracyMeters > ATTENDANCE_RADIUS_METERS + 1e-6) {
    reject(HttpStatus.FORBIDDEN, 'ATTENDANCE_OUTSIDE_OFFICE', 'Bạn chưa ở trong vùng chấm công 100 m hoặc sai số GPS vượt ranh giới. Hãy đến gần công ty và thử lại.');
  }
}

@Injectable()
export class AttendanceLocationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly authorization: AuthorizationService) {}

  async get(organizationId: string) {
    const office = await this.prisma.attendanceLocation.findUnique({ where: { organizationId }, select: publicLocation });
    return { office, radiusMeters: ATTENDANCE_RADIUS_METERS, maxAccuracyMeters: 50, maxAgeSeconds: 60 };
  }

  async set(organizationId: string, actorUserId: string, input: AttendanceLocationDto) {
    return this.prisma.$transaction(async tx => {
      if (!(await this.authorization.can(actorUserId, PERMISSIONS.ATTENDANCE_MANAGE, organizationId, tx))) throw new ForbiddenException();
      const data = { label: input.label.trim(), latitude: input.latitude, longitude: input.longitude };
      const office = await tx.attendanceLocation.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data, select: publicLocation });
      await this.audit.record({ organizationId, actorUserId, event: AUDIT_EVENTS.ATTENDANCE_LOCATION_UPDATED, resourceId: organizationId }, tx);
      return { office, radiusMeters: ATTENDANCE_RADIUS_METERS, maxAccuracyMeters: 50, maxAgeSeconds: 60 };
    }, { isolationLevel: 'Serializable' });
  }

  async assertInside(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string, permission: PermissionKey,
    position: AttendancePositionDto | undefined, now: Date) {
    if (!(await this.authorization.can(actorUserId, permission, organizationId, tx))) throw new ForbiddenException();
    const office = await tx.attendanceLocation.findUnique({ where: { organizationId }, select: { latitude: true, longitude: true } });
    assertAttendancePosition(office, position, now);
  }
}

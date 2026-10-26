// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import {
  compensationProfileProjection,
  type CompensationProfileResponse,
} from './payroll.constants';
import type {
  CreateCompensationDto,
  ListCompensationQueryDto,
  UpdateCompensationDto,
} from './compensation.dto';

function parseDateOnly(dateStr: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  return new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr), 0, 0, 0));
}

@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actorUserId: string,
    organizationId: string,
    employeeId: string,
    dto: CreateCompensationDto,
  ): Promise<CompensationProfileResponse> {
    const canCreate =
      (await this.authz.can(actorUserId, PERMISSIONS.COMPENSATION_CREATE, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.COMPENSATION_MANAGE, organizationId));

    if (!canCreate) {
      throw new ForbiddenException('You do not have permission to create compensation profiles');
    }

    if (dto.baseSalary < 0) {
      throw new BadRequestException('Base salary must be non-negative');
    }

    const effectiveFrom = parseDateOnly(dto.effectiveFrom);
    let effectiveTo: Date | null = null;
    if (dto.effectiveTo) {
      effectiveTo = parseDateOnly(dto.effectiveTo);
      if (effectiveTo.getTime() < effectiveFrom.getTime()) {
        throw new BadRequestException('effectiveTo must be on or after effectiveFrom');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { organizationId_id: { organizationId, id: employeeId } },
        select: { id: true, status: true, displayName: true },
      });

      if (!employee) {
        throw new NotFoundException('Employee not found in organization');
      }

      if (employee.status !== EmployeeStatus.ACTIVE) {
        throw new ConflictException('Employee is not active');
      }

      // Check existing active profiles for overlap
      const existingProfiles = await tx.compensationProfile.findMany({
        where: {
          organizationId,
          employeeId,
          isActive: true,
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      // Close previous active profile if overlapping
      for (const prev of existingProfiles) {
        if (prev.effectiveFrom.getTime() <= effectiveFrom.getTime()) {
          // If previous profile has no effectiveTo or extends past new start date,
          // close it the day before effectiveFrom
          if (!prev.effectiveTo || prev.effectiveTo.getTime() >= effectiveFrom.getTime()) {
            const dayBefore = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
            await tx.compensationProfile.update({
              where: { organizationId_id: { organizationId, id: prev.id } },
              data: {
                effectiveTo: dayBefore,
              },
            });
          }
        } else {
          // A profile exists starting after the new profile
          if (!effectiveTo || effectiveTo.getTime() >= prev.effectiveFrom.getTime()) {
            throw new ConflictException(
              'New compensation profile overlaps with an existing future profile',
            );
          }
        }
      }

      const created = await tx.compensationProfile.create({
        data: {
          organizationId,
          employeeId,
          baseSalary: new Prisma.Decimal(dto.baseSalary),
          currency: dto.currency || 'VND',
          effectiveFrom,
          effectiveTo,
          isActive: true,
          notes: dto.notes ?? null,
        },
        select: compensationProfileProjection,
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.COMPENSATION_CREATED,
          organizationId,
          actorUserId,
          resourceId: created.id,
        },
        tx,
      );

      return created;
    });
  }

  async update(
    actorUserId: string,
    organizationId: string,
    profileId: string,
    dto: UpdateCompensationDto,
  ): Promise<CompensationProfileResponse> {
    const canUpdate =
      (await this.authz.can(actorUserId, PERMISSIONS.COMPENSATION_UPDATE, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.COMPENSATION_MANAGE, organizationId));

    if (!canUpdate) {
      throw new ForbiddenException('You do not have permission to update compensation profiles');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.compensationProfile.findUnique({
        where: { organizationId_id: { organizationId, id: profileId } },
      });

      if (!existing) {
        throw new NotFoundException('Compensation profile not found');
      }

      let effectiveTo = existing.effectiveTo;
      if (dto.effectiveTo !== undefined) {
        const parsed = parseDateOnly(dto.effectiveTo);
        if (parsed.getTime() < existing.effectiveFrom.getTime()) {
          throw new BadRequestException('effectiveTo must be on or after effectiveFrom');
        }
        effectiveTo = parsed;
      }

      const updated = await tx.compensationProfile.update({
        where: { organizationId_id: { organizationId, id: profileId } },
        data: {
          effectiveTo,
          isActive: dto.isActive !== undefined ? dto.isActive : existing.isActive,
          notes: dto.notes !== undefined ? dto.notes : existing.notes,
        },
        select: compensationProfileProjection,
      });

      const auditEvent =
        dto.isActive === false && existing.isActive
          ? AUDIT_EVENTS.COMPENSATION_DEACTIVATED
          : AUDIT_EVENTS.COMPENSATION_UPDATED;

      await this.audit.record(
        {
          event: auditEvent,
          organizationId,
          actorUserId,
          resourceId: updated.id,
        },
        tx,
      );

      return updated;
    });
  }

  async getEmployeeCompensation(
    actorUserId: string,
    organizationId: string,
    employeeId: string,
  ): Promise<{
    activeProfile: CompensationProfileResponse | null;
    history: CompensationProfileResponse[];
  }> {
    const actorEmployee = await this.prisma.employee.findUnique({
      where: { organizationId_userId: { organizationId, userId: actorUserId } },
      select: { id: true },
    });

    const isSelf = actorEmployee?.id === employeeId;
    if (!isSelf) {
      const canRead =
        (await this.authz.can(actorUserId, PERMISSIONS.COMPENSATION_READ, organizationId)) ||
        (await this.authz.can(actorUserId, PERMISSIONS.COMPENSATION_MANAGE, organizationId));

      if (!canRead) {
        throw new ForbiddenException('You do not have permission to view compensation profiles');
      }
    }

    const profiles = await this.prisma.compensationProfile.findMany({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: { effectiveFrom: 'desc' },
      select: compensationProfileProjection,
    });

    const activeProfile = profiles.find((p) => p.isActive) ?? null;
    return {
      activeProfile,
      history: profiles,
    };
  }

  async list(
    actorUserId: string,
    organizationId: string,
    query: ListCompensationQueryDto,
  ): Promise<CompensationProfileResponse[]> {
    const canRead =
      (await this.authz.can(actorUserId, PERMISSIONS.COMPENSATION_READ, organizationId)) ||
      (await this.authz.can(actorUserId, PERMISSIONS.COMPENSATION_MANAGE, organizationId));

    if (!canRead) {
      throw new ForbiddenException('You do not have permission to list compensation profiles');
    }

    const where: Prisma.CompensationProfileWhereInput = {
      organizationId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    return this.prisma.compensationProfile.findMany({
      where,
      orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
      select: compensationProfileProjection,
    });
  }
}

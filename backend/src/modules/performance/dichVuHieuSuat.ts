// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorException } from '../../common/errors/api-error.exception';
import {
  EmployeeStatus,
  PerformanceCycleStatus,
  PerformanceGoalStatus,
  PerformanceReviewStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { NotificationService } from '../notifications/notification.service';
import { NOTIFICATION_TYPES } from '../notifications/notification-catalog';
import type {
  CompleteReviewDto,
  CreateGoalDto,
  CreateKpiDto,
  CreateReviewCycleDto,
  CreateReviewDto,
  ListCycleQueryDto,
  ListGoalQueryDto,
  ListKpiQueryDto,
  ListReviewQueryDto,
  SubmitManagerReviewDto,
  SubmitSelfAssessmentDto,
  UpdateGoalDto,
  UpdateKpiDto,
  UpdateReviewCycleDto,
} from './performance.dto';

function parseDateOnly(dateStr: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  return new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr), 0, 0, 0));
}

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private async getActorEmployee(actorUserId: string, organizationId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.employee.findFirst({
      where: { userId: actorUserId, organizationId, status: EmployeeStatus.ACTIVE },
      select: { id: true, employeeCode: true, displayName: true },
    });
  }

  // ==========================================
  // REVIEW CYCLES
  // ==========================================

  async createCycle(actorUserId: string, organizationId: string, dto: CreateReviewCycleDto) {
    const canCreate = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_CREATE, organizationId);
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_MANAGE, organizationId);
    if (!canCreate && !canManage) throw new ForbiddenException();

    const startDate = parseDateOnly(dto.startDate);
    const endDate = parseDateOnly(dto.endDate);
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.performanceReviewCycle.findUnique({
        where: { organizationId_name: { organizationId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException('CYCLE_NAME_ALREADY_EXISTS');
      }

      const cycle = await tx.performanceReviewCycle.create({
        data: {
          organizationId,
          name: dto.name,
          startDate,
          endDate,
          description: dto.description ?? null,
          status: PerformanceCycleStatus.DRAFT,
        },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_CYCLE_CREATED,
          resourceId: cycle.id,
        },
        tx,
      );

      return cycle;
    });
  }

  async listCycles(actorUserId: string, organizationId: string, query: ListCycleQueryDto) {
    const canRead = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_READ, organizationId);
    if (!canRead) throw new ForbiddenException();

    return this.prisma.performanceReviewCycle.findMany({
      where: {
        organizationId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { startDate: 'desc' },
      include: {
        _count: {
          select: { reviews: true, goals: true, kpis: true },
        },
      },
    });
  }

  async getCycle(actorUserId: string, organizationId: string, cycleId: string) {
    const canRead = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_READ, organizationId);
    if (!canRead) throw new ForbiddenException();

    const cycle = await this.prisma.performanceReviewCycle.findFirst({
      where: { id: cycleId, organizationId },
      include: {
        _count: {
          select: { reviews: true, goals: true, kpis: true },
        },
      },
    });
    if (!cycle) throw new NotFoundException('CYCLE_NOT_FOUND');
    return cycle;
  }

  async updateCycle(actorUserId: string, organizationId: string, cycleId: string, dto: UpdateReviewCycleDto) {
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_MANAGE, organizationId);
    const canUpdate = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_UPDATE, organizationId);
    if (!canManage && !canUpdate) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      const cycle = await tx.performanceReviewCycle.findFirst({
        where: { id: cycleId, organizationId },
      });
      if (!cycle) throw new NotFoundException('CYCLE_NOT_FOUND');

      const dataToUpdate: Prisma.PerformanceReviewCycleUpdateInput = {};
      if (dto.name !== undefined) dataToUpdate.name = dto.name;
      if (dto.description !== undefined) dataToUpdate.description = dto.description;
      if (dto.startDate) dataToUpdate.startDate = parseDateOnly(dto.startDate);
      if (dto.endDate) dataToUpdate.endDate = parseDateOnly(dto.endDate);
      if (dto.status !== undefined) dataToUpdate.status = dto.status;

      const updated = await tx.performanceReviewCycle.update({
        where: { id: cycleId },
        data: dataToUpdate,
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event:
            dto.status && dto.status !== cycle.status
              ? AUDIT_EVENTS.PERFORMANCE_CYCLE_STATUS_CHANGED
              : AUDIT_EVENTS.PERFORMANCE_CYCLE_UPDATED,
          resourceId: cycle.id,
        },
        tx,
      );

      return updated;
    });
  }

  // ==========================================
  // GOALS
  // ==========================================

  async createGoal(actorUserId: string, organizationId: string, dto: CreateGoalDto) {
    const canCreate = await this.authz.can(actorUserId, PERMISSIONS.GOAL_CREATE, organizationId);
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.GOAL_MANAGE, organizationId);
    const actorEmployee = await this.getActorEmployee(actorUserId, organizationId);

    // If neither admin nor managing, must be creating own goal
    if (!canManage && !canCreate) {
      if (!actorEmployee || actorEmployee.id !== dto.employeeId) throw new ForbiddenException();
    }

    return this.prisma.$transaction(async (tx) => {
      const cycle = await tx.performanceReviewCycle.findFirst({
        where: { id: dto.cycleId, organizationId },
      });
      if (!cycle) throw new NotFoundException('CYCLE_NOT_FOUND');
      if (cycle.status === PerformanceCycleStatus.COMPLETED || cycle.status === PerformanceCycleStatus.CANCELLED) {
        throw new BadRequestException('CYCLE_IS_CLOSED');
      }

      const employee = await tx.employee.findFirst({
        where: { id: dto.employeeId, organizationId, status: EmployeeStatus.ACTIVE },
      });
      if (!employee) throw new NotFoundException('EMPLOYEE_NOT_FOUND');

      const goal = await tx.performanceGoal.create({
        data: {
          organizationId,
          cycleId: dto.cycleId,
          employeeId: dto.employeeId,
          title: dto.title,
          description: dto.description ?? null,
          weight: new Prisma.Decimal(dto.weight ?? 0),
          progress: new Prisma.Decimal(dto.progress ?? 0),
          status: dto.status ?? PerformanceGoalStatus.NOT_STARTED,
        },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_GOAL_CREATED,
          resourceId: goal.id,
        },
        tx,
      );

      return goal;
    });
  }

  async listGoals(actorUserId: string, organizationId: string, query: ListGoalQueryDto) {
    const canRead = await this.authz.can(actorUserId, PERMISSIONS.GOAL_READ, organizationId);
    if (!canRead) throw new ForbiddenException();

    return this.prisma.performanceGoal.findMany({
      where: {
        organizationId,
        ...(query.cycleId ? { cycleId: query.cycleId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      include: {
        employee: { select: { id: true, employeeCode: true, displayName: true } },
        cycle: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateGoal(actorUserId: string, organizationId: string, goalId: string, dto: UpdateGoalDto) {
    const canUpdate = await this.authz.can(actorUserId, PERMISSIONS.GOAL_UPDATE, organizationId);
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.GOAL_MANAGE, organizationId);
    const actorEmployee = await this.getActorEmployee(actorUserId, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const goal = await tx.performanceGoal.findFirst({
        where: { id: goalId, organizationId },
        include: { cycle: true },
      });
      if (!goal) throw new NotFoundException('GOAL_NOT_FOUND');
      if (goal.cycle.status === PerformanceCycleStatus.COMPLETED) {
        throw new BadRequestException('CYCLE_COMPLETED_IMMUTABLE');
      }

      if (!canManage && !canUpdate) {
        if (!actorEmployee || actorEmployee.id !== goal.employeeId) throw new ForbiddenException();
      }

      const dataToUpdate: Prisma.PerformanceGoalUpdateInput = {};
      if (dto.title !== undefined) dataToUpdate.title = dto.title;
      if (dto.description !== undefined) dataToUpdate.description = dto.description;
      if (dto.weight !== undefined) dataToUpdate.weight = new Prisma.Decimal(dto.weight);
      if (dto.progress !== undefined) {
        dataToUpdate.progress = new Prisma.Decimal(dto.progress);
        if (dto.progress >= 100 && (!dto.status || dto.status === PerformanceGoalStatus.IN_PROGRESS)) {
          dataToUpdate.status = PerformanceGoalStatus.COMPLETED;
        }
      }
      if (dto.status !== undefined) dataToUpdate.status = dto.status;

      const updated = await tx.performanceGoal.update({
        where: { id: goalId },
        data: dataToUpdate,
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_GOAL_UPDATED,
          resourceId: goal.id,
        },
        tx,
      );

      return updated;
    });
  }

  // ==========================================
  // KPIS
  // ==========================================

  async createKpi(actorUserId: string, organizationId: string, dto: CreateKpiDto) {
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.KPI_MANAGE, organizationId);
    const canCreate = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_CREATE, organizationId);
    if (!canManage && !canCreate) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      const cycle = await tx.performanceReviewCycle.findFirst({
        where: { id: dto.cycleId, organizationId },
      });
      if (!cycle) throw new NotFoundException('CYCLE_NOT_FOUND');
      if (cycle.status === PerformanceCycleStatus.COMPLETED || cycle.status === PerformanceCycleStatus.CANCELLED) {
        throw new BadRequestException('CYCLE_IS_CLOSED');
      }

      const employee = await tx.employee.findFirst({
        where: { id: dto.employeeId, organizationId, status: EmployeeStatus.ACTIVE },
      });
      if (!employee) throw new NotFoundException('EMPLOYEE_NOT_FOUND');

      const targetVal = new Prisma.Decimal(dto.targetValue);
      const actualVal = new Prisma.Decimal(dto.actualValue ?? 0);
      // Score = min(100, round((actual / target) * 100, 2))
      const rawScore = targetVal.greaterThan(0)
        ? actualVal.dividedBy(targetVal).times(100).toDecimalPlaces(2)
        : new Prisma.Decimal(0);
      const score = rawScore.greaterThan(100) ? new Prisma.Decimal(100) : rawScore;

      const kpi = await tx.performanceKpi.create({
        data: {
          organizationId,
          cycleId: dto.cycleId,
          employeeId: dto.employeeId,
          name: dto.name,
          targetValue: targetVal,
          actualValue: actualVal,
          unit: dto.unit,
          score,
        },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_KPI_CREATED,
          resourceId: kpi.id,
        },
        tx,
      );

      return kpi;
    });
  }

  async listKpis(actorUserId: string, organizationId: string, query: ListKpiQueryDto) {
    const canRead = await this.authz.can(actorUserId, PERMISSIONS.KPI_READ, organizationId);
    if (!canRead) throw new ForbiddenException();

    return this.prisma.performanceKpi.findMany({
      where: {
        organizationId,
        ...(query.cycleId ? { cycleId: query.cycleId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      include: {
        employee: { select: { id: true, employeeCode: true, displayName: true } },
        cycle: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateKpi(actorUserId: string, organizationId: string, kpiId: string, dto: UpdateKpiDto) {
    const canUpdate = await this.authz.can(actorUserId, PERMISSIONS.KPI_UPDATE, organizationId);
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.KPI_MANAGE, organizationId);
    if (!canUpdate && !canManage) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      const kpi = await tx.performanceKpi.findFirst({
        where: { id: kpiId, organizationId },
        include: { cycle: true },
      });
      if (!kpi) throw new NotFoundException('KPI_NOT_FOUND');
      if (kpi.cycle.status === PerformanceCycleStatus.COMPLETED) {
        throw new BadRequestException('CYCLE_COMPLETED_IMMUTABLE');
      }

      const targetVal = dto.targetValue !== undefined ? new Prisma.Decimal(dto.targetValue) : kpi.targetValue;
      const actualVal = dto.actualValue !== undefined ? new Prisma.Decimal(dto.actualValue) : kpi.actualValue;
      const rawScore = targetVal.greaterThan(0)
        ? actualVal.dividedBy(targetVal).times(100).toDecimalPlaces(2)
        : new Prisma.Decimal(0);
      const score = rawScore.greaterThan(100) ? new Prisma.Decimal(100) : rawScore;

      const updated = await tx.performanceKpi.update({
        where: { id: kpiId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          targetValue: targetVal,
          actualValue: actualVal,
          score,
        },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_KPI_UPDATED,
          resourceId: kpi.id,
        },
        tx,
      );

      return updated;
    });
  }

  // ==========================================
  // PERFORMANCE REVIEWS
  // ==========================================

  async createReview(actorUserId: string, organizationId: string, dto: CreateReviewDto) {
    const canCreate = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_CREATE, organizationId);
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_MANAGE, organizationId);
    if (!canCreate && !canManage) throw new ForbiddenException();

    // STRICT ANTI-SELF-REVIEW RULE: Reviewer cannot be employee being reviewed!
    if (dto.reviewerId === dto.employeeId) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        'SELF_REVIEW_FORBIDDEN',
        'SELF_REVIEW_FORBIDDEN: Reviewer cannot review themselves',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const cycle = await tx.performanceReviewCycle.findFirst({
        where: { id: dto.cycleId, organizationId },
      });
      if (!cycle) throw new NotFoundException('CYCLE_NOT_FOUND');

      const employee = await tx.employee.findFirst({
        where: { id: dto.employeeId, organizationId, status: EmployeeStatus.ACTIVE },
        include: { user: { select: { id: true } } },
      });
      if (!employee) throw new NotFoundException('EMPLOYEE_NOT_FOUND');

      const reviewer = await tx.employee.findFirst({
        where: { id: dto.reviewerId, organizationId, status: EmployeeStatus.ACTIVE },
        include: { user: { select: { id: true } } },
      });
      if (!reviewer) throw new NotFoundException('REVIEWER_NOT_FOUND');

      const existing = await tx.performanceReview.findUnique({
        where: { cycleId_employeeId: { cycleId: dto.cycleId, employeeId: dto.employeeId } },
      });
      if (existing) {
        throw new ConflictException('REVIEW_ALREADY_EXISTS_FOR_EMPLOYEE_IN_CYCLE');
      }

      const review = await tx.performanceReview.create({
        data: {
          organizationId,
          cycleId: dto.cycleId,
          employeeId: dto.employeeId,
          reviewerId: dto.reviewerId,
          status:
            cycle.status === PerformanceCycleStatus.OPEN
              ? PerformanceReviewStatus.SELF_ASSESSMENT
              : PerformanceReviewStatus.DRAFT,
        },
        include: {
          employee: { select: { id: true, employeeCode: true, displayName: true } },
          reviewer: { select: { id: true, employeeCode: true, displayName: true } },
          cycle: { select: { id: true, name: true, status: true } },
        },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_REVIEW_CREATED,
          resourceId: review.id,
        },
        tx,
      );

      // Notify reviewer
      if (reviewer.user?.id) {
        await this.notifications.createForRecipient(
          {
            organizationId,
            recipientUserId: reviewer.user.id,
            type: NOTIFICATION_TYPES.PERFORMANCE_REVIEW_ASSIGNED,
            metadata: {
              reviewId: review.id,
              cycleId: review.cycleId,
              message: `Bạn được phân công đánh giá hiệu suất cho nhân viên ${employee.displayName}.`,
            },
          },
          tx,
        );
      }

      return review;
    });
  }

  async listReviews(actorUserId: string, organizationId: string, query: ListReviewQueryDto) {
    const canRead = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_READ, organizationId);
    if (!canRead) throw new ForbiddenException();

    const canManage = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_MANAGE, organizationId);
    const actorEmployee = await this.getActorEmployee(actorUserId, organizationId);

    // If query.mine is requested, filter by actor's employeeId
    let employeeIdFilter = query.employeeId;
    if (query.mine) {
      if (!actorEmployee) return [];
      employeeIdFilter = actorEmployee.id;
    } else if (!canManage) {
      // Normal employee can only see reviews where they are employee or reviewer
      if (!actorEmployee) return [];
      return this.prisma.performanceReview.findMany({
        where: {
          organizationId,
          ...(query.cycleId ? { cycleId: query.cycleId } : {}),
          ...(query.status ? { status: query.status } : {}),
          OR: [
            { employeeId: actorEmployee.id },
            { reviewerId: actorEmployee.id },
          ],
        },
        include: {
          employee: { select: { id: true, employeeCode: true, displayName: true, department: { select: { name: true } } } },
          reviewer: { select: { id: true, employeeCode: true, displayName: true } },
          cycle: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.performanceReview.findMany({
      where: {
        organizationId,
        ...(query.cycleId ? { cycleId: query.cycleId } : {}),
        ...(employeeIdFilter ? { employeeId: employeeIdFilter } : {}),
        ...(query.reviewerId ? { reviewerId: query.reviewerId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        employee: { select: { id: true, employeeCode: true, displayName: true, department: { select: { name: true } } } },
        reviewer: { select: { id: true, employeeCode: true, displayName: true } },
        cycle: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReview(actorUserId: string, organizationId: string, reviewId: string) {
    const canRead = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_READ, organizationId);
    if (!canRead) throw new ForbiddenException();

    const canManage = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_MANAGE, organizationId);
    const actorEmployee = await this.getActorEmployee(actorUserId, organizationId);

    const review = await this.prisma.performanceReview.findFirst({
      where: { id: reviewId, organizationId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            displayName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
          },
        },
        reviewer: {
          select: {
            id: true,
            employeeCode: true,
            displayName: true,
            jobTitle: true,
          },
        },
        cycle: true,
      },
    });

    if (!review) throw new NotFoundException('REVIEW_NOT_FOUND');

    if (!canManage && (!actorEmployee || (actorEmployee.id !== review.employeeId && actorEmployee.id !== review.reviewerId))) {
      throw new ForbiddenException();
    }

    // Attach goals and KPIs for this employee in this cycle
    const [goals, kpis] = await Promise.all([
      this.prisma.performanceGoal.findMany({
        where: { organizationId, cycleId: review.cycleId, employeeId: review.employeeId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.performanceKpi.findMany({
        where: { organizationId, cycleId: review.cycleId, employeeId: review.employeeId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      ...review,
      goals,
      kpis,
    };
  }

  async submitSelfAssessment(
    actorUserId: string,
    organizationId: string,
    reviewId: string,
    dto: SubmitSelfAssessmentDto,
  ) {
    const actorEmployee = await this.getActorEmployee(actorUserId, organizationId);
    if (!actorEmployee) throw new ForbiddenException('EMPLOYEE_PROFILE_REQUIRED');

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.performanceReview.findFirst({
        where: { id: reviewId, organizationId },
        include: {
          reviewer: { include: { user: { select: { id: true } } } },
          employee: { select: { displayName: true } },
        },
      });
      if (!review) throw new NotFoundException('REVIEW_NOT_FOUND');

      // Actor must be the employee being reviewed
      if (review.employeeId !== actorEmployee.id) {
        throw new ForbiddenException('CANNOT_SUBMIT_SELF_ASSESSMENT_FOR_OTHERS');
      }

      if (review.status === PerformanceReviewStatus.COMPLETED) {
        throw new ApiErrorException(
          HttpStatus.BAD_REQUEST,
          'REVIEW_ALREADY_COMPLETED_IMMUTABLE',
          'REVIEW_ALREADY_COMPLETED_IMMUTABLE: Review has been completed and snapshot is frozen',
        );
      }

      const updated = await tx.performanceReview.update({
        where: { id: reviewId },
        data: {
          selfAssessment: dto.selfAssessment,
          selfRating: dto.selfRating,
          selfSubmittedAt: new Date(),
          status: PerformanceReviewStatus.MANAGER_REVIEW,
        },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_REVIEW_SELF_SUBMITTED,
          resourceId: review.id,
        },
        tx,
      );

      // Notify reviewer that self-assessment is submitted
      if (review.reviewer?.user?.id) {
        await this.notifications.createForRecipient(
          {
            organizationId,
            recipientUserId: review.reviewer.user.id,
            type: NOTIFICATION_TYPES.PERFORMANCE_STATUS_CHANGED,
            metadata: {
              reviewId: review.id,
              status: 'PENDING',
              message: `Nhân viên ${review.employee.displayName} đã hoàn tất tự đánh giá, đang chờ bạn đánh giá quản lý.`,
            },
          },
          tx,
        );
      }

      return updated;
    });
  }

  async submitManagerReview(
    actorUserId: string,
    organizationId: string,
    reviewId: string,
    dto: SubmitManagerReviewDto,
  ) {
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_MANAGE, organizationId);
    const canReview = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_REVIEW, organizationId);
    const actorEmployee = await this.getActorEmployee(actorUserId, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.performanceReview.findFirst({
        where: { id: reviewId, organizationId },
        include: {
          employee: { include: { user: { select: { id: true } } } },
        },
      });
      if (!review) throw new NotFoundException('REVIEW_NOT_FOUND');

      // STRICT ANTI-SELF-REVIEW RULE:
      // Even if admin, if actor IS the employee being reviewed, FORBIDDEN!
      if (actorEmployee && actorEmployee.id === review.employeeId) {
        throw new ApiErrorException(
          HttpStatus.FORBIDDEN,
          'SELF_REVIEW_FORBIDDEN',
          'SELF_REVIEW_FORBIDDEN: You cannot review your own performance',
        );
      }

      // Actor must be the designated reviewer OR have PERFORMANCE_MANAGE
      if (!canManage) {
        if (!canReview || !actorEmployee || actorEmployee.id !== review.reviewerId) {
          throw new ApiErrorException(
            HttpStatus.FORBIDDEN,
            'NOT_DESIGNATED_REVIEWER',
            'NOT_DESIGNATED_REVIEWER: Only designated reviewer can review',
          );
        }
      }

      if (review.status === PerformanceReviewStatus.COMPLETED) {
        throw new ApiErrorException(
          HttpStatus.BAD_REQUEST,
          'REVIEW_ALREADY_COMPLETED_IMMUTABLE',
          'REVIEW_ALREADY_COMPLETED_IMMUTABLE: Review has been completed and snapshot is frozen',
        );
      }

      const updated = await tx.performanceReview.update({
        where: { id: reviewId },
        data: {
          managerReview: dto.managerReview,
          managerRating: dto.managerRating,
          managerSubmittedAt: new Date(),
          ...(dto.summaryFeedback ? { summaryFeedback: dto.summaryFeedback } : {}),
        },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_REVIEW_MANAGER_SUBMITTED,
          resourceId: review.id,
        },
        tx,
      );

      return updated;
    });
  }

  async completeReview(
    actorUserId: string,
    organizationId: string,
    reviewId: string,
    dto: CompleteReviewDto,
  ) {
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_MANAGE, organizationId);
    const canReview = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_REVIEW, organizationId);
    if (!canManage && !canReview) throw new ForbiddenException();

    const actorEmployee = await this.getActorEmployee(actorUserId, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.performanceReview.findFirst({
        where: { id: reviewId, organizationId },
        include: {
          employee: { select: { id: true, employeeCode: true, displayName: true, user: { select: { id: true } } } },
          reviewer: { select: { id: true, employeeCode: true, displayName: true } },
          cycle: true,
        },
      });
      if (!review) throw new NotFoundException('REVIEW_NOT_FOUND');

      // STRICT ANTI-SELF-REVIEW RULE:
      if (actorEmployee && actorEmployee.id === review.employeeId) {
        throw new ApiErrorException(
          HttpStatus.FORBIDDEN,
          'SELF_REVIEW_FORBIDDEN',
          'SELF_REVIEW_FORBIDDEN: You cannot finalize your own review',
        );
      }

      if (review.status === PerformanceReviewStatus.COMPLETED) {
        throw new ApiErrorException(
          HttpStatus.BAD_REQUEST,
          'REVIEW_ALREADY_COMPLETED_IMMUTABLE',
          'REVIEW_ALREADY_COMPLETED_IMMUTABLE: Review has already been completed and frozen',
        );
      }

      const finalRating = dto.finalRating ?? review.managerRating ?? review.selfRating ?? 3;
      const summaryFeedback = dto.summaryFeedback ?? review.summaryFeedback ?? '';

      // Capture all goals & KPIs snapshot
      const [goals, kpis] = await Promise.all([
        tx.performanceGoal.findMany({
          where: { organizationId, cycleId: review.cycleId, employeeId: review.employeeId },
        }),
        tx.performanceKpi.findMany({
          where: { organizationId, cycleId: review.cycleId, employeeId: review.employeeId },
        }),
      ]);

      const snapshotData = {
        reviewId: review.id,
        completedAt: new Date().toISOString(),
        cycle: {
          id: review.cycle.id,
          name: review.cycle.name,
          startDate: review.cycle.startDate,
          endDate: review.cycle.endDate,
        },
        employee: {
          id: review.employee.id,
          code: review.employee.employeeCode,
          name: review.employee.displayName,
        },
        reviewer: {
          id: review.reviewer.id,
          code: review.reviewer.employeeCode,
          name: review.reviewer.displayName,
        },
        selfAssessment: review.selfAssessment,
        selfRating: review.selfRating,
        selfSubmittedAt: review.selfSubmittedAt,
        managerReview: review.managerReview,
        managerRating: review.managerRating,
        managerSubmittedAt: review.managerSubmittedAt,
        finalRating,
        summaryFeedback,
        goals: goals.map((g) => ({
          id: g.id,
          title: g.title,
          description: g.description,
          weight: Number(g.weight),
          progress: Number(g.progress),
          status: g.status,
        })),
        kpis: kpis.map((k) => ({
          id: k.id,
          name: k.name,
          targetValue: Number(k.targetValue),
          actualValue: Number(k.actualValue),
          unit: k.unit,
          score: Number(k.score),
        })),
      };

      const updated = await tx.performanceReview.update({
        where: { id: reviewId },
        data: {
          finalRating,
          summaryFeedback,
          status: PerformanceReviewStatus.COMPLETED,
          completedAt: new Date(),
          snapshotData,
        },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_REVIEW_COMPLETED,
          resourceId: review.id,
        },
        tx,
      );

      // Notify employee
      if (review.employee?.user?.id) {
        await this.notifications.createForRecipient(
          {
            organizationId,
            recipientUserId: review.employee.user.id,
            type: NOTIFICATION_TYPES.PERFORMANCE_STATUS_CHANGED,
            metadata: {
              reviewId: review.id,
              status: 'APPROVED',
              message: `Đánh giá hiệu suất chu kỳ "${review.cycle.name}" của bạn đã hoàn tất với xếp loại ${finalRating}/5.`,
            },
          },
          tx,
        );
      }

      return updated;
    });
  }

  async cancelReview(actorUserId: string, organizationId: string, reviewId: string) {
    const canManage = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_MANAGE, organizationId);
    if (!canManage) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.performanceReview.findFirst({
        where: { id: reviewId, organizationId },
      });
      if (!review) throw new NotFoundException('REVIEW_NOT_FOUND');

      const updated = await tx.performanceReview.update({
        where: { id: reviewId },
        data: { status: PerformanceReviewStatus.CANCELLED },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          event: AUDIT_EVENTS.PERFORMANCE_REVIEW_CANCELLED,
          resourceId: review.id,
        },
        tx,
      );

      return updated;
    });
  }

  // ==========================================
  // DASHBOARD & METRICS
  // ==========================================

  async getDashboardSummary(actorUserId: string, organizationId: string) {
    const canRead = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_READ, organizationId);
    if (!canRead) throw new ForbiddenException();

    const [cycles, reviews, goals, kpis] = await Promise.all([
      this.prisma.performanceReviewCycle.findMany({
        where: { organizationId },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.performanceReview.findMany({
        where: { organizationId },
        include: {
          employee: { select: { id: true, displayName: true, employeeCode: true } },
          cycle: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.performanceGoal.findMany({
        where: { organizationId },
      }),
      this.prisma.performanceKpi.findMany({
        where: { organizationId },
      }),
    ]);

    const activeCycle = cycles.find((c) => c.status === PerformanceCycleStatus.OPEN) ?? cycles[0] ?? null;

    const completedReviews = reviews.filter((r) => r.status === PerformanceReviewStatus.COMPLETED);
    const inReviewCount = reviews.filter((r) => r.status === PerformanceReviewStatus.MANAGER_REVIEW).length;
    const pendingSelfAssessment = reviews.filter((r) => r.status === PerformanceReviewStatus.SELF_ASSESSMENT).length;

    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingSum = 0;
    for (const r of completedReviews) {
      if (r.finalRating && r.finalRating >= 1 && r.finalRating <= 5) {
        ratingCounts[r.finalRating as 1 | 2 | 3 | 4 | 5] += 1;
        ratingSum += r.finalRating;
      }
    }
    const averageRating = completedReviews.length > 0
      ? Number((ratingSum / completedReviews.length).toFixed(2))
      : 0;

    // Goals completion
    const avgGoalProgress = goals.length > 0
      ? Number((goals.reduce((acc, g) => acc + Number(g.progress), 0) / goals.length).toFixed(1))
      : 0;

    // KPI achievement
    const avgKpiScore = kpis.length > 0
      ? Number((kpis.reduce((acc, k) => acc + Number(k.score), 0) / kpis.length).toFixed(1))
      : 0;

    return {
      totalCycles: cycles.length,
      activeCycle: activeCycle
        ? {
            id: activeCycle.id,
            name: activeCycle.name,
            status: activeCycle.status,
            startDate: activeCycle.startDate,
            endDate: activeCycle.endDate,
          }
        : null,
      totalReviews: reviews.length,
      completedReviewsCount: completedReviews.length,
      inReviewCount,
      pendingSelfAssessment,
      averageRating,
      ratingDistribution: ratingCounts,
      goalCompletionRate: avgGoalProgress,
      kpiAchievementRate: avgKpiScore,
      recentReviews: reviews.slice(0, 5).map((r) => ({
        id: r.id,
        employeeName: r.employee.displayName,
        employeeCode: r.employee.employeeCode,
        cycleName: r.cycle.name,
        status: r.status,
        finalRating: r.finalRating,
        updatedAt: r.updatedAt,
      })),
    };
  }

  // ==========================================
  // EMPLOYEE PERFORMANCE PROFILE
  // ==========================================

  async getEmployeeProfile(actorUserId: string, organizationId: string, employeeId: string) {
    const canRead = await this.authz.can(actorUserId, PERMISSIONS.PERFORMANCE_READ, organizationId);
    if (!canRead) throw new ForbiddenException();

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: {
        department: { select: { name: true } },
      },
    });
    if (!employee) throw new NotFoundException('EMPLOYEE_NOT_FOUND');

    const [reviews, goals, kpis] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where: { organizationId, employeeId },
        include: {
          cycle: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
          reviewer: { select: { id: true, displayName: true, employeeCode: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.performanceGoal.findMany({
        where: { organizationId, employeeId },
        include: { cycle: { select: { id: true, name: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.performanceKpi.findMany({
        where: { organizationId, employeeId },
        include: { cycle: { select: { id: true, name: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const completed = reviews.filter((r) => r.status === PerformanceReviewStatus.COMPLETED && r.finalRating);
    const avgRating = completed.length > 0
      ? Number((completed.reduce((sum, r) => sum + (r.finalRating || 0), 0) / completed.length).toFixed(2))
      : null;

    return {
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        displayName: employee.displayName,
        jobTitle: employee.jobTitle,
        departmentName: employee.department?.name ?? null,
      },
      averageRating: avgRating,
      completedReviewsCount: completed.length,
      reviews,
      goals,
      kpis,
    };
  }
}

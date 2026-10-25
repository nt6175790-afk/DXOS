import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentCategory, DocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { CreateRequirementDto, UpdateRequirementDto } from './documents.dto';

const DEFAULT_REQUIREMENTS = [
  {
    category: DocumentCategory.LABOR_CONTRACT,
    name: 'Hợp đồng lao động',
    description: 'Hợp đồng lao động có hiệu lực theo Bộ luật Lao động',
    isRequired: true,
  },
  {
    category: DocumentCategory.IDENTIFICATION,
    name: 'Căn cước công dân / Hộ chiếu',
    description: 'Bản sao công chứng CCCD gắn chip hoặc Hộ chiếu còn hạn',
    isRequired: true,
  },
  {
    category: DocumentCategory.CERTIFICATE,
    name: 'Bằng cấp & Chứng chỉ chuyên môn',
    description: 'Bằng tốt nghiệp hoặc chứng chỉ hành nghề liên quan',
    isRequired: true,
  },
  {
    category: DocumentCategory.INSURANCE,
    name: 'Bảo hiểm & Hồ sơ y tế',
    description: 'Sổ BHXH hoặc giấy khám sức khỏe định kỳ',
    isRequired: true,
  },
];

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async ensureDefaultRequirements(orgId: string, tx: Prisma.TransactionClient) {
    const existing = await tx.documentRequirement.count({
      where: { organizationId: orgId },
    });
    if (existing === 0) {
      for (const req of DEFAULT_REQUIREMENTS) {
        await tx.documentRequirement.create({
          data: {
            organizationId: orgId,
            category: req.category,
            name: req.name,
            description: req.description,
            isRequired: req.isRequired,
          },
        });
      }
    }
  }

  async listRequirements(userId: string, orgId: string) {
    return this.prisma.$transaction(async (tx) => {
      const canRead = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx);
      if (!canRead) throw new ForbiddenException();

      await this.ensureDefaultRequirements(orgId, tx);

      return tx.documentRequirement.findMany({
        where: { organizationId: orgId },
        include: {
          department: {
            select: { id: true, name: true, code: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async createRequirement(userId: string, orgId: string, dto: CreateRequirementDto) {
    return this.prisma.$transaction(async (tx) => {
      const canManage = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_MANAGE, orgId, tx);
      if (!canManage) throw new ForbiddenException();

      if (dto.applicableDepartmentId) {
        const dept = await tx.department.findFirst({
          where: { id: dto.applicableDepartmentId, organizationId: orgId },
        });
        if (!dept) throw new BadRequestException('Department not found');
      }

      const created = await tx.documentRequirement.create({
        data: {
          organizationId: orgId,
          category: dto.category,
          name: dto.name,
          description: dto.description,
          isRequired: dto.isRequired ?? true,
          applicableDepartmentId: dto.applicableDepartmentId,
        },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_REQUIREMENT_UPDATED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: created.id,
        },
        tx,
      );

      return created;
    });
  }

  async updateRequirement(userId: string, orgId: string, id: string, dto: UpdateRequirementDto) {
    return this.prisma.$transaction(async (tx) => {
      const canManage = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_MANAGE, orgId, tx);
      if (!canManage) throw new ForbiddenException();

      const existing = await tx.documentRequirement.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!existing) throw new NotFoundException('Requirement not found');

      if (dto.applicableDepartmentId) {
        const dept = await tx.department.findFirst({
          where: { id: dto.applicableDepartmentId, organizationId: orgId },
        });
        if (!dept) throw new BadRequestException('Department not found');
      }

      const updated = await tx.documentRequirement.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
          ...(dto.applicableDepartmentId !== undefined ? { applicableDepartmentId: dto.applicableDepartmentId } : {}),
        },
      });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_REQUIREMENT_UPDATED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: updated.id,
        },
        tx,
      );

      return updated;
    });
  }

  async deleteRequirement(userId: string, orgId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const canManage = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_MANAGE, orgId, tx);
      if (!canManage) throw new ForbiddenException();

      const existing = await tx.documentRequirement.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!existing) throw new NotFoundException('Requirement not found');

      await tx.documentRequirement.delete({ where: { id: existing.id } });

      await this.audit.record(
        {
          event: AUDIT_EVENTS.DOCUMENT_REQUIREMENT_UPDATED,
          organizationId: orgId,
          actorUserId: userId,
          resourceId: existing.id,
        },
        tx,
      );

      return { success: true };
    });
  }

  async getSummary(userId: string, orgId: string) {
    return this.prisma.$transaction(async (tx) => {
      const canRead = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx);
      if (!canRead) throw new ForbiddenException();

      await this.ensureDefaultRequirements(orgId, tx);

      const requirements = await tx.documentRequirement.findMany({
        where: { organizationId: orgId, isRequired: true },
      });

      const employees = await tx.employee.findMany({
        where: { organizationId: orgId, status: 'ACTIVE' },
        select: { id: true, departmentId: true },
      });

      const documents = await tx.employeeDocument.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: {
          id: true,
          employeeId: true,
          category: true,
          status: true,
          expiryDate: true,
        },
      });

      const now = new Date();
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);

      let totalExpected = 0;
      let totalFulfilled = 0;
      let compliantEmployeesCount = 0;

      for (const emp of employees) {
        const empReqs = requirements.filter(
          (r) => !r.applicableDepartmentId || r.applicableDepartmentId === emp.departmentId,
        );
        totalExpected += empReqs.length;

        const empDocs = documents.filter((d) => d.employeeId === emp.id && d.status === DocumentStatus.ACTIVE);
        let empFulfilledCount = 0;

        for (const req of empReqs) {
          const doc = empDocs.find((d) => d.category === req.category);
          if (doc) {
            const isExpired = doc.expiryDate && new Date(doc.expiryDate) < now;
            if (!isExpired) {
              empFulfilledCount++;
            }
          }
        }

        totalFulfilled += empFulfilledCount;
        if (empReqs.length > 0 && empFulfilledCount === empReqs.length) {
          compliantEmployeesCount++;
        }
      }

      const expiringSoonDocs = documents.filter(
        (d) =>
          d.status === DocumentStatus.ACTIVE &&
          d.expiryDate &&
          new Date(d.expiryDate) >= now &&
          new Date(d.expiryDate) <= in30Days,
      );

      const expiredDocs = documents.filter(
        (d) => d.status === DocumentStatus.ACTIVE && d.expiryDate && new Date(d.expiryDate) < now,
      );

      const complianceRate =
        totalExpected > 0 ? Math.round((totalFulfilled / totalExpected) * 1000) / 10 : 100;

      return {
        totalDocuments: documents.length,
        totalEmployees: employees.length,
        totalExpectedRequirements: totalExpected,
        totalFulfilledRequirements: totalFulfilled,
        complianceRate,
        compliantEmployeesCount,
        missingDocumentsCount: totalExpected - totalFulfilled,
        expiringSoonCount: expiringSoonDocs.length,
        expiredCount: expiredDocs.length,
      };
    });
  }

  async getDepartments(userId: string, orgId: string) {
    return this.prisma.$transaction(async (tx) => {
      const canRead = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx);
      if (!canRead) throw new ForbiddenException();

      await this.ensureDefaultRequirements(orgId, tx);

      const departments = await tx.department.findMany({
        where: { organizationId: orgId, status: 'ACTIVE' },
        select: { id: true, name: true, code: true },
      });

      const requirements = await tx.documentRequirement.findMany({
        where: { organizationId: orgId, isRequired: true },
      });

      const employees = await tx.employee.findMany({
        where: { organizationId: orgId, status: 'ACTIVE' },
        select: { id: true, departmentId: true },
      });

      const documents = await tx.employeeDocument.findMany({
        where: { organizationId: orgId, deletedAt: null, status: DocumentStatus.ACTIVE },
        select: { id: true, employeeId: true, category: true, expiryDate: true },
      });

      const now = new Date();

      return departments.map((dept) => {
        const deptEmps = employees.filter((e) => e.departmentId === dept.id);
        const deptReqs = requirements.filter(
          (r) => !r.applicableDepartmentId || r.applicableDepartmentId === dept.id,
        );

        let expected = 0;
        let fulfilled = 0;
        let compliantCount = 0;

        for (const emp of deptEmps) {
          expected += deptReqs.length;
          const empDocs = documents.filter((d) => d.employeeId === emp.id);
          let empFulfilled = 0;

          for (const req of deptReqs) {
            const doc = empDocs.find((d) => d.category === req.category);
            if (doc && (!doc.expiryDate || new Date(doc.expiryDate) >= now)) {
              empFulfilled++;
            }
          }

          fulfilled += empFulfilled;
          if (deptReqs.length > 0 && empFulfilled === deptReqs.length) {
            compliantCount++;
          }
        }

        const rate = expected > 0 ? Math.round((fulfilled / expected) * 1000) / 10 : 100;

        return {
          departmentId: dept.id,
          departmentName: dept.name,
          departmentCode: dept.code,
          totalEmployees: deptEmps.length,
          compliantEmployees: compliantCount,
          complianceRate: rate,
          missingCount: expected - fulfilled,
        };
      });
    });
  }

  /**
   * Read model for the AI assistant (document:read): active employees lacking a valid required document.
   * Strictly read-only: without stored requirements it falls back to the defaults in memory instead of seeding them.
   * `today` is the local calendar date as a UTC-midnight Date (how expiry_date is stored).
   */
  async missingDocumentsForAssistant(userId: string, orgId: string, query: { today: Date; departmentId?: string; limit: number }) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx))) throw new ForbiddenException();
      const stored = await tx.documentRequirement.findMany({ where: { organizationId: orgId, isRequired: true },
        select: { category: true, name: true, applicableDepartmentId: true } });
      const requirements = stored.length ? stored : DEFAULT_REQUIREMENTS.map((r) => ({ ...r, applicableDepartmentId: null }));
      const employees = await tx.employee.findMany({
        where: { organizationId: orgId, status: 'ACTIVE', ...(query.departmentId ? { departmentId: query.departmentId } : {}) },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        select: { id: true, displayName: true, departmentId: true, department: { select: { name: true } } } });
      const valid = await tx.employeeDocument.findMany({ where: { organizationId: orgId, deletedAt: null, status: DocumentStatus.ACTIVE,
        employeeId: { in: employees.map((e) => e.id) }, category: { in: requirements.map((r) => r.category) },
        OR: [{ expiryDate: null }, { expiryDate: { gte: query.today } }] }, select: { employeeId: true, category: true } });
      const held = new Set(valid.map((d) => d.employeeId + '|' + d.category));
      const missing: { employeeId: string; employeeName: string; departmentName: string | null; requirementName: string; category: DocumentCategory }[] = [];
      for (const employee of employees) {
        for (const requirement of requirements) {
          if (requirement.applicableDepartmentId && requirement.applicableDepartmentId !== employee.departmentId) continue;
          if (held.has(employee.id + '|' + requirement.category)) continue;
          missing.push({ employeeId: employee.id, employeeName: employee.displayName, departmentName: employee.department?.name ?? null,
            requirementName: requirement.name, category: requirement.category });
        }
      }
      return { total: missing.length, employeesAffected: new Set(missing.map((m) => m.employeeId)).size, items: missing.slice(0, query.limit) };
    });
  }

  /**
   * Read model for the AI assistant (document:read): documents expiring within `withinDays` or already expired.
   * Titles of SENSITIVE documents are only returned with document:sensitive:read; otherwise they are only counted.
   */
  async expiryAlertsForAssistant(userId: string, orgId: string, query: { kind: 'expiring' | 'expired'; today: Date; withinDays: number;
    departmentId?: string; limit: number }) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx))) throw new ForbiddenException();
      const canSensitive = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_SENSITIVE_READ, orgId, tx);
      const expiry = query.kind === 'expired'
        ? { lt: query.today }
        : { gte: query.today, lte: new Date(query.today.getTime() + query.withinDays * 86_400_000) };
      const where: Prisma.EmployeeDocumentWhereInput = { organizationId: orgId, deletedAt: null, status: { not: DocumentStatus.ARCHIVED },
        expiryDate: expiry, employee: { organizationId: orgId, ...(query.departmentId ? { departmentId: query.departmentId } : {}) } };
      const visible: Prisma.EmployeeDocumentWhereInput = canSensitive ? where : { ...where, sensitivity: 'NORMAL' };
      const [total, hiddenSensitiveCount, documents] = await Promise.all([
        tx.employeeDocument.count({ where: visible }),
        canSensitive ? Promise.resolve(0) : tx.employeeDocument.count({ where: { ...where, sensitivity: 'SENSITIVE' } }),
        tx.employeeDocument.findMany({ where: visible, orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }], take: query.limit,
          select: { id: true, title: true, category: true, expiryDate: true,
            employee: { select: { displayName: true, department: { select: { name: true } } } } } }),
      ]);
      return { total, hiddenSensitiveCount, documents };
    });
  }

  async getMissingDocuments(userId: string, orgId: string) {
    return this.prisma.$transaction(async (tx) => {
      const canRead = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx);
      if (!canRead) throw new ForbiddenException();

      await this.ensureDefaultRequirements(orgId, tx);

      const requirements = await tx.documentRequirement.findMany({
        where: { organizationId: orgId, isRequired: true },
      });

      const employees = await tx.employee.findMany({
        where: { organizationId: orgId, status: 'ACTIVE' },
        include: {
          department: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      const documents = await tx.employeeDocument.findMany({
        where: { organizationId: orgId, deletedAt: null, status: DocumentStatus.ACTIVE },
        select: { id: true, employeeId: true, category: true, expiryDate: true },
      });

      const now = new Date();
      const missingList: Array<{
        employeeId: string;
        employeeCode: string;
        displayName: string;
        jobTitle: string | null;
        departmentId: string | null;
        departmentName: string;
        category: DocumentCategory;
        requirementName: string;
        description: string | null;
      }> = [];

      for (const emp of employees) {
        const empReqs = requirements.filter(
          (r) => !r.applicableDepartmentId || r.applicableDepartmentId === emp.departmentId,
        );
        const empDocs = documents.filter((d) => d.employeeId === emp.id);

        for (const req of empReqs) {
          const doc = empDocs.find((d) => d.category === req.category);
          const isMissing = !doc || (doc.expiryDate && new Date(doc.expiryDate) < now);

          if (isMissing) {
            missingList.push({
              employeeId: emp.id,
              employeeCode: emp.employeeCode,
              displayName: emp.displayName,
              jobTitle: emp.jobTitle,
              departmentId: emp.departmentId,
              departmentName: emp.department?.name || 'Chưa gán phòng ban',
              category: req.category,
              requirementName: req.name,
              description: req.description,
            });
          }
        }
      }

      return missingList;
    });
  }

  async getExpiring(userId: string, orgId: string) {
    return this.prisma.$transaction(async (tx) => {
      const canRead = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx);
      if (!canRead) throw new ForbiddenException();

      const now = new Date();
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);

      const documents = await tx.employeeDocument.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: DocumentStatus.ACTIVE,
          expiryDate: { lte: in30Days },
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              displayName: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { expiryDate: 'asc' },
      });

      const sensitive = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_SENSITIVE_READ, orgId, tx);
      const self = await tx.employee.findFirst({ where: { organizationId: orgId, userId, status: 'ACTIVE' }, select: { id: true } });
      return documents.filter(d => d.sensitivity !== 'SENSITIVE' || sensitive || d.employeeId === self?.id).map((d) => {
        const isExpired = d.expiryDate ? new Date(d.expiryDate) < now : false;
        const diffMs = d.expiryDate ? new Date(d.expiryDate).getTime() - now.getTime() : 0;
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        return {
          id: d.id,
          title: d.title,
          category: d.category,
          documentNumber: d.documentNumber,
          sensitivity: d.sensitivity,
          status: d.status,
          issueDate: d.issueDate,
          expiryDate: d.expiryDate,
          employee: d.employee,
          isExpired,
          daysRemaining,
        };
      });
    });
  }

  async getEmployeeCompliance(userId: string, orgId: string, employeeId: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.authorization.isActiveMember(userId, orgId, tx))) throw new ForbiddenException();
      const callerEmp = await tx.employee.findFirst({
        where: { organizationId: orgId, userId, status: 'ACTIVE' },
      });
      const canRead = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_READ, orgId, tx);
      const isSelf = callerEmp && callerEmp.id === employeeId;

      if (!canRead && !isSelf) throw new ForbiddenException();

      await this.ensureDefaultRequirements(orgId, tx);

      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: orgId },
      });
      if (!employee) throw new NotFoundException('Employee not found');

      const requirements = await tx.documentRequirement.findMany({
        where: {
          organizationId: orgId,
          isRequired: true,
          OR: [{ applicableDepartmentId: null }, { applicableDepartmentId: employee.departmentId }],
        },
      });

      const now = new Date();
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);

      const documents = await tx.employeeDocument.findMany({
        where: {
          organizationId: orgId,
          employeeId,
          deletedAt: null,
        },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      });

      const fulfilledCategories: DocumentCategory[] = [];
      const missingRequirements = [];

      for (const req of requirements) {
        const activeDoc = documents.find(
          (d) => d.category === req.category && d.status === DocumentStatus.ACTIVE,
        );
        const isFulfilled =
          activeDoc && (!activeDoc.expiryDate || new Date(activeDoc.expiryDate) >= now);

        if (isFulfilled) {
          fulfilledCategories.push(req.category);
        } else {
          missingRequirements.push(req);
        }
      }

      const complianceRate =
        requirements.length > 0
          ? Math.round((fulfilledCategories.length / requirements.length) * 1000) / 10
          : 100;

      const sensitive = await this.authorization.can(userId, PERMISSIONS.DOCUMENT_SENSITIVE_READ, orgId, tx);
      const visibleDocuments = documents.filter(d => d.sensitivity !== 'SENSITIVE' || isSelf || sensitive);
      return {
        employeeId,
        totalRequired: requirements.length,
        totalFulfilled: fulfilledCategories.length,
        complianceRate,
        isCompliant: missingRequirements.length === 0,
        missingRequirements,
        documents: visibleDocuments,
      };
    });
  }
}

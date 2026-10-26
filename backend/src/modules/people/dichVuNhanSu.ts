import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { OrganizationMembershipService } from '../organizations/organization-membership.service';
import { DepartmentsService } from '../departments/departments.service';
import type { CreateEmployeeDto, ListEmployeesDto, UpdateEmployeeDto } from './employee.dto';

const projection = { id: true, organizationId: true, userId: true, employeeCode: true, displayName: true,
  departmentId: true, jobTitle: true, phone: true, status: true, createdAt: true, updatedAt: true } satisfies Prisma.EmployeeSelect;
export type EmployeeResponse = Prisma.EmployeeGetPayload<{ select: typeof projection }>;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService,
    private readonly audit: AuditService, private readonly memberships: OrganizationMembershipService,
    private readonly departments: DepartmentsService) {}

  // Trusted application reference queries, after caller authorization in the same serializable transaction.
  async eligibleCreator(organizationId: string, userId: string, tx: Prisma.TransactionClient): Promise<{ id: string; userId: string }> {
    const row = await tx.employee.findUnique({ where: { organizationId_userId: { organizationId, userId } },
      select: { id: true, userId: true, status: true } });
    if (!row) throw new NotFoundException();
    if (row.status !== 'ACTIVE') throw new ConflictException();
    await this.memberships.assertActiveReference(organizationId, row.userId, tx);
    return { id: row.id, userId: row.userId };
  }

  async eligibleAssignee(organizationId: string, id: string, tx: Prisma.TransactionClient): Promise<{ id: string; userId: string }> {
    const row = await tx.employee.findUnique({ where: { organizationId_id: { organizationId, id } },
      select: { id: true, userId: true, status: true } });
    if (!row) throw new NotFoundException();
    if (row.status !== 'ACTIVE') throw new ConflictException();
    await this.memberships.assertActiveReference(organizationId, row.userId, tx);
    return { id: row.id, userId: row.userId };
  }

  create(actorId: string, organizationId: string, input: CreateEmployeeDto): Promise<EmployeeResponse> {
    return this.transaction(actorId, organizationId, PERMISSIONS.EMPLOYEE_CREATE, async (tx) => {
      await this.memberships.assertActiveReference(organizationId, input.userId, tx);
      if (input.departmentId) await this.departments.assertActiveReference(organizationId, input.departmentId, tx);
      const row = await tx.employee.create({ data: { organizationId, userId: input.userId, employeeCode: input.employeeCode,
        displayName: input.displayName, departmentId: input.departmentId ?? null, jobTitle: input.jobTitle ?? null,
        phone: input.phone ?? null }, select: projection });
      await this.audit.record({ event: AUDIT_EVENTS.EMPLOYEE_CREATED, organizationId, actorUserId: actorId, resourceId: row.id }, tx);
      return row;
    });
  }

  list(actorId: string, organizationId: string, query: ListEmployeesDto) {
    return this.transaction(actorId, organizationId, PERMISSIONS.EMPLOYEE_READ, async (tx) => {
      const rows = await tx.employee.findMany({ where: { organizationId,
        ...(query.after ? { id: { gt: query.after } } : {}), ...(query.status ? { status: query.status } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}), ...(query.userId ? { userId: query.userId } : {}) },
      select: projection, orderBy: { id: 'asc' }, take: query.limit + 1 });
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
    });
  }

  /**
   * Read model for the AI assistant (employee:read): find employees by name or code.
   * The utf8mb4_unicode_ci collation makes the match case- and accent-insensitive ("Thu Ha" finds "Thu Hà").
   */
  searchForAssistant(actorId: string, organizationId: string, query: { text: string; departmentId?: string; limit: number }) {
    return this.transaction(actorId, organizationId, PERMISSIONS.EMPLOYEE_READ, async (tx) => {
      const where: Prisma.EmployeeWhereInput = { organizationId, ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        OR: [{ displayName: { contains: query.text } }, { employeeCode: { contains: query.text } }] };
      const total = await tx.employee.count({ where });
      const items = await tx.employee.findMany({ where, orderBy: [{ status: 'asc' }, { displayName: 'asc' }, { id: 'asc' }], take: query.limit,
        select: { id: true, employeeCode: true, displayName: true, jobTitle: true, status: true, department: { select: { name: true } } } });
      return { total, items };
    });
  }

  getById(actorId: string, organizationId: string, employeeId: string): Promise<EmployeeResponse> {
    return this.transaction(actorId, organizationId, PERMISSIONS.EMPLOYEE_READ, (tx) => this.find(tx, organizationId, employeeId));
  }

  update(actorId: string, organizationId: string, employeeId: string, input: UpdateEmployeeDto): Promise<EmployeeResponse> {
    return this.transaction(actorId, organizationId, PERMISSIONS.EMPLOYEE_UPDATE, async (tx) => {
      const keys = ['displayName', 'jobTitle', 'phone', 'departmentId', 'status'] as const;
      if (!keys.some((key) => input[key] !== undefined)) throw new BadRequestException({ message: ['At least one editable field is required.'] });
      const existing = await this.find(tx, organizationId, employeeId);
      const changedFields = keys.filter((key) => input[key] !== undefined && input[key] !== existing[key]);
      if (!changedFields.length) return existing;
      if (changedFields.includes('status') && input.status === 'ACTIVE') {
        await this.memberships.assertActiveReference(organizationId, existing.userId, tx);
      }
      if (changedFields.includes('departmentId') && input.departmentId) {
        await this.departments.assertActiveReference(organizationId, input.departmentId, tx);
      }
      const row = await tx.employee.update({ where: { organizationId_id: { organizationId, id: employeeId } },
        data: { displayName: input.displayName, jobTitle: input.jobTitle, phone: input.phone,
          departmentId: input.departmentId, status: input.status }, select: projection });
      await this.audit.record({ event: AUDIT_EVENTS.EMPLOYEE_UPDATED, organizationId, actorUserId: actorId,
        resourceId: row.id, metadata: { changedFields } }, tx);
      return row;
    });
  }

  private async find(tx: Prisma.TransactionClient, organizationId: string, id: string): Promise<EmployeeResponse> {
    const row = await tx.employee.findUnique({ where: { organizationId_id: { organizationId, id } }, select: projection });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async transaction<T>(actorId: string, organizationId: string, permission: PermissionKey,
    operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          if (!(await this.authorization.can(actorId, permission, organizationId, tx))) throw new ForbiddenException();
          return operation(tx);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException();
      }
    }
  }
}

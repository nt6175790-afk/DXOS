// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from './authorization.service';
import { PERMISSIONS as P, type PermissionKey } from './permission-catalog';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import type { AccountListDto, CreateOrganizationRoleDto, CreateOrganizationUserDto, UpdateOrganizationRoleDto, UpdateOrganizationUserDto } from './organization-accounts.dto';
const userView = { id: true, email: true, displayName: true, accountStatus: true } as const;
const roleView = { id: true, key: true, name: true, isActive: true, permissionAssignments: { select: { permission: { select: { key: true } } } } } as const;
@Injectable()
export class OrganizationAccountsService {
  constructor(private readonly db: PrismaService, private readonly auth: AuthorizationService, private readonly audit: AuditService) {}
  private async require(tx: Prisma.TransactionClient, actor: string, org: string, key: PermissionKey) {
    const keys = await this.auth.effectivePermissions(actor, org, tx);
    if (!keys?.includes(key)) throw new ForbiddenException();
    return keys;
  }
  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(e.code)) throw new ConflictException('Resource already exists or changed; reload'); throw e; }
  }
  list(actor: string, org: string, input: AccountListDto) {
    return this.transaction(async tx => {
      await this.require(tx, actor, org, P.USER_READ);
      if (input.after && !await tx.organizationMembership.findFirst({ where: { organizationId: org, userId: input.after } })) throw new BadRequestException();
      const rows = await tx.organizationMembership.findMany({ where: { organizationId: org, ...(input.after ? { userId: { gt: input.after } } : {}) },
        orderBy: { userId: 'asc' }, take: input.limit + 1, select: { id: true, status: true, user: { select: userView } } });
      const items = rows.slice(0, input.limit).map(r => ({ ...r.user, membershipId: r.id, membershipStatus: r.status }));
      return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null };
    });
  }
  get(actor: string, org: string, userId: string) {
    return this.transaction(async tx => {
      await this.require(tx, actor, org, P.USER_READ);
      const row = await tx.organizationMembership.findFirst({ where: { organizationId: org, userId }, select: { id: true, status: true, user: { select: userView } } });
      if (!row) throw new NotFoundException();
      return { ...row.user, membershipId: row.id, membershipStatus: row.status };
    });
  }
  async create(actor: string, org: string, input: CreateOrganizationUserDto) {
    if (!await this.auth.can(actor, P.USER_CREATE, org)) throw new ForbiddenException();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    return this.transaction(async tx => {
      await this.require(tx, actor, org, P.USER_CREATE);
      // Existing identities are never auto-linked by a guessed email across tenants.
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw new ConflictException('Account cannot be provisioned with this email');
      const user = await tx.user.create({ data: { email: input.email, displayName: input.displayName, passwordHash }, select: userView });
      const membership = await tx.organizationMembership.create({ data: { userId: user.id, organizationId: org } });
      await this.audit.record({ event: AUDIT_EVENTS.USER_CREATED, actorUserId: actor, organizationId: org, resourceId: user.id }, tx);
      return { ...user, membershipId: membership.id, membershipStatus: membership.status };
    });
  }
  update(actor: string, org: string, userId: string, input: UpdateOrganizationUserDto) {
    return this.transaction(async tx => {
      await this.require(tx, actor, org, P.USER_UPDATE);
      if (actor === userId) throw new ForbiddenException('Use self-service for your own identity');
      const row = await tx.organizationMembership.findFirst({ where: { organizationId: org, userId }, select: { id: true } });
      if (!row) throw new NotFoundException();
      if (!Object.values(input).some(v => v !== undefined)) throw new BadRequestException();
      if (input.displayName !== undefined) {
        if (await tx.organizationMembership.count({ where: { userId, organizationId: { not: org } } })) throw new ConflictException('Shared identity must be edited through self-service');
        await tx.user.update({ where: { id: userId }, data: { displayName: input.displayName } });
      }
      if (input.membershipStatus) await tx.organizationMembership.update({ where: { id: row.id }, data: { status: input.membershipStatus } });
      await this.audit.record({ event: AUDIT_EVENTS.USER_UPDATED, actorUserId: actor, organizationId: org, resourceId: userId }, tx);
      return { ...await tx.user.findUniqueOrThrow({ where: { id: userId }, select: userView }), membershipId: row.id,
        membershipStatus: (await tx.organizationMembership.findUniqueOrThrow({ where: { id: row.id } })).status };
    });
  }
  remove(actor: string, org: string, userId: string) {
    return this.transaction(async tx => {
      await this.require(tx, actor, org, P.USER_DELETE);
      if (actor === userId) throw new ForbiddenException('Cannot remove your own membership');
      const row = await tx.organizationMembership.findFirst({ where: { organizationId: org, userId }, select: { id: true } });
      if (!row) throw new NotFoundException();
      await tx.membershipRole.deleteMany({ where: { organizationId: org, membershipId: row.id } });
      await tx.organizationMembership.update({ where: { id: row.id }, data: { status: 'REMOVED' } });
      await this.audit.record({ event: AUDIT_EVENTS.MEMBERSHIP_REMOVED, actorUserId: actor, organizationId: org, resourceId: userId }, tx);
      return { removed: true, userId };
    });
  }
  role(actor: string, org: string, roleId: string) {
    return this.transaction(async tx => {
      await this.require(tx, actor, org, P.ROLE_READ);
      const row = await tx.role.findFirst({ where: { id: roleId, organizationId: org }, select: roleView });
      if (!row) throw new NotFoundException();
      return this.safeRole(row);
    });
  }
  private safeRole(row: { id: string; key: string; name: string; isActive: boolean; permissionAssignments: { permission: { key: string } }[] }) {
    return { id: row.id, key: row.key, name: row.name, isActive: row.isActive, permissionKeys: row.permissionAssignments.map(p => p.permission.key).sort() };
  }
  catalog(actor: string, org: string) {
    return this.transaction(async tx => { await this.require(tx, actor, org, P.ROLE_READ); return { items: Object.values(P).sort().map(key => ({ key })) }; });
  }
  createRole(actor: string, org: string, input: CreateOrganizationRoleDto) {
    return this.transaction(async tx => {
      const own = await this.require(tx, actor, org, P.ROLE_CREATE);
      if (input.permissionKeys.length && (!own.includes(P.ROLE_ASSIGN) || input.permissionKeys.some(p => !own.includes(p as PermissionKey)))) throw new ForbiddenException();
      const permissions = await tx.permission.findMany({ where: { key: { in: input.permissionKeys } }, select: { id: true } });
      if (permissions.length !== input.permissionKeys.length) throw new BadRequestException('Unknown permission');
      const row = await tx.role.create({ data: { organizationId: org, key: input.key, name: input.name,
        permissionAssignments: { create: permissions.map(p => ({ permissionId: p.id })) } }, select: roleView });
      await this.audit.record({ event: AUDIT_EVENTS.ROLE_CREATED, actorUserId: actor, organizationId: org, resourceId: row.id }, tx);
      return this.safeRole(row);
    });
  }
  updateRole(actor: string, org: string, roleId: string, input: UpdateOrganizationRoleDto) {
    return this.transaction(async tx => {
      const own = await this.require(tx, actor, org, P.ROLE_UPDATE);
      const row = await tx.role.findFirst({ where: { id: roleId, organizationId: org }, select: { id: true } });
      if (!row) throw new NotFoundException();
      if (await tx.membershipRole.count({ where: { roleId, membership: { userId: actor } } })) throw new ForbiddenException('Cannot edit a role assigned to yourself');
      if (!Object.values(input).some(v => v !== undefined)) throw new BadRequestException();
      if (input.isActive === false && await tx.membershipRole.count({ where: { roleId } })) throw new ConflictException('Revoke assignments before deactivating role');
      if (input.permissionKeys) {
        if (!own.includes(P.ROLE_ASSIGN) || input.permissionKeys.some(p => !own.includes(p as PermissionKey))) throw new ForbiddenException();
        const permissions = await tx.permission.findMany({ where: { key: { in: input.permissionKeys } }, select: { id: true } });
        if (permissions.length !== input.permissionKeys.length) throw new BadRequestException();
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({ data: permissions.map(p => ({ roleId, permissionId: p.id })) });
      }
      const updated = await tx.role.update({ where: { id: roleId }, data: { name: input.name, isActive: input.isActive }, select: roleView });
      await this.audit.record({ event: AUDIT_EVENTS.ROLE_UPDATED, actorUserId: actor, organizationId: org, resourceId: roleId }, tx);
      return this.safeRole(updated);
    });
  }
  deleteRole(actor: string, org: string, roleId: string) {
    return this.transaction(async tx => {
      await this.require(tx, actor, org, P.ROLE_DELETE);
      if (!await tx.role.findFirst({ where: { id: roleId, organizationId: org }, select: { id: true } })) throw new NotFoundException();
      if (await tx.membershipRole.count({ where: { roleId } })) throw new ConflictException('Role is assigned; revoke assignments first');
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.role.delete({ where: { id: roleId } });
      await this.audit.record({ event: AUDIT_EVENTS.ROLE_DELETED, actorUserId: actor, organizationId: org, resourceId: roleId }, tx);
      return { deleted: true, roleId };
    });
  }
}

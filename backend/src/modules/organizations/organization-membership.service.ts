// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

@Injectable()
export class OrganizationMembershipService {
  // Internal reference validation only. Caller must authorize its operation and supply the same transaction.
  async assertActiveReference(organizationId: string, userId: string,
    tx: Pick<Prisma.TransactionClient, 'organizationMembership'>): Promise<void> {
    const membership = await tx.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { status: true, user: { select: { accountStatus: true } } },
    });
    // Do not perform a global User lookup: absent user and foreign/non-member user are indistinguishable.
    if (!membership) throw new NotFoundException();
    if (membership.status !== 'ACTIVE' || membership.user.accountStatus !== 'ACTIVE') throw new ConflictException();
  }
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { NotificationService } from '../../backend/src/modules/notifications/notification.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { OrganizationsService } from '../../backend/src/modules/organizations/organizations.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';

describe('organization transaction boundary', () => {
  const transaction = jest.fn();
  const can = jest.fn();
  const canCreateOrganization = jest.fn();
  const service = new OrganizationsService({ $transaction: transaction } as unknown as PrismaService,
    { can, canCreateOrganization } as unknown as AuthorizationService, { record: jest.fn() } as unknown as AuditService, { createForRecipient: jest.fn() } as unknown as NotificationService);
  const conflict = () => new Prisma.PrismaClientKnownRequestError('test transaction conflict', { code: 'P2034', clientVersion: '6.19.3' });
  beforeEach(() => jest.resetAllMocks());

  it('retries serialization failures up to three attempts with serializable isolation', async () => {
    transaction.mockRejectedValueOnce(conflict()).mockRejectedValueOnce(conflict()).mockResolvedValue({ id: 'result' });
    await expect(service.get('user', 'organization')).resolves.toEqual({ id: 'result' });
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('returns conflict after bounded retries', async () => {
    transaction.mockRejectedValue(conflict());
    await expect(service.get('user', 'organization')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it('does not retry unrelated operational failures', async () => {
    transaction.mockRejectedValue(new Error('failure'));
    await expect(service.get('user', 'organization')).rejects.toThrow('failure');
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it('uses the transaction client for authorization and does not write after denial', async () => {
    const tx = { organization: { update: jest.fn() } };
    transaction.mockImplementation((operation: (client: unknown) => Promise<unknown>) => operation(tx));
    can.mockResolvedValue(false);
    await expect(service.update('user', 'organization', { name: 'Name' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(can).toHaveBeenCalledWith('user', 'organization:update', 'organization', tx);
    expect(tx.organization.update).not.toHaveBeenCalled();
  });
});

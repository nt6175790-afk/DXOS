// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { notificationContent, CreateNotification } from '../../backend/src/modules/notifications/notification-catalog';
import { NotificationService } from '../../backend/src/modules/notifications/notification.service';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { AuthorizationService } from '../../backend/src/modules/rbac/authorization.service';
import { AuditService } from '../../backend/src/modules/audit/audit.service';

describe('notification input boundary and transaction retries', () => {
  const input = { organizationId: randomUUID(), recipientUserId: randomUUID(), type: 'organization.updated' as const };
  it.each([
    { type: 'future.fake' }, { title: 'forged' }, { body: 'x'.repeat(1001) }, { readAt: new Date() },
    { metadata: { password: 'never persist' } }, { metadata: { changedFields: ['name', 'name'] } },
    { metadata: { changedFields: ['x'.repeat(2000)] } }, { metadata: [] }, { metadata: 'bad' },
    { metadata: { nested: { apiKey: 'never persist' } } },
  ])('rejects invalid content/metadata %j', (override) => {
    expect(() => notificationContent({ ...input, ...override } as unknown as CreateNotification)).toThrow(BadRequestException);
  });
  it('accepts only fixed bounded content, with optional allowlisted metadata', () => {
    for (const metadata of [undefined, {}, { changedFields: ['name'] as ['name'] }]) {
      const content = notificationContent({ ...input, metadata });
      expect(content.title.length).toBeGreaterThan(0); expect(content.title.length).toBeLessThanOrEqual(200);
      expect(content.body.length).toBeGreaterThan(0); expect(content.body.length).toBeLessThanOrEqual(1000);
      expect(Buffer.byteLength(JSON.stringify(content.metadata))).toBeLessThanOrEqual(1024);
    }
  });
  it('renders Task assignment using only a bounded task UUID', () => {
    const taskId = randomUUID();
    expect(notificationContent({ ...input, type: 'task.assigned', metadata: { taskId } })).toEqual({
      title: 'Task assigned', body: 'A task was assigned to you.', metadata: { taskId } });
  });
  it.each([{}, { taskId: 'bad' }, { taskId: randomUUID(), changedFields: ['name'] }, { taskId: randomUUID(), title: 'private' }])(
    'rejects invalid Task notification metadata %j', (metadata) => {
      expect(() => notificationContent({ ...input, type: 'task.assigned', metadata } as CreateNotification)).toThrow(BadRequestException);
    });
  it('does not allow Task metadata in existing organization notifications', () => {
    expect(() => notificationContent({ ...input, metadata: { taskId: randomUUID() } })).toThrow(BadRequestException);
  });
  it('bounds serialization retries and reports conflict without retrying unrelated errors', async () => {
    const transaction = jest.fn();
    const service = new NotificationService({ $transaction: transaction } as unknown as PrismaService,
      {} as AuthorizationService, {} as AuditService);
    const conflict = new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '6.19.3' });
    transaction.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ items: [] });
    await expect(service.list(input.recipientUserId, input.organizationId, { limit: 25 })).resolves.toEqual({ items: [] });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    transaction.mockReset().mockRejectedValue(conflict);
    await expect(service.markRead(input.recipientUserId, input.organizationId, randomUUID())).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).toHaveBeenCalledTimes(3);
    transaction.mockReset().mockRejectedValue(new Error('operational failure'));
    await expect(service.createForRecipient(input)).rejects.toThrow('operational failure');
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

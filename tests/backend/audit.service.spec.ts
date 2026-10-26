// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { AuditService, type AuditInput } from '../../backend/src/modules/audit/audit.service';
import { AUDIT_EVENTS } from '../../backend/src/modules/audit/audit-catalog';
import type { PrismaService } from '../../backend/src/database/prisma.service';
import { currentRequest } from '../../backend/src/common/http/request-context';

describe('audit writer safety', () => {
  const create = jest.fn().mockResolvedValue({});
  const writer = new AuditService({ auditEvent: { create } } as unknown as PrismaService);
  const actor = '8d877a9c-5cbe-4c5b-86b8-3a43ca968b7e';
  const organizationId = 'eb42cce7-7209-4adc-9e71-16fbc6467850';
  beforeEach(() => jest.clearAllMocks());

  it('records system events with a nullable actor and server timestamp', async () => {
    await writer.record({ event: AUDIT_EVENTS.ORGANIZATION_UPDATED, organizationId });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: null,
      source: 'SYSTEM', requestId: null, createdAt: expect.any(Date), outcome: 'SUCCESS', organizationId }) });
  });
  it('reuses request correlation and verified actor context', async () => {
    await currentRequest.run({ requestId: 'audit-request-1234', actorUserId: actor }, () =>
      writer.record({ event: AUDIT_EVENTS.ORGANIZATION_UPDATED, organizationId }));
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: actor, source: 'HTTP', requestId: 'audit-request-1234' }) });
  });
  it('keeps concurrent request contexts separate', async () => {
    await Promise.all(['request-one-1234', 'request-two-1234'].map((requestId) => currentRequest.run({ requestId }, async () => {
      await Promise.resolve();
      await writer.record({ event: AUDIT_EVENTS.LOGIN_FAILURE });
    })));
    expect(create.mock.calls.map(([input]) => input.data.requestId).sort()).toEqual(['request-one-1234', 'request-two-1234']);
  });
  it.each(['password', 'passwordHash', 'Authorization', 'cookie', 'refreshToken', 'jwtSecret', 'apiKey', 'DATABASE_URL', 'nested'])(
    'rejects metadata key %s without persisting credentials', async (key) => {
      await expect(writer.record({ event: AUDIT_EVENTS.LOGIN_FAILURE, metadata: { [key]: 'secret-value' } } as AuditInput)).rejects.toThrow('Invalid audit');
      expect(create).not.toHaveBeenCalled();
    });
  it.each([{ reason: 'password=secret' }, { permission: 'Bearer secret' }, { changedFields: ['password'] }, { reason: 'x'.repeat(2048) }, 42, ['name']])(
    'rejects invalid or oversized metadata %j', async (metadata) => {
      await expect(writer.record({ event: AUDIT_EVENTS.LOGIN_FAILURE, metadata } as AuditInput)).rejects.toThrow('Invalid audit');
      expect(create).not.toHaveBeenCalled();
    });
  it('rejects actor spoofing inside an authenticated request', async () => {
    await expect(currentRequest.run({ requestId: 'audit-request-1234', actorUserId: actor }, () =>
      writer.record({ event: AUDIT_EVENTS.LOGIN_SUCCESS, actorUserId: organizationId }))).rejects.toThrow('Invalid audit');
    expect(create).not.toHaveBeenCalled();
  });
  it.each([{ event: 'fake.event' }, { event: AUDIT_EVENTS.LOGIN_SUCCESS, organizationId },
    { event: AUDIT_EVENTS.ORGANIZATION_CREATED }, { event: AUDIT_EVENTS.LOGIN_SUCCESS, actorUserId: 'invalid' },
    { event: AUDIT_EVENTS.LOGIN_SUCCESS, createdAt: 'yesterday' }, { event: AUDIT_EVENTS.LOGIN_SUCCESS, source: 'SYSTEM' }])(
    'rejects unsupported or spoofed event fields %j', async (input) => {
      await expect(writer.record(input as AuditInput)).rejects.toThrow('Invalid audit');
      expect(create).not.toHaveBeenCalled();
    });
  it('does not swallow persistence failures', async () => {
    create.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(writer.record({ event: AUDIT_EVENTS.LOGIN_FAILURE })).rejects.toThrow('storage unavailable');
  });
  it('accepts only bounded department update field names for the new event', async () => {
    await writer.record({ event: AUDIT_EVENTS.DEPARTMENT_UPDATED, organizationId,
      metadata: { changedFields: ['name', 'description', 'status'] } });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ resourceType: 'department',
      metadata: { changedFields: ['name', 'description', 'status'] } }) });
  });
  it.each([[], ['name', 'name'], ['code'], ['parentDepartmentId'], ['password'], ['description', 'secret-value']].map((changedFields) => ({ changedFields })))(
    'rejects invalid department audit fields %j', async ({ changedFields }) => {
      await expect(writer.record({ event: AUDIT_EVENTS.DEPARTMENT_UPDATED, organizationId,
        metadata: { changedFields } } as AuditInput)).rejects.toThrow('Invalid audit');
      expect(create).not.toHaveBeenCalled();
    });
  it('does not broaden metadata policy of existing organization events', async () => {
    await expect(writer.record({ event: AUDIT_EVENTS.ORGANIZATION_UPDATED, organizationId,
      metadata: { changedFields: ['description'] } })).rejects.toThrow('Invalid audit');
    expect(create).not.toHaveBeenCalled();
  });
  it('accepts only bounded Employee changed-field names', async () => {
    await writer.record({ event: AUDIT_EVENTS.EMPLOYEE_UPDATED, organizationId,
      metadata: { changedFields: ['displayName', 'jobTitle', 'phone', 'departmentId', 'status'] } });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ resourceType: 'employee',
      metadata: { changedFields: ['displayName', 'jobTitle', 'phone', 'departmentId', 'status'] } }) });
  });
  it.each([[], ['phone', 'phone'], ['userId'], ['employeeCode'], ['passwordHash'], ['+84901234567'], ['name']].map((changedFields) => ({ changedFields })))(
    'rejects unsafe Employee changed fields %j', async ({ changedFields }) => {
      await expect(writer.record({ event: AUDIT_EVENTS.EMPLOYEE_UPDATED, organizationId, metadata: { changedFields } } as AuditInput)).rejects.toThrow('Invalid audit');
      expect(create).not.toHaveBeenCalled();
    });
  it('does not broaden Department metadata for Employee fields', async () => {
    await expect(writer.record({ event: AUDIT_EVENTS.DEPARTMENT_UPDATED, organizationId,
      metadata: { changedFields: ['phone'] } })).rejects.toThrow('Invalid audit');
    expect(create).not.toHaveBeenCalled();
  });
  it('has no mutation or deletion service entry point', () => {
    expect(Object.getOwnPropertyNames(AuditService.prototype).sort()).toEqual(['constructor', 'record']);
  });
  it('accepts bounded Task field names without values', async () => {
    await writer.record({ event: AUDIT_EVENTS.TASK_UPDATED, organizationId,
      metadata: { changedFields: ['title', 'description', 'assigneeEmployeeId', 'departmentId', 'status', 'priority', 'dueAt'] } });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ resourceType: 'task' }) });
  });
  it.each([
    { event: AUDIT_EVENTS.TASK_UPDATED, changedFields: ['creatorEmployeeId'] },
    { event: AUDIT_EVENTS.TASK_UPDATED, changedFields: ['title', 'title'] },
    { event: AUDIT_EVENTS.TASK_ASSIGNED, changedFields: ['phone'] },
    { event: AUDIT_EVENTS.TASK_STATUS_CHANGED, changedFields: ['title'] },
    { event: AUDIT_EVENTS.EMPLOYEE_UPDATED, changedFields: ['dueAt'] },
  ])('keeps event-specific Task metadata boundaries $event $changedFields', async ({ event, changedFields }) => {
    await expect(writer.record({ event, organizationId, metadata: { changedFields } } as AuditInput)).rejects.toThrow('Invalid audit');
    expect(create).not.toHaveBeenCalled();
  });
});

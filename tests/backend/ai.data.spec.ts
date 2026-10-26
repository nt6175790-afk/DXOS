// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConfigService } from '@nestjs/config';
import { AiDataService } from '../../backend/src/modules/ai/ai-data.service';
import { GeminiAiProvider } from '../../backend/src/modules/ai/gemini-ai.provider';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';
import { AiProviderLimit, AiProviderNotConfigured } from '../../backend/src/modules/ai/ai-provider';
import type { AppConfiguration } from '../../backend/src/config/environment';

describe('AiDataService and AI Hardening (DXOS-PHASE3-TASK1)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockPrisma = {
    employee: {
      count: jest.fn(),
    },
    department: {
      findMany: jest.fn(),
    },
    attendanceRecord: {
      count: jest.fn(),
    },
    leaveRequest: {
      count: jest.fn(),
    },
    payrollPeriod: {
      findFirst: jest.fn(),
    },
    employeeDocument: {
      count: jest.fn(),
    },
    documentRequirement: {
      count: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
  };

  const mockAuthz = {
    effectivePermissions: jest.fn(),
  };

  it('enforces RBAC on employee statistics', async () => {
    const service = new AiDataService(mockPrisma as unknown as ConstructorParameters<typeof AiDataService>[0], mockAuthz as unknown as ConstructorParameters<typeof AiDataService>[1]);

    // 1. Without employee:read -> null
    const withoutPerm = await service.getEmployeeStatistics('org-1', new Set());
    expect(withoutPerm).toBeNull();
    expect(mockPrisma.employee.count).not.toHaveBeenCalled();

    // 2. With employee:read -> returns data scoped by organizationId
    mockPrisma.employee.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(8)  // active
      .mockResolvedValueOnce(2); // inactive

    const withPerm = await service.getEmployeeStatistics('org-1', new Set([PERMISSIONS.EMPLOYEE_READ]));
    expect(withPerm).toEqual({ total: 10, active: 8, inactive: 2 });
    expect(mockPrisma.employee.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
  });

  it('enforces RBAC on payroll statistics and protects compensation data', async () => {
    const service = new AiDataService(mockPrisma as unknown as ConstructorParameters<typeof AiDataService>[0], mockAuthz as unknown as ConstructorParameters<typeof AiDataService>[1]);

    // 1. Without payroll:read -> null
    const withoutPerm = await service.getPayrollStatistics('org-1', new Set([PERMISSIONS.EMPLOYEE_READ]));
    expect(withoutPerm).toBeNull();
    expect(mockPrisma.payrollPeriod.findFirst).not.toHaveBeenCalled();

    // 2. With payroll:read -> returns summary
    mockPrisma.payrollPeriod.findFirst.mockResolvedValueOnce({
      name: 'Bảng lương tháng 09/2026',
      status: 'APPROVED',
      totalNet: 150000000,
    });

    const withPerm = await service.getPayrollStatistics('org-1', new Set([PERMISSIONS.PAYROLL_READ]));
    expect(withPerm).toEqual({
      latestPeriod: 'Bảng lương tháng 09/2026',
      status: 'APPROVED',
      totalNetAmount: 150000000,
    });
    expect(mockPrisma.payrollPeriod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) })
    );
  });

  it('builds context summary enforcing tenant isolation and warning against unauthorized payroll access', async () => {
    const service = new AiDataService(mockPrisma as unknown as ConstructorParameters<typeof AiDataService>[0], mockAuthz as unknown as ConstructorParameters<typeof AiDataService>[1]);

    mockPrisma.organization.findUnique.mockResolvedValueOnce({
      name: 'Công ty Công nghệ DX-OS',
      slug: 'dx-tech',
    });

    // Caller only has employee:read and attendance:read (NO payroll:read)
    mockAuthz.effectivePermissions.mockResolvedValueOnce([
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.ATTENDANCE_READ,
    ]);

    mockPrisma.employee.count.mockResolvedValue(5);
    mockPrisma.attendanceRecord.count.mockResolvedValue(1);

    const summary = await service.buildContextSummary('org-1', 'usr-1');

    expect(summary).toContain('Công ty Công nghệ DX-OS');
    expect(summary).toContain('Tổng số nhân sự: 5');
    // Critical: Payroll disclosure is explicitly denied in prompt when permission is missing
    expect(summary).toContain('Người dùng hiện tại KHÔNG có quyền xem thông tin lương (payroll:read)');
    expect(mockPrisma.payrollPeriod.findFirst).not.toHaveBeenCalled();
  });

  it('GeminiAiProvider fails closed when API key is missing', async () => {
    const app = { aiProvider: 'gemini', aiModel: 'gemini-1.5-flash' } as AppConfiguration;
    const provider = new GeminiAiProvider(new ConfigService({ app }));

    await expect(
      provider.generateText(
        { model: 'gemini-1.5-flash', messages: [{ role: 'user', content: 'test' }], maxOutputTokens: 64, temperature: 0 },
        { requestId: 'req-1', signal: new AbortController().signal }
      )
    ).rejects.toBeInstanceOf(AiProviderNotConfigured);
  });

  it('GeminiAiProvider normalizes OpenAI-compatible responses', async () => {
    const app = {
      aiProvider: 'gemini',
      aiModel: 'gemini-1.5-flash',
      aiApiKey: 'gemini-secret-key',
    } as AppConfiguration;
    const provider = new GeminiAiProvider(new ConfigService({ app }));

    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Phản hồi từ Gemini' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        }),
        { status: 200 }
      )
    );

    const result = await provider.generateText(
      { model: 'gemini-1.5-flash', messages: [{ role: 'user', content: 'Xin chào' }], maxOutputTokens: 64, temperature: 0 },
      { requestId: 'req-1', signal: new AbortController().signal }
    );

    expect(result).toEqual({
      text: 'Phản hồi từ Gemini',
      finishReason: 'stop',
      usage: { inputTokens: 12, outputTokens: 8 },
    });
  });

  it('GeminiAiProvider maps rate limits to AiProviderLimit', async () => {
    const app = {
      aiProvider: 'gemini',
      aiModel: 'gemini-1.5-flash',
      aiApiKey: 'gemini-secret-key',
    } as AppConfiguration;
    const provider = new GeminiAiProvider(new ConfigService({ app }));

    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Rate limit', { status: 429 }));

    await expect(
      provider.generateText(
        { model: 'gemini-1.5-flash', messages: [{ role: 'user', content: 'Test' }], maxOutputTokens: 64, temperature: 0 },
        { requestId: 'req-1', signal: new AbortController().signal }
      )
    ).rejects.toBeInstanceOf(AiProviderLimit);
  });
});

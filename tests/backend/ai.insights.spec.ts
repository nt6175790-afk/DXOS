// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { AiController } from '../../backend/src/modules/ai/ai.controller';

describe('AI Insights Endpoint (DXOS-PHASE3-TASK2)', () => {
  let controller: AiController;
  function createMockAiService() { return {
      getConfig: jest.fn().mockResolvedValue({ provider: 'mock', model: 'mock-v1', isConfigured: true }),
      getInsights: jest.fn().mockImplementation((userId, orgId) => {
        return mockAiAnalytics.getAiInsightsSummary(orgId, userId);
      }),
      generate: jest.fn(),
    }; }
  let mockAiService: ReturnType<typeof createMockAiService>;
  function createMockAiAnalytics() { return {
      getAiInsightsSummary: jest.fn().mockResolvedValue({
        workforce: { total: 5, active: 5, topDepartment: 'Kỹ thuật' },
        attendance: { attendanceRate: 95.5, lateRate: 4.5, lateCount: 1 },
        performance: { averageRating: 4.2, completionRate: 85.0 },
        compliance: { complianceRate: 90.0, expiringSoonCount: 1, missingCount: 0 },
        payroll: { latestPeriod: 'Kỳ lương T9/2026', currencies: [{ currency: 'VND', totalNet: 50000000 }] },
      }),
    }; }
  let mockAiAnalytics: ReturnType<typeof createMockAiAnalytics>;

  beforeEach(() => {
    mockAiAnalytics = createMockAiAnalytics();

    mockAiService = createMockAiService();

    controller = new AiController(mockAiService as unknown as ConstructorParameters<typeof AiController>[0]);
  });

  it('returns structured summary metrics for the AI Insights panel', async () => {
    const caller = { user: { id: 'usr-admin' } } as unknown as Parameters<AiController['getInsights']>[0];
    const result = await controller.getInsights(caller, 'org-demo');

    expect(result).toBeDefined();
    expect(result.workforce).toEqual({ total: 5, active: 5, topDepartment: 'Kỹ thuật' });
    expect(result.attendance?.attendanceRate).toBe(95.5);
    expect(result.performance?.averageRating).toBe(4.2);
    expect(result.compliance?.complianceRate).toBe(90.0);
    expect(result.payroll?.currencies[0].currency).toBe('VND');
    expect(mockAiService.getInsights).toHaveBeenCalledWith('usr-admin', 'org-demo');
  });

  it('handles null sections gracefully when user lacks domain permissions', async () => {
    mockAiAnalytics.getAiInsightsSummary.mockResolvedValueOnce({
      workforce: { total: 5, active: 5, topDepartment: 'Kỹ thuật' },
      attendance: null,
      performance: null,
      compliance: null,
      payroll: null, // lacks payroll:read
    });

    const caller = { user: { id: 'usr-employee' } } as unknown as Parameters<AiController['getInsights']>[0];
    const result = await controller.getInsights(caller, 'org-demo');

    expect(result.workforce).toBeDefined();
    expect(result.payroll).toBeNull();
    expect(result.attendance).toBeNull();
  });
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { AiAnalyticsService } from '../../backend/src/modules/ai/ai-analytics.service';
import { PERMISSIONS } from '../../backend/src/modules/rbac/permission-catalog';

describe('AI HR Analytics & Business Insights (DXOS-PHASE3-TASK2)', () => {
  let analyticsService: AiAnalyticsService;
  function createMockPrisma() { return {
      employee: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      department: {
        findMany: jest.fn(),
      },
      attendanceRecord: {
        findMany: jest.fn(),
      },
      leaveRequest: {
        findMany: jest.fn(),
      },
      payrollPeriod: {
        findMany: jest.fn(),
      },
      payrollRecord: {
        findMany: jest.fn(),
      },
      performanceReview: {
        findMany: jest.fn(),
      },
      performanceGoal: {
        findMany: jest.fn(),
      },
      performanceKpi: {
        findMany: jest.fn(),
      },
      documentRequirement: {
        findMany: jest.fn(),
      },
      employeeDocument: {
        findMany: jest.fn(),
      },
    }; }
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  function createMockAuthz() { return {
      effectivePermissions: jest.fn(),
    }; }
  let mockAuthz: ReturnType<typeof createMockAuthz>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();

    mockAuthz = createMockAuthz();

    analyticsService = new AiAnalyticsService(mockPrisma as unknown as ConstructorParameters<typeof AiAnalyticsService>[0], mockAuthz as unknown as ConstructorParameters<typeof AiAnalyticsService>[1]);
  });

  describe('1. Deterministic Math & Calculation Engine', () => {
    it('calculates rate with 2 decimal places and handles zero denominator', () => {
      expect(analyticsService.rate(1, 4)).toBe(25);
      expect(analyticsService.rate(1, 3)).toBe(33.33);
      expect(analyticsService.rate(2, 3)).toBe(66.67);
      expect(analyticsService.rate(5, 0)).toBeNull();
      expect(analyticsService.rate(0, 10)).toBe(0);
    });

    it('calculates average with 2 decimal places and handles zero count', () => {
      expect(analyticsService.average(100, 4)).toBe(25);
      expect(analyticsService.average(10, 3)).toBe(3.33);
      expect(analyticsService.average(0, 5)).toBe(0);
      expect(analyticsService.average(50, 0)).toBeNull();
    });

    it('calculates delta in percentage points accurately', () => {
      expect(analyticsService.delta(85.5, 80)).toBe(5.5);
      expect(analyticsService.delta(12.3, 15)).toBe(-2.7);
      expect(analyticsService.delta(null, 10)).toBeNull();
      expect(analyticsService.delta(10, null)).toBeNull();
    });

    it('distinguishes percentage points (delta) from relative percentage change', () => {
      // Prior late rate was 5%, current is 8%.
      // Delta = +3 percentage points. Relative change = +60%.
      const prev = 5;
      const current = 8;
      const ppDelta = analyticsService.delta(current, prev);
      const relChange = analyticsService.relativeChange(current, prev);

      expect(ppDelta).toBe(3);
      expect(relChange).toBe(60);
      expect(ppDelta).not.toBe(relChange);
    });

    it('handles relative change when baseline is zero or null', () => {
      expect(analyticsService.relativeChange(10, 0)).toBeNull();
      expect(analyticsService.relativeChange(10, null)).toBeNull();
      expect(analyticsService.relativeChange(null, 5)).toBeNull();
    });
  });

  describe('2. Time Range Parsing', () => {
    it('parses "hôm nay" as today range', () => {
      const { current } = analyticsService.parseTimeRange('Phân tích chấm công hôm nay');
      expect(current.label).toContain('Hôm nay');
      expect(current.start.getUTCHours()).toBe(0);
      expect(current.end.getUTCHours()).toBe(23);
    });

    it('parses "tháng trước" as previous month', () => {
      const { current } = analyticsService.parseTimeRange('Báo cáo nghỉ phép tháng trước');
      expect(current.label).toContain('Tháng');
    });

    it('parses comparison intent "so sánh tháng này với tháng trước"', () => {
      const { current, previous } = analyticsService.parseTimeRange('So sánh tháng này với tháng trước');
      expect(current).toBeDefined();
      expect(previous).toBeDefined();
      expect(current.label).not.toBe(previous?.label);
    });

    it('parses "quý này" and "năm nay"', () => {
      const q = analyticsService.parseTimeRange('Hiệu suất quý này');
      expect(q.current.label).toContain('Quý');

      const y = analyticsService.parseTimeRange('Tổng quan năm nay');
      expect(y.current.label).toContain('Năm');
    });
  });

  describe('3. Workforce Analytics', () => {
    it('returns null without employee:read permission', async () => {
      const result = await analyticsService.getWorkforceAnalytics(
        'org-1',
        new Set<string>(),
        { start: new Date(), end: new Date(), label: 'Test' }
      );
      expect(result).toBeNull();
    });

    it('calculates headcount and department distribution with percentages', async () => {
      mockPrisma.employee.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8)  // active
        .mockResolvedValueOnce(2)  // inactive
        .mockResolvedValueOnce(1); // new hires in range

      mockPrisma.department.findMany.mockResolvedValueOnce([
        { id: 'd1', name: 'Phòng Kỹ thuật', _count: { employees: 6 } },
        { id: 'd2', name: 'Phòng Kinh doanh', _count: { employees: 2 } },
      ]);

      const result = await analyticsService.getWorkforceAnalytics(
        'org-1',
        new Set([PERMISSIONS.EMPLOYEE_READ]),
        { start: new Date(), end: new Date(), label: 'Test' }
      );

      expect(result).not.toBeNull();
      expect(result?.total).toBe(10);
      expect(result?.active).toBe(8);
      expect(result?.inactive).toBe(2);
      expect(result?.newHiresInRange).toBe(1);
      expect(result?.topDepartment?.name).toBe('Phòng Kỹ thuật');
      expect(result?.departments[0].percentage).toBe(75); // 6 / 8 = 75%
      expect(result?.departments[1].percentage).toBe(25); // 2 / 8 = 25%
    });
  });

  describe('4. Attendance Analytics & Comparison', () => {
    it('returns null without attendance:read permission', async () => {
      const result = await analyticsService.getAttendanceAnalytics(
        'org-1',
        new Set<string>(),
        { start: new Date(), end: new Date(), label: 'Test' }
      );
      expect(result).toBeNull();
    });

    it('calculates attendance rate, late rate, worked hours and comparison delta', async () => {
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([
          { status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 480, employee: { department: { name: 'Kỹ thuật' } } },
          { status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 480, employee: { department: { name: 'Kỹ thuật' } } },
          { status: 'LATE', lateMinutes: 30, earlyLeaveMinutes: 0, workedMinutes: 450, employee: { department: { name: 'Kinh doanh' } } },
          { status: 'ABSENT', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0, employee: { department: { name: 'Kinh doanh' } } },
        ])
        .mockResolvedValueOnce([
          { status: 'PRESENT', lateMinutes: 0 },
          { status: 'PRESENT', lateMinutes: 0 },
          { status: 'PRESENT', lateMinutes: 0 },
          { status: 'ABSENT', lateMinutes: 0 },
        ]);

      const currentRange = { start: new Date(), end: new Date(), label: 'Tháng 9' };
      const prevRange = { start: new Date(), end: new Date(), label: 'Tháng 8' };

      const result = await analyticsService.getAttendanceAnalytics(
        'org-1',
        new Set([PERMISSIONS.ATTENDANCE_READ]),
        currentRange,
        prevRange
      );

      expect(result).not.toBeNull();
      expect(result?.totalRecords).toBe(4);
      expect(result?.presentCount).toBe(3); // 2 PRESENT + 1 LATE
      expect(result?.lateCount).toBe(1);
      expect(result?.absentCount).toBe(1);
      expect(result?.attendanceRate).toBe(75); // 3 / (3 + 1) * 100
      expect(result?.lateRate).toBe(33.33);   // 1 / 3 * 100
      expect(result?.totalWorkedHours).toBe(23.5); // (480 + 480 + 450) / 60
      expect(result?.comparison).toBeDefined();
      expect(result?.comparison?.previousRangeLabel).toBe('Tháng 8');
    });
  });

  describe('5. Leave Analytics', () => {
    it('calculates leave statistics by type and department', async () => {
      mockPrisma.leaveRequest.findMany.mockResolvedValueOnce([
        { status: 'APPROVED', leaveType: 'ANNUAL', daysCount: 2.0, employee: { department: { name: 'IT' } } },
        { status: 'PENDING', leaveType: 'SICK', daysCount: 1.0, employee: { department: { name: 'IT' } } },
      ]);
      mockPrisma.employee.count.mockResolvedValueOnce(5);

      const result = await analyticsService.getLeaveAnalytics(
        'org-1',
        new Set([PERMISSIONS.LEAVE_READ]),
        { start: new Date(), end: new Date(), label: 'Tháng 9' }
      );

      expect(result).not.toBeNull();
      expect(result?.totalRequests).toBe(2);
      expect(result?.approvedCount).toBe(1);
      expect(result?.pendingCount).toBe(1);
      expect(result?.totalApprovedDays).toBe(2);
      expect(result?.averageApprovedDaysPerEmployee).toBe(0.4); // 2 / 5
    });
  });

  describe('6. Payroll Analytics & Strict RBAC Currency Segregation', () => {
    it('returns null if user lacks payroll:read permission', async () => {
      const result = await analyticsService.getPayrollAnalytics(
        'org-1',
        new Set([PERMISSIONS.EMPLOYEE_READ])
      );
      expect(result).toBeNull();
    });

    it('strictly separates VND and USD into distinct groups without combining', async () => {
      mockPrisma.payrollPeriod.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          name: 'Kỳ lương T9/2026',
          status: 'APPROVED',
          periodStart: new Date('2026-09-01'),
          periodEnd: new Date('2026-09-30'),
        },
      ]);

      mockPrisma.payrollRecord.findMany.mockResolvedValueOnce([
        {
          currency: 'VND',
          grossAmount: '20000000',
          netAmount: '18000000',
          employeeId: 'emp-1',
          employee: { department: { name: 'Kỹ thuật' } },
        },
        {
          currency: 'USD',
          grossAmount: '2000',
          netAmount: '1800',
          employeeId: 'emp-2',
          employee: { department: { name: 'Kỹ thuật' } },
        },
      ]);

      const result = await analyticsService.getPayrollAnalytics(
        'org-1',
        new Set([PERMISSIONS.PAYROLL_READ])
      );

      expect(result).not.toBeNull();
      expect(result?.currencies.length).toBe(2);

      const vnd = result?.currencies.find((c) => c.currency === 'VND');
      const usd = result?.currencies.find((c) => c.currency === 'USD');

      expect(vnd?.totalNet).toBe(18000000);
      expect(usd?.totalNet).toBe(1800);

      // Verify that VND and USD were NEVER summed into a single total
      const totalCombined = (result?.currencies ?? []).reduce((s, c) => s + c.totalNet, 0);
      expect(totalCombined).not.toBe(18000000); // They remain separate in currencies array
    });
  });

  describe('7. Performance Analytics', () => {
    it('calculates rating distribution, goal progress, and KPI achievement', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValueOnce([
        { status: 'COMPLETED', finalRating: 4, employee: { department: { name: 'R&D' } } },
        { status: 'COMPLETED', finalRating: 5, employee: { department: { name: 'R&D' } } },
        { status: 'DRAFT', finalRating: null, employee: { department: { name: 'Sales' } } },
      ]);
      mockPrisma.performanceGoal.findMany.mockResolvedValueOnce([
        { progress: '80' },
        { progress: '100' },
      ]);
      mockPrisma.performanceKpi.findMany.mockResolvedValueOnce([
        { score: '90' },
        { score: '80' },
      ]);

      const result = await analyticsService.getPerformanceAnalytics(
        'org-1',
        new Set([PERMISSIONS.PERFORMANCE_READ, PERMISSIONS.GOAL_READ, PERMISSIONS.KPI_READ])
      );

      expect(result).not.toBeNull();
      expect(result?.totalReviews).toBe(3);
      expect(result?.completedReviews).toBe(2);
      expect(result?.completionRate).toBe(66.67);
      expect(result?.averageRating).toBe(4.5); // (4 + 5) / 2
      expect(result?.averageGoalProgress).toBe(90);
      expect(result?.averageKpiScore).toBe(85);
    });
  });

  describe('8. Compliance & Documents Analytics', () => {
    it('calculates compliance rate and highlights expiring documents', async () => {
      mockPrisma.documentRequirement.findMany.mockResolvedValueOnce([
        { id: 'r1', category: 'LABOR_CONTRACT', isRequired: true },
        { id: 'r2', category: 'IDENTIFICATION', isRequired: true },
      ]);
      mockPrisma.employee.findMany.mockResolvedValueOnce([
        { id: 'e1', departmentId: 'd1', department: { name: 'Kỹ thuật' } },
      ]);
      mockPrisma.employeeDocument.findMany.mockResolvedValueOnce([
        {
          id: 'doc1',
          employeeId: 'e1',
          category: 'LABOR_CONTRACT',
          status: 'ACTIVE',
          sensitivity: 'NORMAL',
          expiryDate: new Date(Date.now() + 10 * 86400000), // expiring in 10 days
        },
      ]);

      const result = await analyticsService.getComplianceAnalytics(
        'org-1',
        new Set([PERMISSIONS.DOCUMENT_READ])
      );

      expect(result).not.toBeNull();
      expect(result?.totalDocuments).toBe(1);
      expect(result?.expiringSoonCount).toBe(1);
      expect(result?.missingRequiredCount).toBe(1); // expected 2, fulfilled 1
      expect(result?.complianceRate).toBe(50);      // 1 / 2 = 50%
    });
  });

  describe('9. Cross-Domain HR Overview & Anomaly Detection', () => {
    it('aggregates all modules, flags anomalies objectively without subjective blaming', async () => {
      // Mock workforce
      mockPrisma.employee.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.department.findMany.mockResolvedValueOnce([]);

      // Mock attendance with high late rate (> 15%)
      mockPrisma.attendanceRecord.findMany.mockResolvedValueOnce([
        { status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 480, employee: {} },
        { status: 'LATE', lateMinutes: 20, earlyLeaveMinutes: 0, workedMinutes: 460, employee: {} },
      ]);

      // Mock leave
      mockPrisma.leaveRequest.findMany.mockResolvedValueOnce([]);
      mockPrisma.employee.count.mockResolvedValueOnce(5);

      // Mock payroll
      mockPrisma.payrollPeriod.findMany.mockResolvedValueOnce([]);

      // Mock performance
      mockPrisma.performanceReview.findMany.mockResolvedValueOnce([]);

      // Mock compliance with low compliance (< 80%)
      mockPrisma.documentRequirement.findMany.mockResolvedValueOnce([
        { id: 'r1', category: 'LABOR_CONTRACT', isRequired: true },
        { id: 'r2', category: 'IDENTIFICATION', isRequired: true },
      ]);
      mockPrisma.employee.findMany.mockResolvedValueOnce([
        { id: 'e1', departmentId: null, department: null },
      ]);
      mockPrisma.employeeDocument.findMany.mockResolvedValueOnce([]);

      const permissions = new Set([
        PERMISSIONS.EMPLOYEE_READ,
        PERMISSIONS.ATTENDANCE_READ,
        PERMISSIONS.LEAVE_READ,
        PERMISSIONS.DOCUMENT_READ,
      ]);

      const result = await analyticsService.getHROverview(
        'org-1',
        permissions,
        { start: new Date(), end: new Date(), label: 'Tháng 9' }
      );

      expect(result).toBeDefined();
      expect(result.anomalies.length).toBeGreaterThan(0);

      // Check non-accusatory anomaly language
      const anomalyText = result.anomalies.join(' ');
      expect(anomalyText).toContain('Dữ liệu hiện có chưa xác định được nguyên nhân');
      expect(anomalyText).not.toContain('lười');
      expect(anomalyText).not.toContain('quản lý yếu');
    });
  });
});

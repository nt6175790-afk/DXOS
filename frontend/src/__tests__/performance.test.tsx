// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PerformancePage } from '@/features/performance/PerformancePage';
import { performanceApi } from '@/api/performance';
import type {
  PerformanceDashboardSummary,
  PerformanceGoal,
  PerformanceKpi,
  PerformanceReview,
  PerformanceReviewCycle,
} from '@/api/types';

const state = vi.hoisted(() => ({
  orgId: 'org-test-1',
  userId: 'user-manager-1',
  permissions: new Set<string>(),
}));

vi.mock('@/api/performance', () => ({
  performanceApi: {
    getDashboardSummary: vi.fn(),
    listCycles: vi.fn(),
    getCycle: vi.fn(),
    createCycle: vi.fn(),
    updateCycle: vi.fn(),
    listGoals: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    listKpis: vi.fn(),
    createKpi: vi.fn(),
    updateKpi: vi.fn(),
    listReviews: vi.fn(),
    getReview: vi.fn(),
    createReview: vi.fn(),
    submitSelfAssessment: vi.fn(),
    submitManagerReview: vi.fn(),
    completeReview: vi.fn(),
    cancelReview: vi.fn(),
    getEmployeeProfile: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: state.userId, email: 'admin@dxos.test', displayName: 'Admin User' },
    isAuthenticated: true,
  }),
}));

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: () => ({ currentOrg: { id: state.orgId, name: 'DX-OS Enterprise' } }),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    hasPermission: (key: string) => state.permissions.has(key),
    isLoading: false,
  }),
}));

const mockDashboard: PerformanceDashboardSummary = {
  totalCycles: 1,
  activeCycle: {
    id: 'cycle-1',
    name: 'Đánh giá Hiệu suất Q3/2026',
    status: 'OPEN',
    startDate: '2026-07-01',
    endDate: '2026-09-30',
  },
  totalReviews: 2,
  completedReviewsCount: 1,
  inReviewCount: 1,
  pendingSelfAssessment: 0,
  averageRating: 4.5,
  ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
  goalCompletionRate: 85,
  kpiAchievementRate: 92,
  recentReviews: [
    {
      id: 'rev-1',
      employeeName: 'Nguyễn Văn An',
      employeeCode: 'EMP-001',
      cycleName: 'Đánh giá Hiệu suất Q3/2026',
      status: 'COMPLETED',
      finalRating: 5,
      updatedAt: '2026-09-17T08:00:00.000Z',
    },
  ],
};

const mockCycles: PerformanceReviewCycle[] = [
  {
    id: 'cycle-1',
    organizationId: 'org-test-1',
    name: 'Đánh giá Hiệu suất Q3/2026',
    startDate: '2026-07-01',
    endDate: '2026-09-30',
    status: 'OPEN',
    description: 'Chu kỳ đánh giá quý 3',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    _count: { reviews: 2, goals: 3, kpis: 2 },
  },
];

const mockReviews: PerformanceReview[] = [
  {
    id: 'rev-1',
    organizationId: 'org-test-1',
    cycleId: 'cycle-1',
    employeeId: 'emp-1',
    reviewerId: 'emp-mgr',
    status: 'COMPLETED',
    selfAssessment: 'Tự đánh giá tốt',
    selfRating: 4,
    selfSubmittedAt: '2026-09-10T00:00:00.000Z',
    managerReview: 'Làm việc xuất sắc',
    managerRating: 5,
    managerSubmittedAt: '2026-09-15T00:00:00.000Z',
    finalRating: 5,
    summaryFeedback: 'Xếp loại 5 sao',
    completedAt: '2026-09-16T00:00:00.000Z',
    snapshotData: { frozen: true },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
    employee: {
      id: 'emp-1',
      employeeCode: 'EMP-001',
      displayName: 'Nguyễn Văn An',
      jobTitle: 'Kỹ sư phần mềm',
      department: { name: 'Kỹ thuật' },
    },
    reviewer: {
      id: 'emp-mgr',
      employeeCode: 'EMP-MGR',
      displayName: 'Trần Thị Quản Lý',
    },
    cycle: mockCycles[0],
  },
];

const mockGoals: PerformanceGoal[] = [
  {
    id: 'goal-1',
    organizationId: 'org-test-1',
    cycleId: 'cycle-1',
    employeeId: 'emp-1',
    title: 'Phát triển DX-OS Task 7',
    description: 'Hoàn thành phân hệ hiệu suất',
    weight: 40,
    progress: 100,
    status: 'COMPLETED',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    employee: { id: 'emp-1', employeeCode: 'EMP-001', displayName: 'Nguyễn Văn An' },
  },
];

const mockKpis: PerformanceKpi[] = [
  {
    id: 'kpi-1',
    organizationId: 'org-test-1',
    cycleId: 'cycle-1',
    employeeId: 'emp-1',
    name: 'Độ phủ kiểm thử code',
    targetValue: 95,
    actualValue: 98,
    unit: '%',
    score: 100,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    employee: { id: 'emp-1', employeeCode: 'EMP-001', displayName: 'Nguyễn Văn An' },
  },
];

describe('PerformancePage & Employee Review UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.permissions = new Set([
      'performance:read',
      'performance:create',
      'performance:update',
      'performance:review',
      'performance:manage',
      'goal:read',
      'goal:create',
      'goal:update',
      'goal:manage',
      'kpi:read',
      'kpi:update',
      'kpi:manage',
    ]);

    vi.mocked(performanceApi.getDashboardSummary).mockResolvedValue(mockDashboard);
    vi.mocked(performanceApi.listCycles).mockResolvedValue(mockCycles);
    vi.mocked(performanceApi.listReviews).mockResolvedValue(mockReviews);
    vi.mocked(performanceApi.getReview).mockResolvedValue(mockReviews[0]);
    vi.mocked(performanceApi.listGoals).mockResolvedValue(mockGoals);
    vi.mocked(performanceApi.listKpis).mockResolvedValue(mockKpis);
  });

  it('renders dashboard tab with metrics, active cycle, and rating breakdown', async () => {
    render(
      <MemoryRouter>
        <PerformancePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Quản lý Hiệu suất (Performance Management)')).toBeInTheDocument();
      expect(screen.getAllByText('Đánh giá Hiệu suất Q3/2026').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Phân bố xếp loại nhân viên (Rating Distribution)')).toBeInTheDocument();
      expect(screen.getByText(/Tạo chu kỳ mới/i)).toBeInTheDocument();
      expect(screen.getByText(/Tạo phiếu đánh giá/i)).toBeInTheDocument();
    });
  });

  it('navigates to Chu kỳ đánh giá tab and renders cycles table', async () => {
    render(
      <MemoryRouter>
        <PerformancePage />
      </MemoryRouter>,
    );

    const cyclesTab = screen.getByRole('button', { name: /Chu kỳ đánh giá \(/i });
    fireEvent.click(cyclesTab);

    await waitFor(() => {
      expect(screen.getByText('Chu kỳ đánh giá quý 3')).toBeInTheDocument();
      expect(screen.getByText('2026-07-01 → 2026-09-30')).toBeInTheDocument();
      expect(screen.getByText('2 reviews | 3 goals | 2 KPIs')).toBeInTheDocument();
    });
  });

  it('navigates to Phiếu đánh giá tab and displays reviews list', async () => {
    render(
      <MemoryRouter>
        <PerformancePage />
      </MemoryRouter>,
    );

    const reviewsTab = screen.getByRole('button', { name: /Phiếu đánh giá \(/i });
    fireEvent.click(reviewsTab);

    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
      expect(screen.getByText(/EMP-001/)).toBeInTheDocument();
      expect(screen.getByText('Trần Thị Quản Lý (EMP-MGR)')).toBeInTheDocument();
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    });
  });

  it('navigates to Mục tiêu & KPI tab and renders goals and kpis', async () => {
    render(
      <MemoryRouter>
        <PerformancePage />
      </MemoryRouter>,
    );

    const goalsTab = screen.getByRole('button', { name: /Mục tiêu & KPI/i });
    fireEvent.click(goalsTab);

    await waitFor(() => {
      expect(screen.getByText('Phát triển DX-OS Task 7')).toBeInTheDocument();
      expect(screen.getByText('Độ phủ kiểm thử code')).toBeInTheDocument();
      expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('opens detail modal for a review and inspects immutable completed review', async () => {
    render(
      <MemoryRouter>
        <PerformancePage />
      </MemoryRouter>,
    );

    const reviewsTab = screen.getByRole('button', { name: /Phiếu đánh giá \(/i });
    fireEvent.click(reviewsTab);

    await waitFor(() => {
      expect(screen.getByText('Chi tiết')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Chi tiết'));

    await waitFor(() => {
      expect(performanceApi.getReview).toHaveBeenCalledWith('org-test-1', 'rev-1');
      expect(screen.getByText(/ĐÃ HOÀN TẤT & ĐÓNG BĂNG/i)).toBeInTheDocument();
    });
  });
});

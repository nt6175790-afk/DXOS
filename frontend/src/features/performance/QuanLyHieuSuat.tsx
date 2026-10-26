// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Award,
  Plus,
  Calendar,
  Eye,
  CheckCircle2,
  Lock,
  Search,
  Target,
  TrendingUp,
  Star,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { performanceApi } from '@/api/performance';
import type {
  PerformanceDashboardSummary,
  PerformanceGoal,
  PerformanceKpi,
  PerformanceReview,
  PerformanceReviewCycle,
  PerformanceCycleStatus,
  PerformanceReviewStatus,
} from '@/api/types';
import { CreateReviewCycleModal } from './CreateReviewCycleModal';
import { CreateReviewModal } from './CreateReviewModal';
import { PerformanceReviewDetailModal } from './PerformanceReviewDetailModal';

type TabKey = 'dashboard' | 'cycles' | 'reviews' | 'goals_kpis';

export function PerformancePage() {
  const { currentOrg } = useOrganization();
  const { hasPermission } = usePermission();
  const orgId = currentOrg?.id || '';

  const canManage = hasPermission('performance:manage') || hasPermission('performance:create');

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  // Data states
  const [dashboard, setDashboard] = useState<PerformanceDashboardSummary | null>(null);
  const [cycles, setCycles] = useState<PerformanceReviewCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [goals, setGoals] = useState<PerformanceGoal[]>([]);
  const [kpis, setKpis] = useState<PerformanceKpi[]>([]);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isCreateCycleOpen, setIsCreateCycleOpen] = useState(false);
  const [isCreateReviewOpen, setIsCreateReviewOpen] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  // Fetch Dashboard Summary
  const fetchDashboard = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await performanceApi.getDashboardSummary(orgId);
      setDashboard(data);
    } catch (err) {
      console.error('Failed to load dashboard summary', err);
    }
  }, [orgId]);

  // Fetch Cycles
  const fetchCycles = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await performanceApi.listCycles(orgId);
      setCycles(data);
      setSelectedCycleId((prev) => prev || (data.length > 0 ? data[0].id : ''));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể tải danh sách chu kỳ đánh giá';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  // Fetch Reviews
  const fetchReviews = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const data = await performanceApi.listReviews(orgId, {
        cycleId: selectedCycleId || undefined,
        status: (statusFilter as PerformanceReviewStatus) || undefined,
        mine: onlyMine || undefined,
      });
      setReviews(data);
    } catch (err: unknown) {
      console.error('Failed to load reviews', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, selectedCycleId, statusFilter, onlyMine]);

  // Fetch Goals & KPIs
  const fetchGoalsAndKpis = useCallback(async () => {
    if (!orgId) return;
    try {
      const [goalsData, kpisData] = await Promise.all([
        performanceApi.listGoals(orgId, { cycleId: selectedCycleId || undefined }),
        performanceApi.listKpis(orgId, { cycleId: selectedCycleId || undefined }),
      ]);
      setGoals(goalsData);
      setKpis(kpisData);
    } catch (err) {
      console.error('Failed to load goals/kpis', err);
    }
  }, [orgId, selectedCycleId]);

  useEffect(() => {
    fetchDashboard();
    fetchCycles();
  }, [fetchDashboard, fetchCycles]);

  useEffect(() => {
    if (activeTab === 'reviews') {
      fetchReviews();
    } else if (activeTab === 'goals_kpis') {
      fetchGoalsAndKpis();
    } else if (activeTab === 'dashboard') {
      fetchDashboard();
    }
  }, [activeTab, fetchReviews, fetchGoalsAndKpis, fetchDashboard]);

  const handleCycleStatusChange = async (cycleId: string, newStatus: PerformanceCycleStatus) => {
    if (!orgId) return;
    try {
      await performanceApi.updateCycle(orgId, cycleId, { status: newStatus });
      await fetchCycles();
      await fetchDashboard();
    } catch {
      alert('Không thể cập nhật trạng thái chu kỳ');
    }
  };

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      const matchSearch =
        !searchTerm ||
        r.employee?.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.employee?.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reviewer?.displayName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [reviews, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Quản lý Hiệu suất (Performance Management)
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Theo dõi Chu kỳ đánh giá, Mục tiêu, KPI, Tự đánh giá và Đánh giá quản lý khách quan.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsCreateCycleOpen(true)}
              className="inline-flex items-center space-x-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Calendar className="h-4 w-4 text-slate-500" />
              <span>Tạo chu kỳ mới</span>
            </button>
            <button
              onClick={() => setIsCreateReviewOpen(true)}
              className="inline-flex items-center space-x-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              <span>Tạo phiếu đánh giá</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center space-x-2 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center space-x-2 border-b-2 py-4 text-sm font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Tổng quan & Chỉ số</span>
          </button>
          <button
            onClick={() => setActiveTab('cycles')}
            className={`flex items-center space-x-2 border-b-2 py-4 text-sm font-medium transition-colors ${
              activeTab === 'cycles'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Chu kỳ đánh giá ({cycles.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`flex items-center space-x-2 border-b-2 py-4 text-sm font-medium transition-colors ${
              activeTab === 'reviews'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Award className="h-4 w-4" />
            <span>Phiếu đánh giá ({reviews.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('goals_kpis')}
            className={`flex items-center space-x-2 border-b-2 py-4 text-sm font-medium transition-colors ${
              activeTab === 'goals_kpis'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Target className="h-4 w-4" />
            <span>Mục tiêu & KPI</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: DASHBOARD */}
      {activeTab === 'dashboard' && dashboard && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">Chu kỳ hiện tại</span>
                <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                  {dashboard.activeCycle?.status || 'N/A'}
                </span>
              </div>
              <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white truncate">
                {dashboard.activeCycle?.name || 'Chưa có chu kỳ mở'}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {dashboard.activeCycle ? `${dashboard.activeCycle.startDate} → ${dashboard.activeCycle.endDate}` : 'Vui lòng tạo chu kỳ mới'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">Tiến độ đánh giá</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline space-x-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {dashboard.completedReviewsCount}
                </span>
                <span className="text-xs text-slate-500">/ {dashboard.totalReviews} phiếu đã đóng băng</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${dashboard.totalReviews > 0 ? (dashboard.completedReviewsCount / dashboard.totalReviews) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">Điểm xếp loại TB</span>
                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline space-x-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {dashboard.averageRating > 0 ? dashboard.averageRating : '—'}
                </span>
                <span className="text-xs text-slate-500">/ 5.0 sao</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {dashboard.inReviewCount} phiếu đang chờ quản lý đánh giá
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">Chỉ số hoàn thành</span>
                <Target className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Mục tiêu: <span className="font-bold text-indigo-600 dark:text-indigo-400">{dashboard.goalCompletionRate}%</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Đạt KPI: <span className="font-bold text-emerald-600 dark:text-emerald-400">{dashboard.kpiAchievementRate}%</span>
              </div>
            </div>
          </div>

          {/* Detailed Meters & Recent Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Rating distribution breakdown */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Phân bố xếp loại nhân viên (Rating Distribution)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Thống kê các đánh giá đã hoàn tất theo thang điểm 1 đến 5 sao.
              </p>
              <div className="mt-4 space-y-2.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = dashboard.ratingDistribution[stars as 1 | 2 | 3 | 4 | 5] || 0;
                  const percent = dashboard.completedReviewsCount > 0 ? (count / dashboard.completedReviewsCount) * 100 : 0;
                  return (
                    <div key={stars} className="flex items-center space-x-3 text-xs">
                      <div className="flex w-16 items-center space-x-1 font-semibold text-slate-700 dark:text-slate-300">
                        <span>{stars} sao</span>
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      </div>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-medium text-slate-600 dark:text-slate-400">
                        {count} ({Math.round(percent)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent reviews */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Đánh giá gần đây
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Các phiếu đánh giá có cập nhật mới nhất.
              </p>
              <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {dashboard.recentReviews.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">Chưa có đánh giá nào.</p>
                ) : (
                  dashboard.recentReviews.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedReviewId(r.id)}
                      className="flex cursor-pointer items-center justify-between py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-2 -mx-2 transition"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {r.employeeName} ({r.employeeCode})
                        </div>
                        <div className="text-[11px] text-slate-500">{r.cycleName}</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {r.finalRating && (
                          <span className="inline-flex items-center space-x-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span>{r.finalRating}/5</span>
                          </span>
                        )}
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CYCLES */}
      {activeTab === 'cycles' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3">Tên chu kỳ</th>
                  <th className="px-6 py-3">Thời gian</th>
                  <th className="px-6 py-3">Trạng thái</th>
                  <th className="px-6 py-3">Phiếu / Mục tiêu / KPI</th>
                  <th className="px-6 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cycles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      Chưa có chu kỳ đánh giá nào. Nhấn "Tạo chu kỳ mới" để bắt đầu.
                    </td>
                  </tr>
                ) : (
                  cycles.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                        {c.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                            {c.description}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">
                        {c.startDate} → {c.endDate}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            c.status === 'OPEN'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : c.status === 'COMPLETED'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                              : c.status === 'CANCELLED'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {c._count?.reviews || 0} reviews | {c._count?.goals || 0} goals | {c._count?.kpis || 0} KPIs
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {canManage && c.status === 'DRAFT' && (
                          <button
                            onClick={() => handleCycleStatusChange(c.id, 'OPEN')}
                            className="rounded bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300"
                          >
                            Mở chu kỳ
                          </button>
                        )}
                        {canManage && c.status === 'OPEN' && (
                          <button
                            onClick={() => handleCycleStatusChange(c.id, 'COMPLETED')}
                            className="rounded bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300"
                          >
                            Đóng & Hoàn tất
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: REVIEWS */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm nhân viên, mã NV..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Cycle filter */}
              <select
                value={selectedCycleId}
                onChange={(e) => setSelectedCycleId(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Tất cả chu kỳ</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="DRAFT">Nháp (DRAFT)</option>
                <option value="SELF_ASSESSMENT">Tự đánh giá (SELF_ASSESSMENT)</option>
                <option value="MANAGER_REVIEW">Quản lý review (MANAGER_REVIEW)</option>
                <option value="COMPLETED">Đã hoàn tất (COMPLETED)</option>
                <option value="CANCELLED">Đã hủy (CANCELLED)</option>
              </select>
            </div>

            {/* Toggle Mine */}
            <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Chỉ phiếu của tôi</span>
            </label>
          </div>

          {/* Reviews Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3">Nhân viên</th>
                  <th className="px-6 py-3">Người đánh giá</th>
                  <th className="px-6 py-3">Chu kỳ</th>
                  <th className="px-6 py-3 text-center">Tự chấm</th>
                  <th className="px-6 py-3 text-center">QL chấm</th>
                  <th className="px-6 py-3 text-center">Xếp loại</th>
                  <th className="px-6 py-3">Trạng thái</th>
                  <th className="px-6 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                      Đang tải danh sách phiếu đánh giá...
                    </td>
                  </tr>
                ) : filteredReviews.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                      Không tìm thấy phiếu đánh giá nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredReviews.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {r.employee?.displayName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {r.employee?.employeeCode} • {r.employee?.department?.name || 'Chưa gán'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {r.reviewer?.displayName} ({r.reviewer?.employeeCode})
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400">
                        {r.cycle?.name}
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-semibold">
                        {r.selfRating ? `${r.selfRating}/5` : '—'}
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-semibold">
                        {r.managerRating ? `${r.managerRating}/5` : '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {r.finalRating ? (
                          <span className="inline-flex items-center space-x-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span>{r.finalRating}/5</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center space-x-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            r.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : r.status === 'MANAGER_REVIEW'
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                              : r.status === 'SELF_ASSESSMENT'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {r.status === 'COMPLETED' && <Lock className="h-2.5 w-2.5" />}
                          <span>{r.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedReviewId(r.id)}
                          className="inline-flex items-center space-x-1 rounded bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-400"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Chi tiết</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: GOALS & KPIS */}
      {activeTab === 'goals_kpis' && (
        <div className="space-y-6">
          {/* Goals section */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="flex items-center space-x-2 text-base font-bold text-slate-900 dark:text-white">
              <Target className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <span>Danh sách Mục tiêu trong chu kỳ ({goals.length})</span>
            </h3>
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {goals.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">Chưa có mục tiêu nào.</p>
              ) : (
                goals.map((g) => (
                  <div key={g.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{g.title}</div>
                      <div className="text-xs text-slate-500">
                        Nhân viên: {g.employee?.displayName} ({g.employee?.employeeCode}) • Trọng số: {g.weight}%
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="w-32">
                        <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                          <span>Tiến độ</span>
                          <span>{g.progress}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-indigo-600"
                            style={{ width: `${g.progress}%` }}
                          />
                        </div>
                      </div>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {g.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* KPIs section */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="flex items-center space-x-2 text-base font-bold text-slate-900 dark:text-white">
              <TrendingUp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <span>Chỉ số KPI trong chu kỳ ({kpis.length})</span>
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kpis.length === 0 ? (
                <p className="col-span-full py-6 text-center text-xs text-slate-500">Chưa có chỉ số KPI nào.</p>
              ) : (
                kpis.map((kpi) => (
                  <div key={kpi.id} className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {kpi.name}
                      </div>
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {kpi.score}%
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      NV: {kpi.employee?.displayName}
                    </div>
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                      Mục tiêu: {kpi.targetValue} {kpi.unit} | Thực tế: {kpi.actualValue} {kpi.unit}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateReviewCycleModal
        isOpen={isCreateCycleOpen}
        onClose={() => setIsCreateCycleOpen(false)}
        organizationId={orgId}
        onSuccess={() => {
          fetchCycles();
          fetchDashboard();
        }}
      />

      <CreateReviewModal
        isOpen={isCreateReviewOpen}
        onClose={() => setIsCreateReviewOpen(false)}
        organizationId={orgId}
        cycles={cycles}
        onSuccess={() => {
          fetchReviews();
          fetchDashboard();
        }}
      />

      {selectedReviewId && (
        <PerformanceReviewDetailModal
          isOpen={Boolean(selectedReviewId)}
          onClose={() => setSelectedReviewId(null)}
          organizationId={orgId}
          reviewId={selectedReviewId}
          onUpdated={() => {
            fetchReviews();
            fetchDashboard();
          }}
        />
      )}
    </div>
  );
}

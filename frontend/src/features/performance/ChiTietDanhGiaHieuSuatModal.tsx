// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback } from 'react';
import {
  X,
  UserCheck,
  Target,
  TrendingUp,
  Star,
  CheckCircle2,
  Lock,
  Plus,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { performanceApi } from '@/api/performance';
import type { PerformanceGoal, PerformanceKpi, PerformanceReview } from '@/api/types';
import { GoalModal } from './GoalModal';
import { KpiModal } from './KpiModal';

interface PerformanceReviewDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  reviewId: string;
  onUpdated: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: '1 - Cần cải thiện (Needs Improvement)',
  2: '2 - Đang phát triển (Developing)',
  3: '3 - Đạt yêu cầu (Meets Expectations)',
  4: '4 - Vượt yêu cầu (Exceeds Expectations)',
  5: '5 - Xuất sắc (Outstanding)',
};

export function PerformanceReviewDetailModal({
  isOpen,
  onClose,
  organizationId,
  reviewId,
  onUpdated,
}: PerformanceReviewDetailModalProps) {
  const [review, setReview] = useState<PerformanceReview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active section tab
  const [activeTab, setActiveTab] = useState<'goals_kpis' | 'self' | 'manager' | 'complete'>('goals_kpis');

  // Form states
  const [selfAssessment, setSelfAssessment] = useState('');
  const [selfRating, setSelfRating] = useState<number>(3);
  const [managerReview, setManagerReview] = useState('');
  const [managerRating, setManagerRating] = useState<number>(3);
  const [finalRating, setFinalRating] = useState<number>(3);
  const [summaryFeedback, setSummaryFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sub-modals for Goal / KPI
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<PerformanceGoal | null>(null);
  const [isKpiModalOpen, setIsKpiModalOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<PerformanceKpi | null>(null);

  const fetchReview = useCallback(async () => {
    if (!reviewId || !organizationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await performanceApi.getReview(organizationId, reviewId);
      setReview(data);
      setSelfAssessment(data.selfAssessment || '');
      setSelfRating(data.selfRating || 3);
      setManagerReview(data.managerReview || '');
      setManagerRating(data.managerRating || 3);
      setFinalRating(data.finalRating || data.managerRating || 3);
      setSummaryFeedback(data.summaryFeedback || '');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể tải thông tin phiếu đánh giá';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, reviewId]);

  useEffect(() => {
    if (isOpen) {
      fetchReview();
    }
  }, [isOpen, fetchReview]);

  if (!isOpen) return null;

  const isCompleted = review?.status === 'COMPLETED';

  const handleSelfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selfAssessment.trim()) {
      setError('Vui lòng nhập nội dung tự đánh giá');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await performanceApi.submitSelfAssessment(organizationId, reviewId, {
        selfAssessment: selfAssessment.trim(),
        selfRating,
      });
      await fetchReview();
      onUpdated();
      setActiveTab('manager');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể gửi tự đánh giá';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManagerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerReview.trim()) {
      setError('Vui lòng nhập nhận xét của người đánh giá');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await performanceApi.submitManagerReview(organizationId, reviewId, {
        managerReview: managerReview.trim(),
        managerRating,
        summaryFeedback: summaryFeedback.trim() || undefined,
      });
      await fetchReview();
      onUpdated();
      setActiveTab('complete');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể gửi đánh giá quản lý';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await performanceApi.completeReview(organizationId, reviewId, {
        finalRating,
        summaryFeedback: summaryFeedback.trim() || undefined,
      });
      await fetchReview();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể hoàn tất đánh giá';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-800">
          <div>
            <div className="flex items-center space-x-3">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Đánh giá: {review?.employee?.displayName} ({review?.employee?.employeeCode})
              </h3>
              {isCompleted ? (
                <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <Lock className="h-3 w-3" />
                  <span>ĐÃ HOÀN TẤT & ĐÓNG BĂNG</span>
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                  {review?.status}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Chu kỳ: <strong className="text-slate-700 dark:text-slate-200">{review?.cycle?.name}</strong> |
              Người đánh giá: <strong className="text-slate-700 dark:text-slate-200">{review?.reviewer?.displayName}</strong> |
              Phòng ban: {review?.employee?.department?.name || 'Chưa gán'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 flex items-center space-x-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Section Tabs */}
        <div className="flex border-b border-slate-200 px-6 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('goals_kpis')}
            className={`flex items-center space-x-2 border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'goals_kpis'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Target className="h-4 w-4" />
            <span>Mục tiêu & KPI ({review?.goals?.length || 0}/{review?.kpis?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('self')}
            className={`ml-6 flex items-center space-x-2 border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'self'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>Tự đánh giá {review?.selfSubmittedAt ? '✓' : ''}</span>
          </button>
          <button
            onClick={() => setActiveTab('manager')}
            className={`ml-6 flex items-center space-x-2 border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'manager'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Star className="h-4 w-4" />
            <span>Quản lý đánh giá {review?.managerSubmittedAt ? '✓' : ''}</span>
          </button>
          <button
            onClick={() => setActiveTab('complete')}
            className={`ml-6 flex items-center space-x-2 border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'complete'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Kết quả & Đóng băng {isCompleted ? '🔒' : ''}</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">Đang tải dữ liệu...</div>
          ) : (
            <>
              {/* TAB 1: Goals & KPIs */}
              {activeTab === 'goals_kpis' && (
                <div className="space-y-6">
                  {/* Goals */}
                  <div>
                    <div className="flex items-center justify-between pb-2">
                      <h4 className="flex items-center space-x-2 text-sm font-bold text-slate-900 dark:text-white">
                        <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span>Mục tiêu hiệu suất (Goals)</span>
                      </h4>
                      {!isCompleted && review?.cycleId && review?.employeeId && (
                        <button
                          onClick={() => {
                            setSelectedGoal(null);
                            setIsGoalModalOpen(true);
                          }}
                          className="inline-flex items-center space-x-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Thêm mục tiêu</span>
                        </button>
                      )}
                    </div>
                    {(!review?.goals || review.goals.length === 0) ? (
                      <p className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500 dark:bg-slate-800/50">
                        Chưa có mục tiêu nào được gán trong chu kỳ này.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {review.goals.map((g) => (
                          <div
                            key={g.id}
                            className="rounded-lg border border-slate-200 p-3 hover:border-slate-300 dark:border-slate-800"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h5 className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {g.title}
                                </h5>
                                {g.description && (
                                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {g.description}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                                  Trọng số: {g.weight}%
                                </span>
                                <span className="ml-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {g.status}
                                </span>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-2 flex items-center space-x-3">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500"
                                  style={{ width: `${Math.min(100, Number(g.progress))}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {g.progress}%
                              </span>
                              {!isCompleted && (
                                <button
                                  onClick={() => {
                                    setSelectedGoal(g);
                                    setIsGoalModalOpen(true);
                                  }}
                                  className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                                >
                                  Sửa
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* KPIs */}
                  <div>
                    <div className="flex items-center justify-between pb-2">
                      <h4 className="flex items-center space-x-2 text-sm font-bold text-slate-900 dark:text-white">
                        <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span>Chỉ số đo lường hiệu quả (KPIs)</span>
                      </h4>
                      {!isCompleted && review?.cycleId && review?.employeeId && (
                        <button
                          onClick={() => {
                            setSelectedKpi(null);
                            setIsKpiModalOpen(true);
                          }}
                          className="inline-flex items-center space-x-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Thêm KPI</span>
                        </button>
                      )}
                    </div>
                    {(!review?.kpis || review.kpis.length === 0) ? (
                      <p className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500 dark:bg-slate-800/50">
                        Chưa có chỉ số KPI nào được thiết lập cho nhân viên này.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {review.kpis.map((kpi) => (
                          <div
                            key={kpi.id}
                            className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                          >
                            <div className="flex items-start justify-between">
                              <h5 className="text-sm font-semibold text-slate-900 dark:text-white">
                                {kpi.name}
                              </h5>
                              <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                {kpi.score}%
                              </span>
                            </div>
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              Mục tiêu: <strong className="text-slate-700 dark:text-slate-200">{kpi.targetValue} {kpi.unit}</strong> |
                              Thực tế: <strong className="text-indigo-600 dark:text-indigo-400">{kpi.actualValue} {kpi.unit}</strong>
                            </div>
                            <div className="mt-2 flex items-center space-x-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, Number(kpi.score))}%` }}
                                />
                              </div>
                              {!isCompleted && (
                                <button
                                  onClick={() => {
                                    setSelectedKpi(kpi);
                                    setIsKpiModalOpen(true);
                                  }}
                                  className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                                >
                                  Cập nhật
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: Self Assessment */}
              {activeTab === 'self' && (
                <form onSubmit={handleSelfSubmit} className="space-y-4">
                  <div className="rounded-lg bg-blue-50 p-4 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                    Nhân viên tự đánh giá quá trình làm việc, thành tựu đã đạt được, khó khăn gặp phải và tự chấm điểm theo thang 1 - 5.
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Điểm tự đánh giá (1 - 5 sao) <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selfRating}
                      onChange={(e) => setSelfRating(Number(e.target.value))}
                      disabled={isCompleted}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value={1}>{RATING_LABELS[1]}</option>
                      <option value={2}>{RATING_LABELS[2]}</option>
                      <option value={3}>{RATING_LABELS[3]}</option>
                      <option value={4}>{RATING_LABELS[4]}</option>
                      <option value={5}>{RATING_LABELS[5]}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Nội dung tự đánh giá chi tiết <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={6}
                      required
                      placeholder="Nêu rõ các thành tích đã hoàn thành theo các mục tiêu và KPI..."
                      value={selfAssessment}
                      onChange={(e) => setSelfAssessment(e.target.value)}
                      disabled={isCompleted}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800"
                    />
                  </div>

                  {review?.selfSubmittedAt && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Đã gửi tự đánh giá lúc: {new Date(review.selfSubmittedAt).toLocaleString('vi-VN')}
                    </p>
                  )}

                  {!isCompleted && (
                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {isSubmitting ? 'Đang gửi...' : 'Nộp tự đánh giá'}
                      </button>
                    </div>
                  )}
                </form>
              )}

              {/* TAB 3: Manager Review */}
              {activeTab === 'manager' && (
                <form onSubmit={handleManagerSubmit} className="space-y-4">
                  <div className="rounded-lg bg-indigo-50 p-4 text-xs text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
                    Cấp quản lý trực tiếp đưa ra đánh giá khách quan về kết quả công việc, kỹ năng, thái độ và định hướng phát triển của nhân viên.
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Điểm quản lý đánh giá (1 - 5 sao) <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={managerRating}
                      onChange={(e) => setManagerRating(Number(e.target.value))}
                      disabled={isCompleted}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value={1}>{RATING_LABELS[1]}</option>
                      <option value={2}>{RATING_LABELS[2]}</option>
                      <option value={3}>{RATING_LABELS[3]}</option>
                      <option value={4}>{RATING_LABELS[4]}</option>
                      <option value={5}>{RATING_LABELS[5]}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Nhận xét của quản lý <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={6}
                      required
                      placeholder="Ghi nhận điểm mạnh, điểm cần cải thiện, đề xuất thăng tiến hoặc điều chỉnh đãi ngộ..."
                      value={managerReview}
                      onChange={(e) => setManagerReview(e.target.value)}
                      disabled={isCompleted}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800"
                    />
                  </div>

                  {review?.managerSubmittedAt && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Quản lý đã nộp review lúc: {new Date(review.managerSubmittedAt).toLocaleString('vi-VN')}
                    </p>
                  )}

                  {!isCompleted && (
                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {isSubmitting ? 'Đang gửi...' : 'Nộp đánh giá quản lý'}
                      </button>
                    </div>
                  )}
                </form>
              )}

              {/* TAB 4: Finalize & Complete */}
              {activeTab === 'complete' && (
                <div className="space-y-5">
                  {isCompleted ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <div className="flex items-center space-x-3">
                          <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                          <div>
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">
                              Đánh giá đã hoàn tất & đóng băng dữ liệu
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Hoàn thành lúc: {review.completedAt ? new Date(review.completedAt).toLocaleString('vi-VN') : 'N/A'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-emerald-100 pt-3 dark:border-emerald-900/30">
                          <div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Tự đánh giá:</span>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                              {review.selfRating || '—'}/5
                            </div>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Quản lý đánh giá:</span>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                              {review.managerRating || '—'}/5
                            </div>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Xếp loại cuối cùng:</span>
                            <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                              {review.finalRating}/5 ({RATING_LABELS[review.finalRating || 3].split('-')[1]})
                            </div>
                          </div>
                        </div>

                        {review.summaryFeedback && (
                          <div className="mt-3 border-t border-emerald-100 pt-3 text-xs text-slate-700 dark:border-emerald-900/30 dark:text-slate-300">
                            <strong>Nhận xét tổng kết:</strong> {review.summaryFeedback}
                          </div>
                        )}
                      </div>

                      {/* Snapshot display */}
                      {review.snapshotData && (
                        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500">
                            <FileText className="h-4 w-4" />
                            <span>Bản ghi đóng băng (Immutable Snapshot Data)</span>
                          </div>
                          <pre className="mt-2 max-h-48 overflow-y-auto rounded bg-slate-50 p-3 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {JSON.stringify(review.snapshotData, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleCompleteSubmit} className="space-y-4">
                      <div className="rounded-lg bg-amber-50 p-4 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        <strong>Lưu ý:</strong> Khi hoàn tất phiếu đánh giá, toàn bộ thông tin Mục tiêu, KPI, Tự đánh giá và Đánh giá quản lý sẽ được đóng băng (snapshot). Không thể chỉnh sửa hồi tố sau bước này.
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Điểm xếp loại cuối cùng (Final Rating) <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={finalRating}
                          onChange={(e) => setFinalRating(Number(e.target.value))}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value={1}>{RATING_LABELS[1]}</option>
                          <option value={2}>{RATING_LABELS[2]}</option>
                          <option value={3}>{RATING_LABELS[3]}</option>
                          <option value={4}>{RATING_LABELS[4]}</option>
                          <option value={5}>{RATING_LABELS[5]}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Ý kiến phản hồi / Nhận xét tổng kết (Summary Feedback)
                        </label>
                        <textarea
                          rows={4}
                          placeholder="Ý kiến tổng kết chu kỳ đánh giá..."
                          value={summaryFeedback}
                          onChange={(e) => setSummaryFeedback(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>

                      <div className="flex justify-end pt-3">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="inline-flex items-center space-x-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Lock className="h-4 w-4" />
                          <span>{isSubmitting ? 'Đang xử lý...' : 'Hoàn tất & Đóng băng đánh giá'}</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-modals for Goal & KPI */}
      {review && (
        <>
          <GoalModal
            isOpen={isGoalModalOpen}
            onClose={() => setIsGoalModalOpen(false)}
            organizationId={organizationId}
            cycleId={review.cycleId}
            employeeId={review.employeeId}
            existingGoal={selectedGoal}
            onSuccess={() => fetchReview()}
          />
          <KpiModal
            isOpen={isKpiModalOpen}
            onClose={() => setIsKpiModalOpen(false)}
            organizationId={organizationId}
            cycleId={review.cycleId}
            employeeId={review.employeeId}
            existingKpi={selectedKpi}
            onSuccess={() => fetchReview()}
          />
        </>
      )}
    </div>
  );
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect } from 'react';
import { X, UserCheck, AlertTriangle, AlertCircle } from 'lucide-react';
import { performanceApi } from '@/api/performance';
import { listEmployees } from '@/api/employees';
import type { Employee, PerformanceReview, PerformanceReviewCycle } from '@/api/types';

interface CreateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  cycles: PerformanceReviewCycle[];
  onSuccess: (review: PerformanceReview) => void;
}

export function CreateReviewModal({
  isOpen,
  onClose,
  organizationId,
  cycles,
  onSuccess,
}: CreateReviewModalProps) {
  const [cycleId, setCycleId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !organizationId) return;
    if (cycles.length > 0 && !cycleId) {
      setCycleId(cycles[0].id);
    }
    const loadEmps = async () => {
      setIsLoadingEmployees(true);
      try {
        const res = await listEmployees(organizationId, { limit: 100 });
        setEmployees(res.items.filter((e) => e.status === 'ACTIVE'));
      } catch (err: unknown) {
        console.error('Failed to load employees', err);
      } finally {
        setIsLoadingEmployees(false);
      }
    };
    loadEmps();
  }, [isOpen, organizationId, cycles, cycleId]);

  if (!isOpen) return null;

  const isSelfReview = Boolean(employeeId && reviewerId && employeeId === reviewerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycleId || !employeeId || !reviewerId) {
      setError('Vui lòng chọn đầy đủ Chu kỳ, Nhân viên và Người đánh giá');
      return;
    }
    if (isSelfReview) {
      setError('Người đánh giá không được trùng với nhân viên được đánh giá');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const review = await performanceApi.createReview(organizationId, {
        cycleId,
        employeeId,
        reviewerId,
      });
      onSuccess(review);
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể tạo phiếu đánh giá';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <UserCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Tạo phiếu đánh giá nhân viên
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center space-x-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isSelfReview && (
          <div className="mt-4 flex items-center space-x-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <span>
              Quy tắc Anti-Self-Review: Người đánh giá không được là chính nhân viên được đánh giá.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Chu kỳ đánh giá <span className="text-red-500">*</span>
            </label>
            <select
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">-- Chọn chu kỳ --</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nhân viên được đánh giá <span className="text-red-500">*</span>
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
              disabled={isLoadingEmployees}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">-- Chọn nhân viên --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.displayName} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Người đánh giá (Reviewer / Manager) <span className="text-red-500">*</span>
            </label>
            <select
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              required
              disabled={isLoadingEmployees}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">-- Chọn người đánh giá --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.displayName} ({emp.employeeCode})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Người đánh giá phải là nhân sự cấp quản lý hoặc được phân công chịu trách nhiệm review.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSelfReview || !cycleId || !employeeId || !reviewerId}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Đang tạo...' : 'Tạo phiếu đánh giá'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

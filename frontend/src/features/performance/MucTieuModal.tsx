// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect } from 'react';
import { X, Target, AlertCircle } from 'lucide-react';
import { performanceApi } from '@/api/performance';
import type { PerformanceGoal, PerformanceGoalStatus } from '@/api/types';

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  cycleId: string;
  employeeId: string;
  existingGoal?: PerformanceGoal | null;
  onSuccess: (goal: PerformanceGoal) => void;
}

export function GoalModal({
  isOpen,
  onClose,
  organizationId,
  cycleId,
  employeeId,
  existingGoal,
  onSuccess,
}: GoalModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState('10');
  const [progress, setProgress] = useState('0');
  const [status, setStatus] = useState<PerformanceGoalStatus>('NOT_STARTED');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingGoal) {
      setTitle(existingGoal.title);
      setDescription(existingGoal.description || '');
      setWeight(String(existingGoal.weight));
      setProgress(String(existingGoal.progress));
      setStatus(existingGoal.status);
    } else {
      setTitle('');
      setDescription('');
      setWeight('10');
      setProgress('0');
      setStatus('NOT_STARTED');
    }
  }, [existingGoal, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề mục tiêu');
      return;
    }

    const weightNum = parseFloat(weight) || 0;
    const progressNum = parseFloat(progress) || 0;
    if (weightNum < 0 || weightNum > 100) {
      setError('Trọng số phải nằm trong khoảng 0 - 100%');
      return;
    }
    if (progressNum < 0 || progressNum > 100) {
      setError('Tiến độ phải nằm trong khoảng 0 - 100%');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (existingGoal) {
        const updated = await performanceApi.updateGoal(organizationId, existingGoal.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          weight: weightNum,
          progress: progressNum,
          status,
        });
        onSuccess(updated);
      } else {
        const created = await performanceApi.createGoal(organizationId, {
          cycleId,
          employeeId,
          title: title.trim(),
          description: description.trim() || undefined,
          weight: weightNum,
          progress: progressNum,
          status,
        });
        onSuccess(created);
      }
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Thao tác không thành công';
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
            <Target className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {existingGoal ? 'Cập nhật mục tiêu' : 'Thêm mục tiêu mới'}
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Tiêu đề mục tiêu <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="VD: Nâng cấp kiến trúc vi dịch vụ"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Mô tả chi tiết
            </label>
            <textarea
              rows={3}
              placeholder="Mô tả kết quả then chốt cần đạt..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Trọng số (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Tiến độ hiện tại (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="5"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Trạng thái
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PerformanceGoalStatus)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="NOT_STARTED">Chưa bắt đầu (NOT_STARTED)</option>
              <option value="IN_PROGRESS">Đang thực hiện (IN_PROGRESS)</option>
              <option value="COMPLETED">Đã hoàn thành (COMPLETED)</option>
              <option value="CANCELLED">Đã hủy (CANCELLED)</option>
            </select>
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
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : existingGoal ? 'Lưu thay đổi' : 'Tạo mục tiêu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

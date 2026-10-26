// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect } from 'react';
import { X, TrendingUp, AlertCircle } from 'lucide-react';
import { performanceApi } from '@/api/performance';
import type { PerformanceKpi } from '@/api/types';

interface KpiModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  cycleId: string;
  employeeId: string;
  existingKpi?: PerformanceKpi | null;
  onSuccess: (kpi: PerformanceKpi) => void;
}

export function KpiModal({
  isOpen,
  onClose,
  organizationId,
  cycleId,
  employeeId,
  existingKpi,
  onSuccess,
}: KpiModalProps) {
  const [name, setName] = useState('');
  const [targetValue, setTargetValue] = useState('100');
  const [actualValue, setActualValue] = useState('0');
  const [unit, setUnit] = useState('%');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingKpi) {
      setName(existingKpi.name);
      setTargetValue(String(existingKpi.targetValue));
      setActualValue(String(existingKpi.actualValue));
      setUnit(existingKpi.unit);
    } else {
      setName('');
      setTargetValue('100');
      setActualValue('0');
      setUnit('%');
    }
  }, [existingKpi, isOpen]);

  if (!isOpen) return null;

  const targetNum = parseFloat(targetValue) || 0;
  const actualNum = parseFloat(actualValue) || 0;
  const calculatedScore = targetNum > 0 ? Math.min(100, Number(((actualNum / targetNum) * 100).toFixed(2))) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên chỉ số KPI');
      return;
    }
    if (targetNum <= 0) {
      setError('Mục tiêu phải lớn hơn 0');
      return;
    }
    if (!unit.trim()) {
      setError('Vui lòng nhập đơn vị đo lường');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (existingKpi) {
        const updated = await performanceApi.updateKpi(organizationId, existingKpi.id, {
          name: name.trim(),
          targetValue: targetNum,
          actualValue: actualNum,
          unit: unit.trim(),
        });
        onSuccess(updated);
      } else {
        const created = await performanceApi.createKpi(organizationId, {
          cycleId,
          employeeId,
          name: name.trim(),
          targetValue: targetNum,
          actualValue: actualNum,
          unit: unit.trim(),
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
            <TrendingUp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {existingKpi ? 'Cập nhật chỉ số KPI' : 'Thêm chỉ số KPI mới'}
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
              Tên chỉ số KPI <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="VD: Doanh số bán hàng cá nhân"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Giá trị mục tiêu <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="any"
                required
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Giá trị thực tế
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={actualValue}
                onChange={(e) => setActualValue(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Đơn vị đo lường <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="%, USD, Triệu VNĐ, Giờ, Dự án..."
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Live Score Display */}
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Điểm KPI tính toán (tất định):</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {calculatedScore}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all dark:bg-indigo-500"
                style={{ width: `${Math.min(100, calculatedScore)}%` }}
              />
            </div>
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
              {isSubmitting ? 'Đang lưu...' : existingKpi ? 'Lưu thay đổi' : 'Tạo KPI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

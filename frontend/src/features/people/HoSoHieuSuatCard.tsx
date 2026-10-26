// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Award, Star, ExternalLink } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { performanceApi } from '@/api/performance';
import type { EmployeePerformanceProfile } from '@/api/types';

interface PerformanceProfileCardProps {
  employeeId: string;
}

export function PerformanceProfileCard({ employeeId }: PerformanceProfileCardProps) {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id;
  const [profile, setProfile] = useState<EmployeePerformanceProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!orgId || !employeeId) return;
    setIsLoading(true);
    performanceApi
      .getEmployeeProfile(orgId, employeeId)
      .then((data) => setProfile(data))
      .catch(() => setProfile(null))
      .finally(() => setIsLoading(false));
  }, [orgId, employeeId]);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Award className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span>Hồ sơ Đánh giá & Hiệu suất</span>
        </h4>
        <Link
          to="/performance"
          className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium inline-flex items-center gap-1"
        >
          <span>Xem phân hệ Hiệu suất</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-400 italic py-2">Đang tải hồ sơ hiệu suất...</p>
      ) : !profile || profile.reviews.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-2">
          Chưa có dữ liệu đánh giá hiệu suất cho nhân viên này.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Summary highlight */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-indigo-50/50 border border-indigo-100 dark:bg-indigo-950/20 dark:border-indigo-900/30">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Xếp loại trung bình:</span>
              <div className="flex items-center space-x-1 mt-0.5">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {profile.averageRating ? `${profile.averageRating}/5` : 'Chưa có'}
                </span>
              </div>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Đánh giá hoàn tất:</span>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {profile.completedReviewsCount} chu kỳ
              </div>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Mục tiêu hiện tại:</span>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {profile.goals.length} mục tiêu
              </div>
            </div>
          </div>

          {/* Review history */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Lịch sử đánh giá theo chu kỳ
            </span>
            <div className="space-y-1.5">
              {profile.reviews.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-xs bg-white dark:bg-slate-900"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {r.cycle.name}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Người đánh giá: {r.reviewer.displayName}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {r.finalRating && (
                      <span className="inline-flex items-center space-x-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span>{r.finalRating}/5</span>
                      </span>
                    )}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

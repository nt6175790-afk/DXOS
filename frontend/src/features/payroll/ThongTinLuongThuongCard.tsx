import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Plus,
  History,
  Calendar,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { compensationApi } from '@/api/payroll';
import type { CompensationProfile, EmployeeCompensationSummary } from '@/api/types';

interface CompensationCardProps {
  employeeId: string;
  canManage?: boolean;
}

export function CompensationCard({ employeeId, canManage = false }: CompensationCardProps) {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || '';

  const [summary, setSummary] = useState<EmployeeCompensationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [baseSalary, setBaseSalary] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');
  const [notes, setNotes] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchCompensation = useCallback(async () => {
    if (!orgId || !employeeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await compensationApi.getEmployeeCompensation(orgId, employeeId);
      setSummary(res);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể tải thông tin đãi ngộ';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, employeeId]);

  useEffect(() => {
    fetchCompensation();
  }, [fetchCompensation]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const salaryNum = Number(baseSalary);
    if (isNaN(salaryNum) || salaryNum < 0) {
      setFormError('Lương cơ bản phải là số không âm');
      return;
    }
    if (!effectiveFrom) {
      setFormError('Vui lòng chọn ngày hiệu lực');
      return;
    }

    setFormLoading(true);
    setFormError(null);
    try {
      await compensationApi.create(orgId, employeeId, {
        baseSalary: salaryNum,
        currency: 'VND',
        effectiveFrom,
        effectiveTo: effectiveTo || undefined,
        notes: notes.trim() || undefined,
      });
      setIsModalOpen(false);
      setBaseSalary('');
      setNotes('');
      fetchCompensation();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message || 'Không thể thiết lập lương';
      setFormError(msg);
    } finally {
      setFormLoading(false);
    }
  };

  const formatMoney = (val?: number | string) => {
    return Number(val || 0).toLocaleString('vi-VN') + ' đ';
  };

  const active = summary?.activeProfile;
  const history = summary?.history || [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-600" />
          <h4 className="font-semibold text-slate-900 text-sm">Hồ sơ đãi ngộ & Tiền lương</h4>
        </div>
        {canManage && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Điều chỉnh lương
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">
        {isLoading ? (
          <div className="py-6 text-center text-xs text-slate-400">Đang tải hồ sơ đãi ngộ...</div>
        ) : error ? (
          <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : !active ? (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <p className="font-semibold mb-1">Chưa thiết lập lương cơ bản</p>
            <p>{canManage ? 'Chọn “Điều chỉnh lương” để thiết lập mức lương.' : 'Nhân viên chưa có mức lương hiện hành.'}</p>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                Lương cơ bản hiện tại
              </span>
              <div className="text-2xl font-extrabold text-emerald-800 mt-1">
                {formatMoney(active.baseSalary)}
              </div>
              <p className="text-xs text-emerald-700/80 mt-1 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                Hiệu lực: Từ {active.effectiveFrom.slice(0, 10)}
                {active.effectiveTo ? ` đến ${active.effectiveTo.slice(0, 10)}` : ' (Vô thời hạn)'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 bg-white text-emerald-700 border border-emerald-200 rounded-full w-fit">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Đang áp dụng
            </div>
          </div>
        )}

        {/* History timeline */}
        {history.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              Lịch sử điều chỉnh mức lương ({history.length})
            </h5>
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 text-xs">
              {history.map((p: CompensationProfile) => (
                <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50/50">
                  <div>
                    <span className="font-bold text-slate-800">{formatMoney(p.baseSalary)}</span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Từ {p.effectiveFrom.slice(0, 10)} {p.effectiveTo ? `đến ${p.effectiveTo.slice(0, 10)}` : 'đến nay'}
                    </p>
                    {p.notes && <p className="text-slate-400 italic text-[11px] mt-0.5">{p.notes}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${
                    p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {p.isActive ? 'Hiệu lực' : 'Hết hiệu lực'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal điều chỉnh lương */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h4 className="text-base font-semibold text-slate-900">Thiết lập / Điều chỉnh lương</h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Mức lương cơ bản (VNĐ) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="100000"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  placeholder="Ví dụ: 15000000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Hiệu lực từ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Đến ngày (tùy chọn)
                  </label>
                  <input
                    type="date"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Ghi chú điều chỉnh
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ví dụ: Tăng lương định kỳ sau thử việc"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <p className="text-[11px] text-slate-500">
                Mức lương mới sẽ kết thúc hiệu lực của mức lương cũ từ ngày áp dụng.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {formLoading ? 'Đang lưu...' : 'Lưu mức lương'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

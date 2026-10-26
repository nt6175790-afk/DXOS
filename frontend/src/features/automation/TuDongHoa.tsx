import { getErrorMessage } from '@/api/error-message';
import { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Layers,
  Activity,
  Check,
  X,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  automationApi,
  AutomationRule,
  AutomationExecution,
} from '@/api/automation';

export function AutomationPage() {
  const { currentOrg } = useOrganization();
  const { hasPermission } = usePermission();
  const canManage = hasPermission('automation:manage');
  const canUpdate = canManage || hasPermission('automation:update');
  const orgId = currentOrg?.id;

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningScan, setRunningScan] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setError(null);
      const [rulesData, execData] = await Promise.all([
        automationApi.listRules(orgId),
        automationApi.listExecutions(orgId, 25),
      ]);
      setRules(rulesData);
      setExecutions(execData);
    } catch (err) {
      setError(getErrorMessage(err, 'Lỗi khi tải dữ liệu tự động hóa'));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleRule = async (ruleId: string, currentStatus: boolean) => {
    if (!orgId || !canUpdate) return;
    try {
      await automationApi.toggleRule(orgId, ruleId, !currentStatus);
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, isActive: !currentStatus } : r))
      );
    } catch (err) {
      alert('Không thể thay đổi trạng thái quy tắc: ' + (getErrorMessage(err, 'Lỗi')));
    }
  };

  const handleRunScan = async () => {
    if (!orgId || !canManage) return;
    try {
      setRunningScan(true);
      setScanMessage(null);
      const res = await automationApi.runScan(orgId);
      setScanMessage(
        `Quét hoàn tất! Kích hoạt thành công ${res.triggersFired || 0} tác vụ tự động hóa an toàn.`
      );
      await loadData();
    } catch (err) {
      setError('Lỗi khi chạy quét tự động: ' + (getErrorMessage(err, 'Lỗi')));
    } finally {
      setRunningScan(false);
    }
  };

  const activeRulesCount = rules.filter((r) => r.isActive).length;
  const successExecutionsCount = executions.filter((e) => e.status === 'SUCCESS').length;
  const failedExecutionsCount = executions.filter((e) => e.status === 'FAILED').length;

  return (
    <div className="space-y-6" data-testid="automation-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Tự động hóa Nhân sự (HR Automation)
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <Shield className="w-3 h-3" /> Safe Bounded Engine
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quy trình tự động hóa hướng sự kiện (EVENT &rarr; RULE &rarr; SAFE ACTION), đảm bảo tính bất biến (Idempotent) và kiểm toán đầy đủ.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
            title="Làm mới dữ liệu"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <button
            onClick={handleRunScan}
            disabled={runningScan || !canManage}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-colors disabled:opacity-50"
            data-testid="btn-run-automation-scan"
          >
            <Play className={`w-4 h-4 ${runningScan ? 'animate-pulse' : ''}`} />
            {runningScan ? 'Đang quét nghiệp vụ...' : 'Chạy kiểm tra ngay'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {scanMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-medium">{scanMessage}</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Quy tắc kích hoạt
            </span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {activeRulesCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">/ {rules.length} quy tắc</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Đang sẵn sàng tự động chạy</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Lượt chạy thành công
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {successExecutionsCount}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">100% an toàn</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Ghi log kiểm toán đầy đủ</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Lỗi thực thi
            </span>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {failedExecutionsCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">lỗi</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Hệ thống xử lý lỗi khép kín</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cơ chế bảo vệ
            </span>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              Idempotent Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tránh trùng lặp tác vụ</p>
        </div>
      </div>

      {/* Rules Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Danh sách quy tắc tự động hóa</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cấu hình các bộ lọc điều kiện và hành động an toàn gắn liền với từng sự kiện HR.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {rules.length} quy tắc
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="automation-rules-table">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-3">Tên quy tắc</th>
                <th className="px-6 py-3">Sự kiện kích hoạt (Trigger)</th>
                <th className="px-6 py-3">Hành động an toàn (Actions)</th>
                <th className="px-6 py-3">Lần chạy cuối</th>
                <th className="px-6 py-3 text-center">Kích hoạt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Chưa có quy tắc nào. Nhấn Làm mới để tải các quy tắc tiêu chuẩn.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => {
                  let actionsCount = 0;
                  try {
                    actionsCount = JSON.parse(rule.actions || '[]').length;
                  } catch {
                    actionsCount = 0;
                  }

                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{rule.name}</div>
                        {rule.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                            {rule.description}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          {rule.trigger}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                          <Layers className="w-3.5 h-3.5 text-brand-600" />
                          <span>{actionsCount} hành động bounded</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                        {rule.lastRunAt ? (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(rule.lastRunAt).toLocaleString('vi-VN')}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Chưa chạy</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          disabled={!canUpdate}
                          onClick={() => handleToggleRule(rule.id, rule.isActive)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            rule.isActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                          title={rule.isActive ? 'Quy tắc đang BẬT' : 'Quy tắc đang TẮT'}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              rule.isActive ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Execution History Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Lịch sử thực thi tự động (Audit Log)</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ghi nhận toàn bộ các lần quét, sự kiện kích hoạt và trạng thái của engine.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {executions.length} lần gần nhất
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="automation-executions-table">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-3">Thời gian</th>
                <th className="px-6 py-3">Quy tắc</th>
                <th className="px-6 py-3">Sự kiện</th>
                <th className="px-6 py-3">Thực thể</th>
                <th className="px-6 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {executions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Chưa có nhật ký thực thi. Nhấn <strong>"Chạy kiểm tra ngay"</strong> để kích hoạt quét.
                  </td>
                </tr>
              ) : (
                executions.map((exec) => (
                  <tr key={exec.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(exec.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">
                      {exec.rule?.name || exec.automationRuleId}
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                        {exec.event}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {exec.entityType ? `${exec.entityType}: ${exec.entityId?.slice(0, 8)}...` : '-'}
                    </td>
                    <td className="px-6 py-3">
                      {exec.status === 'SUCCESS' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          <Check className="w-3 h-3" /> Thành công
                        </span>
                      ) : exec.status === 'FAILED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300" title={exec.error || ''}>
                          <X className="w-3 h-3" /> Lỗi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          Bỏ qua
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
export default AutomationPage;

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { getErrorMessage } from '@/api/error-message';
import { useState, useEffect, useCallback } from 'react';
import {
  GitMerge,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  Play,
  Check,
  X,
  MessageSquare,
  ChevronRight,
  ShieldAlert,
  FileCheck,
  UserCheck,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  workflowsApi,
  WorkflowInstance,
  WorkflowDefinition,
  WorkflowStepExecution,
} from '@/api/workflows';

export function WorkflowsPage() {
  const { currentOrg } = useOrganization();
  const { hasPermission } = usePermission();
  const canManage = hasPermission('workflow:manage');
  const canCreate = canManage || hasPermission('workflow:create');
  const canUpdate = canManage || hasPermission('workflow:update');
  const canCancel = canManage || hasPermission('workflow:cancel');
  const orgId = currentOrg?.id;

  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [confirmingStepId, setConfirmingStepId] = useState<string | null>(null);
  const [confirmComments, setConfirmComments] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setError(null);
      const [defs, insts] = await Promise.all([
        workflowsApi.listDefinitions(orgId),
        workflowsApi.listInstances(orgId, {
          status: statusFilter === 'ALL' ? undefined : statusFilter,
        }),
      ]);
      setDefinitions(defs);
      setInstances(insts);
      setSelectedInstance(current => current ? insts.find(i => i.id === current.id) || null : null);
    } catch (err) {
      setError(getErrorMessage(err, 'Lỗi khi tải dữ liệu quy trình'));
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartWorkflow = async (definitionId: string) => {
    if (!orgId) return;
    try {
      setActionLoading(true);
      setError(null);
      const def = definitions.find((d) => d.id === definitionId);
      const newInst = await workflowsApi.startWorkflow(orgId, {
        workflowDefinitionId: definitionId,
        title: def?.name || 'Quy trình mới',
      });
      setActionSuccess(`Khởi chạy thành công quy trình "${newInst.title}"!`);
      await loadData();
      setSelectedInstance(newInst);
    } catch (err) {
      setError(getErrorMessage(err, 'Lỗi khi khởi chạy quy trình'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmStep = async (instanceId: string, stepId: string) => {
    if (!orgId) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await workflowsApi.confirmStep(orgId, instanceId, stepId, {
        comments: confirmComments || undefined,
      });
      setConfirmingStepId(null);
      setConfirmComments('');
      setActionSuccess('Xác nhận thành công! Quy trình đã tự động chuyển sang bước tiếp theo.');
      await loadData();
      setSelectedInstance(updated);
    } catch (err) {
      setError(getErrorMessage(err, 'Lỗi khi xác nhận bước quy trình'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelWorkflow = async (instanceId: string) => {
    if (!orgId) return;
    if (!confirm('Bạn có chắc chắn muốn hủy quy trình này không?')) return;
    try {
      setActionLoading(true);
      const updated = await workflowsApi.cancelWorkflow(orgId, instanceId, 'Hủy theo yêu cầu quản trị viên');
      setActionSuccess('Đã hủy quy trình thành công.');
      await loadData();
      setSelectedInstance(updated);
    } catch (err) {
      setError(getErrorMessage(err, 'Lỗi khi hủy quy trình'));
    } finally {
      setActionLoading(false);
    }
  };

  const waitingCount = instances.filter((i) => i.status === 'WAITING').length;
  const runningCount = instances.filter((i) => i.status === 'RUNNING').length;
  const completedCount = instances.filter((i) => i.status === 'COMPLETED').length;

  return (
    <div className="space-y-6" data-testid="workflows-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Quy trình làm việc (Intelligent Workflows)
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              <UserCheck className="w-3 h-3" /> Human-in-the-loop
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quy trình đa bước tự động gắn liền với sự kiểm soát và phê duyệt trực tiếp của chuyên viên HR đối với các quyết định nhân sự trọng yếu.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          {canCreate && definitions.length > 0 && (
            <button
              onClick={() => handleStartWorkflow(definitions[0].id)}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-colors disabled:opacity-50"
              data-testid="btn-start-demo-workflow"
            >
              <Play className="w-4 h-4" />
              Khởi chạy quy trình
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium">{actionSuccess}</p>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
            <p className="text-sm font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setStatusFilter('WAITING')}
          className={`cursor-pointer rounded-xl p-4 border transition-all shadow-sm ${
            statusFilter === 'WAITING'
              ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 ring-2 ring-amber-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-300'
          }`}
          data-testid="filter-waiting-card"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Đang chờ HR xác nhận
            </span>
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {waitingCount}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cần xem xét & bấm xác nhận</p>
        </div>

        <div
          onClick={() => setStatusFilter('RUNNING')}
          className={`cursor-pointer rounded-xl p-4 border transition-all shadow-sm ${
            statusFilter === 'RUNNING'
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Đang thực thi
            </span>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              <GitMerge className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {runningCount}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Các bước tự động đang chạy</p>
        </div>

        <div
          onClick={() => setStatusFilter('COMPLETED')}
          className={`cursor-pointer rounded-xl p-4 border transition-all shadow-sm ${
            statusFilter === 'COMPLETED'
              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Đã hoàn tất
            </span>
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {completedCount}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Đã lưu trữ hồ sơ thành công</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {['ALL', 'WAITING', 'RUNNING', 'COMPLETED', 'CANCELLED'].map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === tab
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tab === 'ALL' && 'Tất cả'}
            {tab === 'WAITING' && `Cần xác nhận (${waitingCount})`}
            {tab === 'RUNNING' && `Đang chạy (${runningCount})`}
            {tab === 'COMPLETED' && `Hoàn tất (${completedCount})`}
            {tab === 'CANCELLED' && 'Đã hủy'}
          </button>
        ))}
      </div>

      {/* Main Content: Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Workflow Instances List */}
        <div className="lg:col-span-6 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            Danh sách quy trình ({instances.length})
          </div>

          {instances.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 shadow-sm">
              <GitMerge className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Không có quy trình nào trong danh mục này.</p>
              <p className="text-xs text-slate-400 mt-1">
                Nhấn <strong>"Khởi chạy quy trình gia hạn"</strong> hoặc chạy quét tự động để tạo quy trình mới.
              </p>
            </div>
          ) : (
            instances.map((inst) => {
              const isSelected = selectedInstance?.id === inst.id;
              return (
                <div
                  key={inst.id}
                  onClick={() => setSelectedInstance(inst)}
                  className={`cursor-pointer rounded-xl p-4 border transition-all shadow-sm ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50/20 dark:bg-brand-950/20 ring-1 ring-brand-500'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                  data-testid={`workflow-card-${inst.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            inst.status === 'WAITING'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : inst.status === 'RUNNING'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : inst.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {inst.status === 'WAITING' && 'CẦN XÁC NHẬN'}
                          {inst.status === 'RUNNING' && 'ĐANG CHẠY'}
                          {inst.status === 'COMPLETED' && 'HOÀN TẤT'}
                          {inst.status === 'CANCELLED' && 'ĐÃ HỦY'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(inst.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900 dark:text-white mt-1.5">
                        {inst.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Định nghĩa: {inst.definition?.name || 'Quy trình'}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0 mt-2" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Workflow Detail & Step Timeline */}
        <div className="lg:col-span-6">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 mb-3">
            Chi tiết tiến trình thực thi
          </div>

          {!selectedInstance ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 shadow-sm">
              <FileCheck className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Chọn một quy trình để xem chi tiết các bước thực hiện.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6" data-testid="workflow-detail-panel">
              {/* Header Info */}
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${
                      selectedInstance.status === 'WAITING'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : selectedInstance.status === 'RUNNING'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        : selectedInstance.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Trạng thái: {selectedInstance.status}
                  </span>
                  {canCancel && selectedInstance.status !== 'COMPLETED' && selectedInstance.status !== 'CANCELLED' && (
                    <button
                      onClick={() => handleCancelWorkflow(selectedInstance.id)}
                      disabled={actionLoading}
                      className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                    >
                      Hủy quy trình
                    </button>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-2">
                  {selectedInstance.title}
                </h2>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-4">
                  <span>Mã quy trình: {selectedInstance.id.slice(0, 8)}...</span>
                  <span>Bắt đầu: {new Date(selectedInstance.startedAt).toLocaleString('vi-VN')}</span>
                </div>
              </div>

              {/* Timeline Steps */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Các bước thực hiện (Timeline)
                </h4>

                <div className="space-y-4">
                  {selectedInstance.stepExecutions?.map((step, idx) => {
                    const isWaitingConfirm =
                      step.status === 'WAITING_CONFIRMATION' ||
                      (step.stepType === 'HUMAN_CONFIRMATION' && step.status === 'IN_PROGRESS');

                    return (
                      <div
                        key={step.id}
                        className={`relative pl-8 pb-2 ${
                          idx !== (selectedInstance.stepExecutions?.length || 0) - 1
                            ? 'before:absolute before:left-3.5 before:top-6 before:bottom-0 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700'
                            : ''
                        }`}
                        data-testid={`workflow-step-${step.stepIndex}`}
                      >
                        {/* Step Marker */}
                        <div
                          className={`absolute left-0 top-0.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            step.status === 'COMPLETED'
                              ? 'bg-emerald-600 text-white'
                              : isWaitingConfirm
                              ? 'bg-amber-500 text-white animate-pulse ring-4 ring-amber-200 dark:ring-amber-900/50'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {step.status === 'COMPLETED' ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            step.stepIndex + 1
                          )}
                        </div>

                        {/* Step Content */}
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-slate-900 dark:text-white">
                              {step.stepName}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-medium ${
                                step.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                                  : isWaitingConfirm
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 font-semibold'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {step.status === 'COMPLETED' && 'Đã hoàn tất'}
                              {isWaitingConfirm && 'Chờ HR xác nhận'}
                              {step.status === 'PENDING' && 'Chưa thực hiện'}
                            </span>
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Loại bước: <strong>{step.stepType}</strong>
                            {step.completedAt && (
                              <span className="ml-2">
                                &bull; Xong lúc: {new Date(step.completedAt).toLocaleTimeString('vi-VN')}
                              </span>
                            )}
                          </div>

                          {step.comments && (
                            <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 flex items-start gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                              <span>{step.comments}</span>
                            </div>
                          )}

                          {/* Interactive Human Confirmation Box */}
                          {isWaitingConfirm && (
                            <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-3" data-testid="confirm-step-box">
                              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                                <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                <span>
                                  <strong>Cần phê duyệt từ HR</strong>: Vui lòng kiểm tra điều khoản gia hạn và xác nhận tiếp tục quy trình tự động.
                                </span>
                              </div>

                              <input
                                type="text"
                                value={confirmComments}
                                onChange={(e) => setConfirmComments(e.target.value)}
                                placeholder="Ghi chú phê duyệt (Ví dụ: Đồng ý gia hạn thêm 12 tháng)..."
                                className="w-full text-xs px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                                data-testid="input-confirm-comments"
                              />

                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmStep(selectedInstance.id, step.id)}
                                  disabled={actionLoading || !canUpdate}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                                  data-testid="btn-confirm-workflow-step"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  {actionLoading ? 'Đang xác nhận...' : 'Xác nhận và tiếp tục'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default WorkflowsPage;

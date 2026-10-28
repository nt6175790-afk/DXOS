// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardCheck,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  User,
  Building,
  Calendar,
  Eye,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { approvalsApi } from '@/api/approvals';
import type { ApprovalRequest, ApprovalSummary, ApprovalRequestType, ApprovalStatus } from '@/api/types';
import { CreateAttendanceAdjustmentModal } from './CreateAttendanceAdjustmentModal';
import { ApprovalDetailModal } from './ApprovalDetailModal';

export function ApprovalsPage() {
  const { user } = useAuth();
  const { currentOrg } = useOrganization();
  const { hasPermission } = usePermission();

  const canRead = hasPermission('approval:read');
  const canCreate = hasPermission('approval:create');
  const canApprove = hasPermission('approval:approve');
  const canReview = canApprove || hasPermission('approval:reject');

  const [selectedTab, setActiveTab] = useState<'pending' | 'my' | 'all' | null>(null);
  const activeTab = selectedTab ?? (canReview ? 'pending' : 'my');
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [summary, setSummary] = useState<ApprovalSummary>({
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    myPendingCount: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [isCreateAdjustmentOpen, setIsCreateAdjustmentOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);

  const orgId = currentOrg?.id;

  const loadData = useCallback(async () => {
    if (!orgId || !canRead) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [sumRes, listRes] = await Promise.all([
        approvalsApi.getSummary(orgId).catch(() => ({
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          myPendingCount: 0,
        })),
        approvalsApi.list(orgId, {
          mine: activeTab === 'my' ? true : undefined,
          pending: activeTab === 'pending' ? true : undefined,
          limit: 100,
        }),
      ]);

      setSummary(sumRes);
      setItems(listRes.items);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setError(apiErr?.response?.data?.error?.message || apiErr?.message || 'Không thể tải danh sách phê duyệt');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, canRead, activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Type filter
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;

      // Status filter
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;

      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchName = item.requester.displayName.toLowerCase().includes(q);
        const matchCode = item.requester.employeeCode.toLowerCase().includes(q);
        const matchDept = item.requester.department?.name.toLowerCase().includes(q) ?? false;
        return matchTitle || matchName || matchCode || matchDept;
      }

      return true;
    });
  }, [items, typeFilter, statusFilter, searchTerm]);

  const formatDateTime = (dStr?: string | null) => {
    if (!dStr) return '--';
    const d = new Date(dStr);
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <ClipboardCheck className="w-7 h-7 text-brand-600" />
            Quản lý Phê duyệt
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi và xử lý yêu cầu nghỉ phép, chấm công và bảng lương.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => setIsCreateAdjustmentOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Yêu cầu điều chỉnh chấm công
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chờ phê duyệt</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">{summary.pendingCount}</h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đã phê duyệt</p>
            <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-300 mt-1">{summary.approvedCount}</h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bị từ chối</p>
            <h3 className="text-2xl font-bold text-rose-600 mt-1">{summary.rejectedCount}</h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đơn của tôi chờ duyệt</p>
            <h3 className="text-2xl font-bold text-brand-600 mt-1">{summary.myPendingCount}</h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-slate-200 px-6 pt-4 flex items-center gap-6">
          {canReview && (
            <button
              onClick={() => setActiveTab('pending')}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'pending'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Cần tôi duyệt
              {summary.pendingCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-full font-bold">
                  {summary.pendingCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setActiveTab('my')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'my'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Đơn của tôi
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'all'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Tất cả lịch sử
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên, tiêu đề, mã nhân viên..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Loại:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg text-xs py-1.5 px-2.5 font-medium text-slate-700"
              >
                <option value="ALL">Tất cả loại</option>
                <option value="LEAVE">Nghỉ phép</option>
                <option value="ATTENDANCE_ADJUSTMENT">Điều chỉnh chấm công</option>
                <option value="PAYROLL">Bảng lương</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Trạng thái:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg text-xs py-1.5 px-2.5 font-medium text-slate-700"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="PENDING">Chờ duyệt</option>
                <option value="APPROVED">Đã duyệt</option>
                <option value="REJECTED">Từ chối</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="p-6">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredItems.length === 0 && (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">Không có yêu cầu nào</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              {activeTab === 'pending'
                ? 'Không có yêu cầu đang chờ duyệt.'
                : 'Chưa có dữ liệu yêu cầu phê duyệt phù hợp với bộ lọc.'}
            </p>
          </div>
        )}

        {/* Table list */}
        {!isLoading && !error && filteredItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Tiêu đề yêu cầu</th>
                  <th className="py-3 px-4">Loại yêu cầu</th>
                  <th className="py-3 px-4">Người gửi</th>
                  <th className="py-3 px-4">Phòng ban</th>
                  <th className="py-3 px-4">Ngày gửi</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      <div className="flex flex-col">
                        <span>{item.title}</span>
                        <span className="text-xs text-slate-500 truncate max-w-xs">{item.reason}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        item.type === 'LEAVE'
                          ? 'bg-purple-100 text-purple-700'
                          : item.type === 'PAYROLL'
                          ? 'bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {item.type === 'LEAVE'
                          ? 'Nghỉ phép'
                          : item.type === 'PAYROLL'
                          ? 'Bảng lương'
                          : 'Điều chỉnh chấm công'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-800 font-medium">
                      {item.requester.displayName}
                      <span className="text-xs text-slate-400 block font-normal">{item.requester.employeeCode}</span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                      {item.requester.department?.name || '--'}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                      {formatDateTime(item.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${
                        item.status === 'APPROVED'
                          ? 'bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 text-emerald-700'
                          : item.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-700'
                          : item.status === 'CANCELLED'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.status === 'APPROVED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {item.status === 'REJECTED' && <XCircle className="w-3.5 h-3.5" />}
                        {item.status === 'CANCELLED' && <X className="w-3.5 h-3.5" />}
                        {item.status === 'PENDING' && <Clock className="w-3.5 h-3.5" />}
                        {item.status === 'APPROVED' && 'Đã duyệt'}
                        {item.status === 'REJECTED' && 'Bị từ chối'}
                        {item.status === 'CANCELLED' && 'Đã hủy'}
                        {item.status === 'PENDING' && 'Chờ duyệt'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedApproval(item)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateAttendanceAdjustmentModal
        isOpen={isCreateAdjustmentOpen}
        onClose={() => setIsCreateAdjustmentOpen(false)}
        onSuccess={loadData}
      />

      <ApprovalDetailModal
        isOpen={Boolean(selectedApproval)}
        approval={selectedApproval}
        canApprove={canApprove}
        onClose={() => setSelectedApproval(null)}
        onSuccess={loadData}
      />
    </div>
  );
}

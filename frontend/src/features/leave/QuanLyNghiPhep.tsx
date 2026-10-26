// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarOff,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  Filter,
  Search,
  Check,
  Ban,
  RotateCcw,
  User,
  Building,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { listLeaveRequests, LeaveRequest, LeaveStatus, LeaveType } from '@/api/leave';
import { getMySchedule } from '@/api/self-service';
import { listEmployees } from '@/api/employees';
import type { Employee } from '@/api/types';
import { CreateLeaveModal } from './CreateLeaveModal';
import { ApproveModal, RejectModal, CancelModal } from './LeaveActionModals';

export function LeavePage() {
  const { user } = useAuth();
  const { currentOrg } = useOrganization();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();

  const canRead = hasPermission('leave:read');
  const canCreate = hasPermission('leave:create');
  const canApprove = hasPermission('leave:approve');
  const canCancelOthers = canApprove || hasPermission('leave:cancel');
  const canReadEmployees = hasPermission('employee:read');

  const [activeTab, setActiveTab] = useState<'my' | 'approvals'>('my');
  const [currentEmployee, setCurrentEmployee] = useState<Pick<Employee, 'id' | 'employeeCode' | 'displayName'> | null>(null);

  // Lists
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedLeaveToApprove, setSelectedLeaveToApprove] = useState<LeaveRequest | null>(null);
  const [selectedLeaveToReject, setSelectedLeaveToReject] = useState<LeaveRequest | null>(null);
  const [selectedLeaveToCancel, setSelectedLeaveToCancel] = useState<LeaveRequest | null>(null);

  const orgId = currentOrg?.id;

  // Load current employee profile
  useEffect(() => {
    if (!orgId || !user) return;
    let mounted = true;
    setCurrentEmployee(null);
    const profile = canReadEmployees ? listEmployees(orgId, { userId: user.id }) : getMySchedule(orgId).then(res => ({ items: res.employee ? [res.employee] : [] }));
    profile
      .then((res) => {
        if (mounted && res.items.length > 0) {
          setCurrentEmployee(res.items[0]);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [orgId, user, canReadEmployees]);

  // Load leave requests
  const loadData = useCallback(async () => {
    if (!orgId || !canRead) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch user's own requests
      const myRes = await listLeaveRequests(orgId, { mine: true, limit: 100 });
      setMyRequests(myRes.items);

      // 2. Fetch approval requests if manager
      if (canApprove) {
        const appRes = await listLeaveRequests(orgId, { limit: 100 });
        setApprovalRequests(appRes.items);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setError(axiosErr?.response?.data?.error?.message || axiosErr?.message || 'Không thể tải danh sách đơn nghỉ phép.');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, canRead, canApprove]);

  useEffect(() => {
    if (!isPermissionLoading) {
      loadData();
    }
  }, [loadData, isPermissionLoading]);

  // Status badge helper
  const renderStatusBadge = (status: LeaveStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            Chờ duyệt
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Đã duyệt
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            Từ chối
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <Ban className="w-3 h-3" />
            Đã hủy
          </span>
        );
    }
  };

  const getLeaveTypeLabel = (type: LeaveType) => {
    switch (type) {
      case 'ANNUAL':
        return 'Phép năm';
      case 'SICK':
        return 'Nghỉ ốm';
      case 'PERSONAL':
        return 'Việc riêng';
      case 'UNPAID':
        return 'Không lương';
      case 'OTHER':
      default:
        return 'Khác';
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  // Filtered lists
  const displayedRequests = useMemo(() => {
    const source = activeTab === 'my' ? myRequests : approvalRequests;
    return source.filter((req) => {
      if (statusFilter !== 'ALL' && req.status !== statusFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = req.employee.displayName.toLowerCase().includes(q);
        const matchCode = req.employee.employeeCode.toLowerCase().includes(q);
        const matchReason = req.reason.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchReason) return false;
      }
      return true;
    });
  }, [activeTab, myRequests, approvalRequests, statusFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const approvedDays = myRequests
      .filter((r) => r.status === 'APPROVED')
      .reduce((sum, r) => sum + r.daysCount, 0);
    const pendingCount = myRequests.filter((r) => r.status === 'PENDING').length;
    const approvalPendingCount = approvalRequests.filter((r) => r.status === 'PENDING').length;
    return {
      totalMyRequests: myRequests.length,
      approvedDays,
      pendingCount,
      approvalPendingCount,
    };
  }, [myRequests, approvalRequests]);

  if (isPermissionLoading) {
    return (
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <div className="h-8 bg-slate-200 rounded w-48 animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="p-8 text-center max-w-md mx-auto mt-12 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">Không có quyền truy cập</h3>
        <p className="text-sm text-slate-500 mt-1">
          Bạn cần quyền <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">leave:read</code> để xem mục Nghỉ phép.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <CalendarOff className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quản lý nghỉ phép</h1>
              <p className="text-sm text-slate-500">
                Theo dõi, gửi đơn và xét duyệt nghỉ phép cho nhân sự trong tổ chức
              </p>
            </div>
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo đơn nghỉ phép</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Đơn của tôi</span>
            <div className="p-1.5 rounded-lg bg-slate-50 text-slate-600">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats.totalMyRequests}</span>
            <span className="text-xs text-slate-500">tổng số đơn</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ngày đã nghỉ</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{stats.approvedDays}</span>
            <span className="text-xs text-slate-500">ngày công đã duyệt</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Chờ xét duyệt</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600">{stats.pendingCount}</span>
            <span className="text-xs text-slate-500">đơn đang chờ</span>
          </div>
        </div>

        {canApprove && (
          <div className="p-4 bg-white rounded-xl border border-indigo-100 bg-indigo-50/30 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-indigo-700 uppercase tracking-wider">Cần duyệt gấp</span>
              <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600">
                <Check className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-indigo-700">{stats.approvalPendingCount}</span>
              <span className="text-xs text-indigo-600">đơn chờ bạn duyệt</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs & Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 pt-3">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => {
                setActiveTab('my');
                setStatusFilter('ALL');
              }}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors relative ${
                activeTab === 'my'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Đơn của tôi
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                {myRequests.length}
              </span>
            </button>

            {canApprove && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('approvals');
                  setStatusFilter('PENDING');
                }}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors relative ${
                  activeTab === 'approvals'
                    ? 'border-indigo-600 text-indigo-600 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Chờ duyệt
                {stats.approvalPendingCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-semibold">
                    {stats.approvalPendingCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="pb-3 text-xs text-slate-400 hidden sm:block">
            Múi giờ làm việc: <strong>UTC+07:00</strong>
          </div>
        </div>

        {/* Toolbar: Search and Status Filter */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên, lý do..."
              className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PENDING">Chờ duyệt (Pending)</option>
              <option value="APPROVED">Đã duyệt (Approved)</option>
              <option value="REJECTED">Từ chối (Rejected)</option>
              <option value="CANCELLED">Đã hủy (Cancelled)</option>
            </select>

            <button
              type="button"
              onClick={loadData}
              title="Tải lại dữ liệu"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Table / List */}
        {error && (
          <div className="p-4 bg-red-50 text-red-700 text-sm flex items-center gap-2 border-b border-red-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse border border-slate-100" />
            ))}
          </div>
        ) : displayedRequests.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <CalendarOff className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              {activeTab === 'my'
                ? 'Bạn chưa có đơn nghỉ phép nào'
                : 'Không có đơn nghỉ phép nào cần xử lý'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {activeTab === 'my'
                ? 'Khi bạn tạo yêu cầu nghỉ phép, đơn sẽ hiển thị ở đây để bạn theo dõi trạng thái phê duyệt.'
                : 'Tất cả các yêu cầu nghỉ phép của nhân viên đã được xét duyệt đầy đủ.'}
            </p>
            {activeTab === 'my' && canCreate && (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tạo đơn mới</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50/80 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  {activeTab === 'approvals' && <th className="py-3 px-4">Nhân sự</th>}
                  <th className="py-3 px-4">Loại nghỉ</th>
                  <th className="py-3 px-4">Thời gian nghỉ</th>
                  <th className="py-3 px-4">Số ngày</th>
                  <th className="py-3 px-4">Lý do</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRequests.map((req) => {
                  const isOwnRequest =
                    req.createdByUserId === user?.id || req.employee.id === currentEmployee?.id;

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Employee Column (for approvals tab) */}
                      {activeTab === 'approvals' && (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                              {req.employee.displayName.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{req.employee.displayName}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                                <span>{req.employee.employeeCode}</span>
                                {req.employee.department && (
                                  <>
                                    <span>•</span>
                                    <span className="flex items-center gap-0.5">
                                      <Building className="w-3 h-3 text-slate-400" />
                                      {req.employee.department.name}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Leave Type */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">
                          {getLeaveTypeLabel(req.leaveType)}
                        </span>
                      </td>

                      {/* Dates */}
                      <td className="py-3 px-4 text-xs">
                        <div className="text-slate-800 font-medium">
                          {formatDate(req.startsAt)}
                        </div>
                        <div className="text-slate-500">đến {formatDate(req.endsAt)}</div>
                      </td>

                      {/* Days Count */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-800">
                          {req.daysCount} ngày
                        </span>
                      </td>

                      {/* Reason & Review note */}
                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-xs text-slate-700 line-clamp-2" title={req.reason}>
                          {req.reason}
                        </p>
                        {req.reviewerNote && (
                          <p className="text-xs text-slate-500 mt-1 italic line-clamp-1" title={req.reviewerNote}>
                            Ghi chú: {req.reviewerNote}
                          </p>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">{renderStatusBadge(req.status)}</td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Approvals tab actions */}
                          {activeTab === 'approvals' && req.status === 'PENDING' && (
                            <>
                              {isOwnRequest ? (
                                <span
                                  className="text-xs text-slate-400 italic px-2 py-1 bg-slate-100 rounded"
                                  title="Bạn không thể tự phê duyệt đơn của chính mình"
                                >
                                  Không thể tự duyệt
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedLeaveToApprove(req)}
                                    className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
                                  >
                                    Duyệt
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedLeaveToReject(req)}
                                    className="px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                                  >
                                    Từ chối
                                  </button>
                                </>
                              )}
                            </>
                          )}

                          {/* Cancellation action (Creator or Manager) */}
                          {canCreate && (isOwnRequest || canCancelOthers) && (req.status === 'PENDING' || req.status === 'APPROVED') && (
                            <button
                              type="button"
                              onClick={() => setSelectedLeaveToCancel(req)}
                              className="px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                              title="Hủy đơn nghỉ phép này"
                            >
                              Hủy đơn
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {orgId && (
        <>
          <CreateLeaveModal
            open={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            onSuccess={loadData}
            currentEmployee={currentEmployee}
            orgId={orgId}
          />

          <ApproveModal
            leave={selectedLeaveToApprove}
            orgId={orgId}
            onClose={() => setSelectedLeaveToApprove(null)}
            onSuccess={loadData}
          />

          <RejectModal
            leave={selectedLeaveToReject}
            orgId={orgId}
            onClose={() => setSelectedLeaveToReject(null)}
            onSuccess={loadData}
          />

          <CancelModal
            leave={selectedLeaveToCancel}
            orgId={orgId}
            onClose={() => setSelectedLeaveToCancel(null)}
            onSuccess={loadData}
          />
        </>
      )}
    </div>
  );
}
export default LeavePage;

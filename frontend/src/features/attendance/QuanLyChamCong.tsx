// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  LogIn,
  LogOut,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Users,
  Timer,
  CalendarOff,
  Filter,
  RefreshCw,
  Search,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { format } from 'date-fns';
import { AttendanceClock } from './AttendanceClock';
import { useAttendanceLocation } from './useAttendanceLocation';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import {
  getTodayAttendance,
  checkIn,
  checkOut,
  listAttendance,
  getAttendanceSummary,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceSummary,
  TodayAttendanceResponse,
} from '@/api/attendance';
import { listEmployees } from '@/api/employees';
import type { Employee } from '@/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export function AttendancePage() {
  const { user } = useAuth();
  const { currentOrg } = useOrganization();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();
  const { showToast } = useToast();

  const canRead = hasPermission('attendance:read');
  const canCheckIn = hasPermission('attendance:check-in');
  const canCheckOut = hasPermission('attendance:check-out');
  const canManage = hasPermission('attendance:manage');

  // Real-time clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Today attendance state
  const [todayData, setTodayData] = useState<TodayAttendanceResponse | null>(null);
  const [isTodayLoading, setIsTodayLoading] = useState(true);
  const [noteInput, setNoteInput] = useState('');
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  // Summary state
  const [summaryData, setSummaryData] = useState<AttendanceSummary | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);

  // History table state
  const [historyItems, setHistoryItems] = useState<AttendanceRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [employeeList, setEmployeeList] = useState<Employee[]>([]);

  const orgId = currentOrg?.id;
  const location = useAttendanceLocation(orgId, canRead, canManage);

  // Load employee list for managers
  useEffect(() => {
    if (!orgId || !canManage) return;
    let mounted = true;
    listEmployees(orgId, { limit: 100 })
      .then((res) => {
        if (mounted) setEmployeeList(res.items);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [orgId, canManage]);

  // Load today attendance
  const loadTodayData = useCallback(async () => {
    if (!orgId || !canRead) return;
    setIsTodayLoading(true);
    try {
      const res = await getTodayAttendance(orgId);
      setTodayData(res);
    } catch (err: unknown) {
      // safe fallback
    } finally {
      setIsTodayLoading(false);
    }
  }, [orgId, canRead]);

  // Load monthly summary
  const loadSummaryData = useCallback(async () => {
    if (!orgId || !canRead) return;
    setIsSummaryLoading(true);
    try {
      const res = await getAttendanceSummary(orgId, {
        employeeId: selectedEmployeeId || undefined,
      });
      setSummaryData(res);
    } catch (err: unknown) {
      // safe fallback
    } finally {
      setIsSummaryLoading(false);
    }
  }, [orgId, canRead, selectedEmployeeId]);

  // Load history list
  const loadHistoryData = useCallback(
    async (cursor?: string) => {
      if (!orgId || !canRead) return;
      setIsHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await listAttendance(orgId, {
          employeeId: selectedEmployeeId || undefined,
          workDate: dateFilter || undefined,
          status: statusFilter !== 'ALL' ? (statusFilter as AttendanceStatus) : undefined,
          limit: 15,
          after: cursor,
        });
        setHistoryItems(res.items);
        setNextCursor(res.nextCursor);
      } catch (err: unknown) {
        setHistoryError('Không thể tải lịch sử chấm công. Vui lòng thử lại.');
      } finally {
        setIsHistoryLoading(false);
      }
    },
    [orgId, canRead, selectedEmployeeId, dateFilter, statusFilter],
  );

  useEffect(() => {
    loadTodayData();
    loadSummaryData();
    loadHistoryData();
  }, [loadTodayData, loadSummaryData, loadHistoryData]);

  // Handle Check-In
  const handleCheckIn = async () => {
    if (!orgId || isActionSubmitting) return;
    setIsActionSubmitting(true);
    try {
      const position = await location.requestPosition();
      await checkIn(orgId, noteInput || undefined, position);
      showToast('Điểm danh Check-in thành công!', 'success');
      setNoteInput('');
      await Promise.all([loadTodayData(), loadSummaryData(), loadHistoryData()]);
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string }; message?: string } | undefined;
      const msg = errorObj?.error?.message || errorObj?.message || 'Check-in thất bại.';
      showToast(msg, 'error');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Handle Check-Out
  const handleCheckOut = async () => {
    if (!orgId || isActionSubmitting) return;
    setIsActionSubmitting(true);
    try {
      const position = await location.requestPosition();
      await checkOut(orgId, noteInput || undefined, position);
      showToast('Điểm danh Check-out thành công!', 'success');
      setNoteInput('');
      await Promise.all([loadTodayData(), loadSummaryData(), loadHistoryData()]);
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string }; message?: string } | undefined;
      const msg = errorObj?.error?.message || errorObj?.message || 'Check-out thất bại.';
      showToast(msg, 'error');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Pagination navigation
  const handleNextPage = () => {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, nextCursor]);
    loadHistoryData(nextCursor);
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;
    const newHistory = [...cursorHistory];
    newHistory.pop();
    const prevCursor = newHistory.length > 0 ? newHistory[newHistory.length - 1] : undefined;
    setCursorHistory(newHistory);
    loadHistoryData(prevCursor);
  };

  const formatMinutes = (mins: number | null | undefined) => {
    if (mins == null || mins <= 0) return '0 phút';
    const hours = Math.floor(mins / 60);
    const remainder = mins % 60;
    if (hours > 0 && remainder > 0) return `${hours} giờ ${remainder} phút`;
    if (hours > 0) return `${hours} giờ`;
    return `${remainder} phút`;
  };

  const renderStatusBadge = (status: AttendanceStatus, lateMinutes: number, earlyMinutes: number) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            Đúng giờ
          </span>
        );
      case 'LATE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200">
            Đi muộn ({lateMinutes}p)
          </span>
        );
      case 'ON_LEAVE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            Nghỉ phép
          </span>
        );
      case 'ABSENT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-300">
            Vắng mặt
          </span>
        );
      case 'INCOMPLETE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            Chưa hoàn thành
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  if (isPermissionLoading) {
    return <LoadingState message="Đang kiểm tra quyền truy cập..." />;
  }

  if (!canRead) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Không có quyền truy cập</h2>
        <p className="text-slate-600">Bạn chưa được cấp quyền attendance:read để sử dụng chức năng chấm công.</p>
      </div>
    );
  }

  const todayRecord = todayData?.record;
  const isCheckedIn = !!todayRecord;
  const isCheckedOut = !!todayRecord?.checkOutAt;
  const isOnLeave = !!todayData?.approvedLeave;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Quản lý Chấm công"
        description="Theo dõi điểm danh, giờ làm việc và thống kê ngày công trong hệ thống DX-OS."
      />

      {/* TOP SECTION: REAL-TIME DIGITAL CLOCK & MY ATTENDANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AttendanceClock now={currentTime} shift={todayData?.todayShift} isOff={todayData?.isOff} />

        {/* My Attendance Interactive Action Card */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Timer className="h-5 w-5 text-brand-600" />
                Chấm công hôm nay
              </h2>
              {isOnLeave ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  <CalendarOff className="h-3.5 w-3.5" />
                  Đang nghỉ phép (Đã duyệt)
                </span>
              ) : isCheckedOut ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Đã hoàn thành ngày làm việc
                </span>
              ) : isCheckedIn ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200 animate-pulse">
                  <Clock className="h-3.5 w-3.5" />
                  Đang làm việc
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  Chưa Check-in
                </span>
              )}
            </div>

            {/* Leave Notice Banner */}
            {isOnLeave && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span>
                  Hôm nay bạn đang trong thời gian nghỉ phép đã được duyệt (
                  <strong>{todayData?.approvedLeave?.reason}</strong>). Hệ thống không yêu cầu chấm công.
                </span>
              </div>
            )}

            {/* Scheduled Day Off Banner */}
            {todayData?.isOff && (
              <div className="mb-4 p-3 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-800 flex items-center gap-2.5">
                <CalendarOff className="h-4 w-4 text-slate-500 flex-shrink-0" />
                <span>
                  Hôm nay là <strong>NGÀY NGHỈ</strong> theo lịch phân ca được phân công. Không cần thực hiện chấm công.
                </span>
              </div>
            )}

            {/* No Schedule Assigned Warning Banner */}
            {!isOnLeave && !todayData?.isOff && !todayData?.todayShift && !todayRecord && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                <span>
                  Bạn chưa được phân ca làm việc cho hôm nay. Vui lòng liên hệ quản lý phân ca trước khi chấm công.
                </span>
              </div>
            )}

            {/* Active Shift Details Banner */}
            {todayData?.todayShift && (
              <div className="mb-4 p-3 bg-brand-50 border border-brand-200 rounded-xl text-xs text-brand-900 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <Clock className="h-4 w-4 text-brand-600 shrink-0" />
                  <span>
                    Ca hôm nay: <strong className="text-brand-800">{todayData.todayShift.name} ({todayData.todayShift.code})</strong>
                  </span>
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-brand-200 text-brand-700">
                    {todayData.todayShift.startTime} - {todayData.todayShift.endTime}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px] flex items-center gap-3">
                  {todayData.todayShift.breakStart && (
                    <span>Nghỉ: {todayData.todayShift.breakStart} - {todayData.todayShift.breakEnd}</span>
                  )}
                  {todayData.todayShift.gracePeriodMinutes > 0 && (
                    <span>Ân hạn: {todayData.todayShift.gracePeriodMinutes}p</span>
                  )}
                  {todayData.todayShift.isOvernight && (
                    <span className="text-purple-600 font-medium">Ca qua đêm</span>
                  )}
                </div>
              </div>
            )}

            {location.panel}

            {/* Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-500 mb-1">Giờ Check-in</div>
                <div className="text-base font-bold text-slate-900 font-mono">
                  {todayRecord?.checkInAt ? format(new Date(todayRecord.checkInAt), 'HH:mm:ss') : '—'}
                </div>
                {todayRecord && todayRecord.lateMinutes > 0 && (
                  <div className="text-[11px] text-rose-600 font-medium mt-0.5">
                    Muộn {todayRecord.lateMinutes} phút
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-500 mb-1">Giờ Check-out</div>
                <div className="text-base font-bold text-slate-900 font-mono">
                  {todayRecord?.checkOutAt ? format(new Date(todayRecord.checkOutAt), 'HH:mm:ss') : '—'}
                </div>
                {todayRecord && todayRecord.earlyLeaveMinutes > 0 && (
                  <div className="text-[11px] text-amber-600 font-medium mt-0.5">
                    Về sớm {todayRecord.earlyLeaveMinutes} phút
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-500 mb-1">Tổng giờ làm</div>
                <div className="text-base font-bold text-slate-900">
                  {formatMinutes(todayRecord?.workedMinutes)}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-500 mb-1">Trạng thái</div>
                <div className="mt-0.5">
                  {todayRecord
                    ? renderStatusBadge(todayRecord.status, todayRecord.lateMinutes, todayRecord.earlyLeaveMinutes)
                    : '—'}
                </div>
              </div>
            </div>

            {/* Note input */}
            <div className="mb-4">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Ghi chú khi check-in hoặc check-out (tùy chọn)..."
                disabled={isActionSubmitting || isCheckedOut || isOnLeave}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={handleCheckIn}
              disabled={!location.ready || location.busy || isActionSubmitting || isCheckedIn || isOnLeave || todayData?.isOff || (!todayData?.todayShift && !todayRecord) || !canCheckIn}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                !location.ready || location.busy || isCheckedIn || isOnLeave || todayData?.isOff || (!todayData?.todayShift && !todayRecord) || !canCheckIn
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-500/20 active:scale-[0.99]'
              }`}
            >
              <LogIn className="h-4 w-4" />
              {isActionSubmitting && !isCheckedIn ? 'Đang xử lý...' : 'CHECK IN'}
            </button>

            <button
              onClick={handleCheckOut}
              disabled={!location.ready || location.busy || isActionSubmitting || !isCheckedIn || isCheckedOut || !canCheckOut}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                !location.ready || location.busy || !isCheckedIn || isCheckedOut || !canCheckOut
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20 active:scale-[0.99]'
              }`}
            >
              <LogOut className="h-4 w-4" />
              {isActionSubmitting && isCheckedIn ? 'Đang xử lý...' : 'CHECK OUT'}
            </button>
          </div>
        </div>
      </div>

      {/* MONTHLY SUMMARY KPI CARDS */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-brand-600" />
            Tổng hợp tháng này
            {summaryData?.period && (
              <span className="text-xs font-normal text-slate-500">
                ({summaryData.period.from} đến {summaryData.period.to})
              </span>
            )}
          </h2>
          <button
            onClick={() => loadSummaryData()}
            className="text-xs text-slate-500 hover:text-brand-600 flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Làm mới
          </button>
        </div>

        {isSummaryLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium mb-1">Ngày đã ghi nhận</div>
              <div className="text-2xl font-bold text-slate-900">{summaryData?.totalWorkDays ?? 0}</div>
              <div className="text-[11px] text-slate-400 mt-1">Số ngày có dữ liệu chấm công</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-emerald-600 font-medium mb-1">Đúng giờ</div>
              <div className="text-2xl font-bold text-emerald-700">{summaryData?.presentDays ?? 0}</div>
              <div className="text-[11px] text-slate-400 mt-1">Ngày làm việc chuẩn</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-rose-600 font-medium mb-1">Đi muộn</div>
              <div className="text-2xl font-bold text-rose-700">{summaryData?.lateDays ?? 0}</div>
              <div className="text-[11px] text-slate-400 mt-1">Lần vào sau 09:00</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-amber-600 font-medium mb-1">Nghỉ phép</div>
              <div className="text-2xl font-bold text-amber-700">{summaryData?.leaveDays ?? 0}</div>
              <div className="text-[11px] text-slate-400 mt-1">Đã được phê duyệt</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
              <div className="text-xs text-brand-600 font-medium mb-1">Tổng giờ làm</div>
              <div className="text-xl font-bold text-brand-900">
                {formatMinutes(summaryData?.totalWorkedMinutes)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                TB: {formatMinutes(summaryData?.averageWorkedMinutes)}/ngày
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ATTENDANCE HISTORY & TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Lịch sử chấm công</h2>
            <p className="text-xs text-slate-500 mt-0.5">Chi tiết giờ vào, giờ ra và thời gian công tác theo từng ngày.</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {canManage && employeeList.length > 0 && (
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="">Tất cả nhân viên</option>
                {employeeList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.displayName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            )}

            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white text-slate-700"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PRESENT">Đúng giờ</option>
              <option value="LATE">Đi muộn</option>
              <option value="ON_LEAVE">Nghỉ phép</option>
              <option value="ABSENT">Vắng mặt</option>
            </select>
          </div>
        </div>

        {/* History Table */}
        {isHistoryLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : historyError ? (
          <div className="p-8 text-center">
            <ErrorState message={historyError} onRetry={() => loadHistoryData()} />
          </div>
        ) : historyItems.length === 0 ? (
          <div className="p-8">
            <EmptyState title="Chưa có dữ liệu chấm công" description="Chưa có bản ghi nào phù hợp với bộ lọc." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Ngày làm việc</th>
                  <th className="px-5 py-3.5">Ca làm việc</th>
                  <th className="px-5 py-3.5">Nhân viên</th>
                  <th className="px-5 py-3.5">Giờ vào</th>
                  <th className="px-5 py-3.5">Giờ ra</th>
                  <th className="px-5 py-3.5">Thời gian làm</th>
                  <th className="px-5 py-3.5">Đi muộn</th>
                  <th className="px-5 py-3.5">Về sớm</th>
                  <th className="px-5 py-3.5">Trạng thái</th>
                  <th className="px-5 py-3.5">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900 whitespace-nowrap">
                      {format(new Date(item.workDate), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {item.shift ? (
                        <div>
                          <span className="font-semibold text-slate-800">{item.shift.name}</span>
                          <span className="text-xs text-slate-400 block font-mono">
                            {item.shift.startTime} - {item.shift.endTime}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{item.employee.displayName}</div>
                      <div className="text-xs text-slate-400">{item.employee.employeeCode}</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-700 whitespace-nowrap">
                      {item.checkInAt ? format(new Date(item.checkInAt), 'HH:mm:ss') : '—'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-700 whitespace-nowrap">
                      {item.checkOutAt ? format(new Date(item.checkOutAt), 'HH:mm:ss') : '—'}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-800 whitespace-nowrap">
                      {formatMinutes(item.workedMinutes)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {item.lateMinutes > 0 ? (
                        <span className="text-rose-600 font-medium text-xs">{item.lateMinutes} phút</span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {item.earlyLeaveMinutes > 0 ? (
                        <span className="text-amber-600 font-medium text-xs">{item.earlyLeaveMinutes} phút</span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {renderStatusBadge(item.status, item.lateMinutes, item.earlyLeaveMinutes)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[200px] truncate" title={item.note || ''}>
                      {item.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>Hiển thị {historyItems.length} bản ghi</div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0 || isHistoryLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Trước
            </button>
            <button
              onClick={handleNextPage}
              disabled={!nextCursor || isHistoryLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Sau <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

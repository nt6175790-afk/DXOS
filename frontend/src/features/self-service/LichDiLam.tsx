// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { getErrorMessage } from '@/api/error-message';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  Clock,
  CalendarDays,
  CalendarRange,
  ListFilter,
  User,
  Building,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Coffee,
  ChevronLeft,
  ChevronRight,
  Send,
  HelpCircle,
  Briefcase,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { format, parseISO, startOfWeek, addDays, isSameDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getMySchedule } from '@/api/self-service';
import type { MyScheduleOverview } from '@/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type ViewMode = 'month' | 'week' | 'list';

export function LichDiLam() {
  const { currentOrg } = useOrganization();
  const [data, setData] = useState<MyScheduleOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Month navigation (YYYY-MM)
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const fetchData = useCallback(async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const overview = await getMySchedule(currentOrg.id, { month: currentMonth });
      setData(overview);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải lịch làm việc. Vui lòng thử lại.'));
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg?.id, currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1));
    setCurrentMonth(`${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    setCurrentMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const handleTodayMonth = () => {
    const d = new Date();
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // Days in selected month
  const calendarDays = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const firstDayOfMonth = new Date(Date.UTC(y, m - 1, 1));
    const lastDayOfMonth = new Date(Date.UTC(y, m, 0));
    const totalDays = lastDayOfMonth.getUTCDate();

    // Monday as first day of week: (day + 6) % 7
    const startWeekday = (firstDayOfMonth.getUTCDay() + 6) % 7;

    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      schedule?: MyScheduleOverview['schedules'][number];
      attendance?: MyScheduleOverview['attendanceRecords'][number];
      leave?: MyScheduleOverview['leaveRequests'][number];
    }> = [];

    // Pad previous month days
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1, -i));
      days.push({
        dateStr: d.toISOString().slice(0, 10),
        dayNumber: d.getUTCDate(),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const schedule = data?.schedules.find((s) => s.workDate?.slice(0, 10) === dateStr);
      const attendance = data?.attendanceRecords.find((a) => a.workDate?.slice(0, 10) === dateStr);
      const leave = data?.leaveRequests.find((l) => {
        const start = l.startsAt?.slice(0, 10);
        const end = l.endsAt?.slice(0, 10);
        return start && end && dateStr >= start && dateStr <= end;
      });

      days.push({
        dateStr,
        dayNumber: day,
        isCurrentMonth: true,
        schedule,
        attendance,
        leave,
      });
    }

    // Pad next month days to complete 35 or 42 grid cells
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(Date.UTC(y, m, i));
        days.push({
          dateStr: d.toISOString().slice(0, 10),
          dayNumber: d.getUTCDate(),
          isCurrentMonth: false,
        });
      }
    }

    return days;
  }, [currentMonth, data?.schedules, data?.attendanceRecords, data?.leaveRequests]);

  // Current week days (Monday - Sunday)
  const weekDays = useMemo(() => {
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const schedule = data?.schedules.find((s) => s.workDate?.slice(0, 10) === dateStr);
      const attendance = data?.attendanceRecords.find((a) => a.workDate?.slice(0, 10) === dateStr);
      const leave = data?.leaveRequests.find((l) => {
        const start = l.startsAt?.slice(0, 10);
        const end = l.endsAt?.slice(0, 10);
        return start && end && dateStr >= start && dateStr <= end;
      });

      return {
        date: d,
        dateStr,
        dayOfWeek: format(d, 'EEEE', { locale: vi }),
        schedule,
        attendance,
        leave,
        isToday: isSameDay(d, today),
      };
    });
  }, [data?.schedules, data?.attendanceRecords, data?.leaveRequests]);

  if (isLoading && !data) {
    return <LoadingState message="Đang tải lịch làm việc của bạn..." />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={fetchData} />;
  }

  const employee = data?.employee;
  const today = data?.today;
  const nextShift = data?.nextShift;
  const summary = data?.summary;

  const todayStatusBadge = () => {
    if (!today) return null;
    switch (today.attendanceStatus) {
      case 'LEAVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200">
            🏖 Nghỉ phép
          </span>
        );
      case 'OFF':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            ☕ Ngày nghỉ
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> Đã hoàn thành
          </span>
        );
      case 'LATE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Đi muộn ({today.attendance?.lateMinutes} phút)
          </span>
        );
      case 'CHECKED_IN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock3 className="h-3.5 w-3.5" /> Đang làm việc
          </span>
        );
      case 'NOT_CHECKED_IN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <Clock className="h-3.5 w-3.5" /> Chưa check-in
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
            Chưa phân lịch
          </span>
        );
    }
  };

  const formattedMonthTitle = () => {
    const [y, m] = currentMonth.split('-');
    return `Tháng ${m}/${y}`;
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Lịch đi làm"
        description="Cổng thông tin tự phục vụ: theo dõi ca làm việc, chấm công và lịch nghỉ của bạn."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/attendance"
              className="btn-primary flex items-center gap-2 text-xs sm:text-sm font-medium shadow-sm"
            >
              <Clock className="h-4 w-4" />
              Chấm công
            </Link>
            <Link
              to="/leave"
              className="btn-secondary flex items-center gap-2 text-xs sm:text-sm font-medium"
            >
              <Send className="h-4 w-4" />
              Xin nghỉ phép
            </Link>
          </div>
        }
      />

      {/* Top 2 Primary Cards: HÔM NAY & CA TIẾP THEO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: HÔM NAY */}
        <div className="lg:col-span-2 card p-6 border-l-4 border-l-brand-600 relative overflow-hidden shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-md">
                  Hôm nay
                </span>
                <span className="text-sm font-medium text-slate-500">
                  {today?.dayOfWeek}, {today?.date}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                {today?.isOff
                  ? 'Ngày nghỉ (OFF)'
                  : today?.approvedLeave
                  ? `Nghỉ phép: ${today.approvedLeave.leaveType}`
                  : today?.shift?.name || 'Chưa được phân ca làm việc'}
              </h2>
            </div>
            <div>{todayStatusBadge()}</div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Giờ làm việc</span>
              <p className="text-sm font-semibold text-slate-800">
                {today?.shift
                  ? `${today.shift.startTime} - ${today.shift.endTime}`
                  : '—'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Nghỉ giữa ca</span>
              <p className="text-sm font-semibold text-slate-800">
                {today?.shift?.breakStart && today?.shift?.breakEnd
                  ? `${today.shift.breakStart} - ${today.shift.breakEnd}`
                  : 'Không có'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Check-in</span>
              <p className="text-sm font-semibold text-slate-800">
                {today?.attendance?.checkInAt
                  ? format(parseISO(today.attendance.checkInAt), 'HH:mm')
                  : 'Chưa có'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Check-out</span>
              <p className="text-sm font-semibold text-slate-800">
                {today?.attendance?.checkOutAt
                  ? format(parseISO(today.attendance.checkOutAt), 'HH:mm')
                  : 'Chưa có'}
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: CA TIẾP THEO */}
        <div className="card p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CalendarIcon className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Ca tiếp theo
              </span>
            </div>

            {nextShift ? (
              <div className="space-y-2 mt-3">
                <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
                  {nextShift.dayOfWeek}, {nextShift.date}
                </span>
                <h3 className="text-lg font-bold text-slate-900">{nextShift.shift?.name}</h3>
                <p className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400" />
                  {nextShift.shift?.startTime} - {nextShift.shift?.endTime}
                </p>
                {nextShift.notes && (
                  <p className="text-xs text-slate-500 italic mt-1">Ghi chú: {nextShift.notes}</p>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400">
                <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Bạn chưa có lịch làm việc tiếp theo.</p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Ca mặc định: {today?.shift?.name || 'Hành chính'}</span>
            <Link to="/attendance" className="text-brand-600 hover:text-brand-700 font-medium">
              Lịch sử chấm công &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Overview Statistics Banner (Tổng quan tháng này) */}
      <div className="card p-6 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-600" />
          Tổng quan {formattedMonthTitle()}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="block text-2xl font-bold text-slate-900">
              {summary?.totalScheduledDays ?? 0}
            </span>
            <span className="text-xs text-slate-500 font-medium">Ngày có lịch</span>
          </div>
          <div className="p-3 bg-emerald-50/60 rounded-xl">
            <span className="block text-2xl font-bold text-emerald-700">
              {summary?.workedDays ?? 0}
            </span>
            <span className="text-xs text-emerald-600 font-medium">Đã làm</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="block text-2xl font-bold text-slate-700">{summary?.offDays ?? 0}</span>
            <span className="text-xs text-slate-500 font-medium">Ngày nghỉ ca</span>
          </div>
          <div className="p-3 bg-violet-50/60 rounded-xl">
            <span className="block text-2xl font-bold text-violet-700">
              {summary?.leaveDays ?? 0}
            </span>
            <span className="text-xs text-violet-600 font-medium">Ngày nghỉ phép</span>
          </div>
          <div className="p-3 bg-amber-50/60 rounded-xl">
            <span className="block text-2xl font-bold text-amber-700">
              {summary?.lateCount ?? 0}
            </span>
            <span className="text-xs text-amber-600 font-medium">Đi muộn</span>
          </div>
          <div className="p-3 bg-rose-50/60 rounded-xl">
            <span className="block text-2xl font-bold text-rose-700">
              {summary?.earlyLeaveCount ?? 0}
            </span>
            <span className="text-xs text-rose-600 font-medium">Về sớm</span>
          </div>
          <div className="p-3 bg-blue-50/60 rounded-xl">
            <span className="block text-2xl font-bold text-blue-700">
              {summary?.totalWorkedHours ?? 0}h
            </span>
            <span className="text-xs text-blue-600 font-medium">Tổng giờ làm</span>
          </div>
        </div>
      </div>

      {/* Main Schedule Container (Month / Week / List Tabs) */}
      <div className="card shadow-sm overflow-hidden">
        {/* Navigation bar between views and months */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
              title="Tháng trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-base font-bold text-slate-900 min-w-[120px] text-center">
              {formattedMonthTitle()}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
              title="Tháng sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={handleTodayMonth}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md border border-slate-200"
            >
              Hôm nay
            </button>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'month'
                  ? 'bg-white text-brand-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Lịch tháng
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'week'
                  ? 'bg-white text-brand-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarRange className="h-3.5 w-3.5" /> Tuần này
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-brand-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListFilter className="h-3.5 w-3.5" /> Danh sách
            </button>
          </div>
        </div>

        {/* VIEW 1: MONTH CALENDAR */}
        {viewMode === 'month' && (
          <div className="p-4 overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Day names header */}
              <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                <div>Thứ Hai</div>
                <div>Thứ Ba</div>
                <div>Thứ Tư</div>
                <div>Thứ Năm</div>
                <div>Thứ Sáu</div>
                <div>Thứ Bảy</div>
                <div className="text-rose-500">Chủ Nhật</div>
              </div>

              {/* Grid cells */}
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((d, index) => {
                  const hasShift = d.schedule && !d.schedule.isOff && d.schedule.shift;
                  const isOff = d.schedule && d.schedule.isOff;
                  const isLeave = Boolean(d.leave);
                  const isTodayCell = d.dateStr === today?.date;

                  return (
                    <div
                      key={index}
                      className={`min-h-[96px] p-2 rounded-xl border flex flex-col justify-between transition-all ${
                        isTodayCell
                          ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50/20'
                          : d.isCurrentMonth
                          ? 'border-slate-200 bg-white hover:border-slate-300'
                          : 'border-slate-100 bg-slate-50/50 opacity-40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold ${
                            isTodayCell
                              ? 'h-5 w-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px]'
                              : d.isCurrentMonth
                              ? 'text-slate-800'
                              : 'text-slate-400'
                          }`}
                        >
                          {d.dayNumber}
                        </span>

                        {d.attendance && (
                          <span
                            title={
                              d.attendance.lateMinutes > 0
                                ? `Đi muộn ${d.attendance.lateMinutes}p`
                                : 'Đúng giờ'
                            }
                            className={`h-2 w-2 rounded-full ${
                              d.attendance.lateMinutes > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                          />
                        )}
                      </div>

                      <div className="mt-1 space-y-1">
                        {isLeave ? (
                          <div className="text-[11px] font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded truncate">
                            🏖 Nghỉ phép
                          </div>
                        ) : isOff ? (
                          <div className="text-[11px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-center">
                            OFF
                          </div>
                        ) : hasShift ? (
                          <div className="text-[11px] font-semibold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded truncate">
                            <span className="font-bold">{hasShift.code}</span>{' '}
                            <span className="text-[10px] opacity-80">
                              {hasShift.startTime}-{hasShift.endTime}
                            </span>
                          </div>
                        ) : d.isCurrentMonth ? (
                          <div className="text-[10px] text-slate-400 text-center py-0.5">—</div>
                        ) : null}
                      </div>

                      {d.attendance?.checkInAt && (
                        <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                          <span>Vào:</span>
                          <span className="font-mono font-medium text-slate-700">
                            {format(parseISO(d.attendance.checkInAt), 'HH:mm')}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: WEEK VIEW */}
        {viewMode === 'week' && (
          <div className="p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Lịch làm việc tuần hiện tại
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {weekDays.map((w, index) => {
                const isShift = w.schedule && !w.schedule.isOff && w.schedule.shift;
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border flex flex-col justify-between ${
                      w.isToday
                        ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50/30'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-900">{w.dayOfWeek}</span>
                        {w.isToday && (
                          <span className="text-[10px] font-bold uppercase bg-brand-600 text-white px-1.5 py-0.5 rounded">
                            Nay
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">{w.dateStr}</span>

                      <div className="mt-3">
                        {w.leave ? (
                          <span className="inline-block text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-1 rounded">
                            🏖 Nghỉ phép
                          </span>
                        ) : w.schedule?.isOff ? (
                          <span className="inline-block text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                            Nghỉ ca (OFF)
                          </span>
                        ) : isShift ? (
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-900">
                              {isShift.name}
                            </p>
                            <p className="text-xs text-brand-600 font-semibold flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {isShift.startTime} - {isShift.endTime}
                              {isShift.isOvernight && ' (+1)'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Chưa phân ca</span>
                        )}
                      </div>
                    </div>

                    {w.attendance && (
                      <div className="mt-4 pt-3 border-t border-slate-100 text-xs space-y-0.5">
                        <div className="flex justify-between text-slate-600">
                          <span>Vào:</span>
                          <span className="font-mono font-medium">
                            {format(parseISO(w.attendance.checkInAt), 'HH:mm')}
                          </span>
                        </div>
                        {w.attendance.checkOutAt && (
                          <div className="flex justify-between text-slate-600">
                            <span>Ra:</span>
                            <span className="font-mono font-medium">
                              {format(parseISO(w.attendance.checkOutAt), 'HH:mm')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 3: LIST VIEW */}
        {viewMode === 'list' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Ngày</th>
                  <th className="py-3 px-4">Ca làm việc</th>
                  <th className="py-3 px-4">Giờ làm</th>
                  <th className="py-3 px-4">Check-in</th>
                  <th className="py-3 px-4">Check-out</th>
                  <th className="py-3 px-4">Thời gian</th>
                  <th className="py-3 px-4 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.schedules && data.schedules.length > 0 ? (
                  data.schedules.map((s) => {
                    const dateStr = s.workDate?.slice(0, 10);
                    const att = data.attendanceRecords.find(
                      (a) => a.workDate?.slice(0, 10) === dateStr,
                    );
                    const isOff = s.isOff;

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-slate-900">{dateStr}</td>
                        <td className="py-3.5 px-4">
                          {isOff ? (
                            <span className="text-slate-400 font-medium">Nghỉ (OFF)</span>
                          ) : (
                            <span className="font-semibold text-slate-800">
                              {s.shift?.name || '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {s.shift ? `${s.shift.startTime} - ${s.shift.endTime}` : '—'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {att?.checkInAt ? format(parseISO(att.checkInAt), 'HH:mm') : '—'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {att?.checkOutAt ? format(parseISO(att.checkOutAt), 'HH:mm') : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">
                          {att?.workedMinutes
                            ? `${Math.floor(att.workedMinutes / 60)}h${att.workedMinutes % 60}p`
                            : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isOff ? (
                            <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded">
                              Nghỉ
                            </span>
                          ) : att?.checkOutAt ? (
                            <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                              Hoàn thành
                            </span>
                          ) : att?.checkInAt ? (
                            <span className="text-xs text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded">
                              Đang làm
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Chưa check-in</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                      Bạn chưa được phân lịch làm việc trong tháng này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Profile & Personal Info Card (Thông tin của tôi) */}
      <div className="card p-6 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
          <User className="h-4 w-4 text-brand-600" />
          Thông tin của tôi
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Họ và tên</span>
            <p className="text-sm font-semibold text-slate-900">
              {employee?.displayName || 'Chưa cập nhật'}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Mã nhân viên</span>
            <p className="text-sm font-mono font-semibold text-brand-700">
              {employee?.employeeCode || '—'}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Email</span>
            <p className="text-sm font-medium text-slate-700">{employee?.email || '—'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Phòng ban</span>
            <p className="text-sm font-medium text-slate-700">
              {employee?.department?.name || 'Chưa gán phòng ban'}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Chức vụ</span>
            <p className="text-sm font-medium text-slate-700">
              {employee?.jobTitle || 'Nhân viên'}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Số điện thoại</span>
            <p className="text-sm font-medium text-slate-700">{employee?.phone || '—'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Trạng thái</span>
            <p className="text-sm font-semibold text-emerald-600">Đang làm việc (Active)</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Hồ sơ</span>
            <p className="text-sm">
              <Link to="/people" className="text-brand-600 hover:underline font-medium">
                Xem chi tiết hồ sơ &rarr;
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export default LichDiLam;

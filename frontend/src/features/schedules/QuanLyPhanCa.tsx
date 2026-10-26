// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarDays,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Coffee,
  CheckCircle2,
  CalendarOff,
  Building2,
  LayoutGrid,
  Table as TableIcon,
  Trash2,
  Moon,
  AlertTriangle,
} from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, isSameDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import {
  listSchedules,
  assignSchedule,
  deleteSchedule,
  WorkSchedule,
} from '@/api/schedules';
import { listShifts, Shift } from '@/api/shifts';
import { listEmployees } from '@/api/employees';
import { listDepartments } from '@/api/departments';
import type { Employee, Department } from '@/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export function SchedulesPage() {
  const { currentOrg } = useOrganization();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();
  const { showToast } = useToast();

  const canRead = hasPermission('schedule:read');
  const canCreate = hasPermission('schedule:create');
  const canManage = hasPermission('schedule:manage');

  const [viewMode, setViewMode] = useState<'CALENDAR' | 'TABLE'>('CALENDAR');
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Date window state for Weekly Calendar (Monday to Sunday)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );

  // Filters
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');

  // Assign Schedule Modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Assign form
  const [formEmpId, setFormEmpId] = useState('');
  const [formShiftId, setFormShiftId] = useState('');
  const [formIsOff, setFormIsOff] = useState(false);
  const [formMode, setFormMode] = useState<'SINGLE' | 'RANGE'>('SINGLE');
  const [formWorkDate, setFormWorkDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formStartDate, setFormStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formEndDate, setFormEndDate] = useState(
    format(addDays(new Date(), 6), 'yyyy-MM-dd'),
  );
  const [formDaysOfWeek, setFormDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [formNotes, setFormNotes] = useState('');

  const orgId = currentOrg?.id;

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  // Load auxiliary data
  useEffect(() => {
    if (!orgId) return;
    let isCancelled = false;

    Promise.all([
      listShifts(orgId, { isActive: true }).catch(() => []),
      listEmployees(orgId, { limit: 100 }).catch(() => ({ items: [] })),
      listDepartments(orgId).catch(() => ({ items: [] })),
    ]).then(([shiftList, empList, deptList]) => {
      if (isCancelled) return;
      setShifts(shiftList);
      setEmployees(empList.items || []);
      setDepartments(deptList.items || []);
      if (shiftList.length > 0) {
        setFormShiftId((prev) => prev || shiftList[0].id);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [orgId]);

  // Load schedules
  const loadSchedules = useCallback(async () => {
    if (!orgId || !canRead) return;
    setIsLoading(true);
    try {
      const fromStr = format(weekDays[0], 'yyyy-MM-dd');
      const toStr = format(weekDays[6], 'yyyy-MM-dd');

      const data = await listSchedules(orgId, {
        from: fromStr,
        to: toStr,
        departmentId: selectedDeptId || undefined,
        employeeId: selectedEmpId || undefined,
        shiftId: selectedShiftId || undefined,
      });
      setSchedules(data);
    } catch (err: unknown) {
      showToast('Không thể tải lịch phân ca làm việc.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, canRead, weekDays, selectedDeptId, selectedEmpId, selectedShiftId, showToast]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const handlePrevWeek = () => {
    setCurrentWeekStart((prev) => addDays(prev, -7));
  };

  const handleNextWeek = () => {
    setCurrentWeekStart((prev) => addDays(prev, 7));
  };

  const handleToday = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  const openAssignModal = (targetEmpId?: string, targetDate?: Date) => {
    setFormEmpId(targetEmpId || (employees[0]?.id || ''));
    setFormShiftId(shifts[0]?.id || '');
    setFormIsOff(false);
    if (targetDate) {
      setFormMode('SINGLE');
      setFormWorkDate(format(targetDate, 'yyyy-MM-dd'));
    } else {
      setFormMode('SINGLE');
      setFormWorkDate(format(new Date(), 'yyyy-MM-dd'));
    }
    setFormStartDate(format(new Date(), 'yyyy-MM-dd'));
    setFormEndDate(format(addDays(new Date(), 6), 'yyyy-MM-dd'));
    setFormDaysOfWeek([1, 2, 3, 4, 5]);
    setFormNotes('');
    setIsAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || isSubmitting) return;

    if (!formEmpId) {
      showToast('Vui lòng chọn nhân viên cần phân ca.', 'error');
      return;
    }

    if (!formIsOff && !formShiftId) {
      showToast('Vui lòng chọn ca làm việc hoặc tích chọn ngày nghỉ.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (formMode === 'SINGLE') {
        await assignSchedule(orgId, {
          employeeId: formEmpId,
          shiftId: formIsOff ? undefined : formShiftId,
          workDate: formWorkDate,
          isOff: formIsOff,
          notes: formNotes || undefined,
        });
      } else {
        await assignSchedule(orgId, {
          employeeId: formEmpId,
          shiftId: formIsOff ? undefined : formShiftId,
          startDate: formStartDate,
          endDate: formEndDate,
          daysOfWeek: formDaysOfWeek,
          isOff: formIsOff,
          notes: formNotes || undefined,
        });
      }

      showToast('Phân ca làm việc thành công!', 'success');
      setIsAssignModalOpen(false);
      loadSchedules();
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string }; response?: { data?: { message?: string } }; message?: string };
      const msg = errorObj.error?.message || errorObj.response?.data?.message || errorObj.message || 'Phân ca thất bại.';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!orgId) return;
    try {
      await deleteSchedule(orgId, scheduleId);
      showToast('Đã hủy lịch làm việc của ngày này.', 'success');
      loadSchedules();
    } catch (err: unknown) {
      showToast('Không thể hủy lịch làm việc.', 'error');
    }
  };

  const toggleDayOfWeek = (day: number) => {
    setFormDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  // Filtered employees for the calendar rows
  const displayEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (selectedDeptId && emp.departmentId !== selectedDeptId) return false;
      if (selectedEmpId && emp.id !== selectedEmpId) return false;
      return true;
    });
  }, [employees, selectedDeptId, selectedEmpId]);

  if (isPermissionLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (!canRead) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Không có quyền truy cập</h2>
        <p className="text-slate-600">Bạn chưa được cấp quyền để xem lịch phân ca.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch Phân Ca Làm Việc"
        description="Quản lý và sắp xếp lịch làm việc theo ca, ngày làm và ngày nghỉ cho nhân viên."
        actions={
          canCreate && (
            <button
              onClick={() => openAssignModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Phân ca làm việc
            </button>
          )
        }
      />

      {/* Control Bar: Filters & Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevWeek}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors"
              title="Tuần trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 text-slate-800 transition-colors"
            >
              Hôm nay
            </button>
            <button
              onClick={handleNextWeek}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors"
              title="Tuần kế tiếp"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="text-sm font-bold text-slate-900 ml-2">
              {format(weekDays[0], 'dd/MM/yyyy')} — {format(weekDays[6], 'dd/MM/yyyy')}
            </span>
          </div>

          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
            <button
              onClick={() => setViewMode('CALENDAR')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'CALENDAR'
                  ? 'bg-white text-brand-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Lịch tuần
            </button>
            <button
              onClick={() => setViewMode('TABLE')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'TABLE'
                  ? 'bg-white text-brand-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" /> Danh sách
            </button>
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Phòng ban</label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Tất cả phòng ban</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nhân viên</label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Tất cả nhân viên</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.displayName} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Ca làm việc</label>
            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Tất cả ca</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime} - {s.endTime})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Schedule Content */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : viewMode === 'CALENDAR' ? (
        /* Calendar Grid View */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-semibold">
                <th className="p-3 text-left w-56 border-r border-slate-200">Nhân viên</th>
                {weekDays.map((day) => {
                  const isToday = isSameDay(day, new Date());
                  return (
                    <th
                      key={day.toISOString()}
                      className={`p-3 text-center border-r border-slate-200 last:border-r-0 ${
                        isToday ? 'bg-brand-50 text-brand-900 font-bold' : ''
                      }`}
                    >
                      <div className="uppercase tracking-wider text-[11px] text-slate-500">
                        {format(day, 'EEEE', { locale: vi })}
                      </div>
                      <div className="text-sm mt-0.5">{format(day, 'dd/MM')}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {displayEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    Không có nhân viên nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                displayEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3 border-r border-slate-200">
                      <div className="font-semibold text-slate-900">{emp.displayName}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <span className="font-mono">{emp.employeeCode}</span>
                        {emp.jobTitle && <span>• {emp.jobTitle}</span>}
                      </div>
                    </td>

                    {weekDays.map((day) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const schedule = schedules.find(
                        (s) =>
                          s.employeeId === emp.id &&
                          s.workDate.slice(0, 10) === dateStr,
                      );

                      const isToday = isSameDay(day, new Date());

                      return (
                        <td
                          key={dateStr}
                          className={`p-2 border-r border-slate-200 last:border-r-0 text-center align-top ${
                            isToday ? 'bg-brand-50/20' : ''
                          }`}
                        >
                          {schedule ? (
                            schedule.isOff ? (
                              <div className="p-2 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 flex flex-col items-center justify-center gap-0.5 group relative">
                                <span className="font-bold text-[11px] flex items-center gap-1">
                                  <CalendarOff className="w-3 h-3 text-slate-400" /> Nghỉ (OFF)
                                </span>
                                {canManage && (
                                  <button
                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 text-rose-500 hover:bg-rose-50 rounded"
                                    title="Hủy lịch"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : schedule.shift ? (
                              <div
                                className={`p-2 rounded-lg border flex flex-col items-center justify-center gap-0.5 group relative ${
                                  schedule.shift.isOvernight
                                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                }`}
                              >
                                <span className="font-bold text-[11px] truncate max-w-[90px]">
                                  {schedule.shift.name}
                                </span>
                                <span className="text-[10px] text-slate-600 font-mono">
                                  {schedule.shift.startTime} - {schedule.shift.endTime}
                                </span>
                                {schedule.shift.isOvernight && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] text-indigo-700 bg-white/70 px-1 rounded">
                                    <Moon className="w-2.5 h-2.5" /> Đêm
                                  </span>
                                )}
                                {canManage && (
                                  <button
                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 text-rose-500 hover:bg-rose-50 rounded"
                                    title="Hủy lịch"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : null
                          ) : (
                            canCreate && (
                              <button
                                onClick={() => openAssignModal(emp.id, day)}
                                className="w-full h-14 border border-dashed border-slate-200 rounded-lg hover:border-brand-400 hover:bg-brand-50/40 text-slate-400 hover:text-brand-600 transition-all flex items-center justify-center"
                                title="Gán ca làm việc"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="p-3">Nhân viên</th>
                <th className="p-3">Ngày làm việc</th>
                <th className="p-3">Ca phân công</th>
                <th className="p-3">Khung giờ</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Ghi chú</th>
                {canManage && <th className="p-3 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Không có dữ liệu phân ca nào trong tuần này.
                  </td>
                </tr>
              ) : (
                schedules.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{s.employee.displayName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {s.employee.employeeCode}
                      </div>
                    </td>
                    <td className="p-3 font-medium text-slate-800">
                      {format(new Date(s.workDate), 'EEEE, dd/MM/yyyy', { locale: vi })}
                    </td>
                    <td className="p-3 font-semibold text-slate-900">
                      {s.isOff ? '—' : s.shift?.name || 'Chưa xác định'}
                    </td>
                    <td className="p-3 font-mono text-slate-700">
                      {s.isOff
                        ? '—'
                        : s.shift
                        ? `${s.shift.startTime} - ${s.shift.endTime}`
                        : '—'}
                    </td>
                    <td className="p-3">
                      {s.isOff ? (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full font-medium text-[11px]">
                          Ngày nghỉ
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-medium text-[11px]">
                          Đi làm
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-slate-500 italic max-w-xs truncate">
                      {s.notes || '—'}
                    </td>
                    {canManage && (
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteSchedule(s.id)}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                          title="Hủy lịch"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Schedule Modal */}
      <Modal
        open={isAssignModalOpen}
        onClose={() => !isSubmitting && setIsAssignModalOpen(false)}
        title="Phân Ca Làm Việc Cho Nhân Viên"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nhân viên <span className="text-rose-500">*</span>
            </label>
            <select
              value={formEmpId}
              onChange={(e) => setFormEmpId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">-- Chọn nhân viên --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.displayName} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>

          {/* Single vs Batch Range */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Hình thức phân ca
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormMode('SINGLE')}
                className={`py-2 text-xs font-medium rounded-lg border ${
                  formMode === 'SINGLE'
                    ? 'bg-brand-50 border-brand-500 text-brand-700 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Theo ngày đơn lẻ
              </button>
              <button
                type="button"
                onClick={() => setFormMode('RANGE')}
                className={`py-2 text-xs font-medium rounded-lg border ${
                  formMode === 'RANGE'
                    ? 'bg-brand-50 border-brand-500 text-brand-700 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Theo dải ngày (Hàng loạt)
              </button>
            </div>
          </div>

          {formMode === 'SINGLE' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày làm việc <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={formWorkDate}
                onChange={(e) => setFormWorkDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Từ ngày <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Đến ngày <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Áp dụng các thứ trong tuần:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'T2', val: 1 },
                    { label: 'T3', val: 2 },
                    { label: 'T4', val: 3 },
                    { label: 'T5', val: 4 },
                    { label: 'T6', val: 5 },
                    { label: 'T7', val: 6 },
                    { label: 'CN', val: 0 },
                  ].map((d) => (
                    <button
                      key={d.val}
                      type="button"
                      onClick={() => toggleDayOfWeek(d.val)}
                      className={`px-3 py-1 text-xs rounded-md font-medium border ${
                        formDaysOfWeek.includes(d.val)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Shift Selection or OFF day */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-800 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={formIsOff}
                onChange={(e) => setFormIsOff(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Đánh dấu là ngày nghỉ (OFF Day)
            </label>

            {!formIsOff && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Chọn ca làm việc <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formShiftId}
                  onChange={(e) => setFormShiftId(e.target.value)}
                  required={!formIsOff}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Chọn ca --</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime} - {s.endTime}) {s.isOvernight ? '🌙 Qua đêm' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú</label>
            <input
              type="text"
              placeholder="VD: Phân ca theo lịch dự án..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsAssignModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Xác nhận phân ca'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

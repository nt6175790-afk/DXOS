// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import * as attendanceApi from '@/api/attendance';
import * as employeesApi from '@/api/employees';

const state = vi.hoisted(() => ({
  orgId: 'org-1',
  userId: 'user-actor',
  permissions: new Set<string>(),
}));

vi.mock('@/api/attendance');
vi.mock('@/api/employees');
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: state.userId, email: 'actor@dxos.test', displayName: 'Actor User' },
    isAuthenticated: true,
  }),
}));
vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: () => ({ currentOrg: { id: state.orgId, name: 'DX-OS Corp' } }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    hasPermission: (key: string) => state.permissions.has(key),
    isLoading: false,
  }),
}));
const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockTodayData = {
  isEmployee: true,
  employee: {
    id: 'emp-actor',
    displayName: 'Actor User',
    employeeCode: 'EMP001',
    status: 'ACTIVE',
  },
  record: null as attendanceApi.AttendanceRecord | null,
  approvedLeave: null as attendanceApi.TodayAttendanceResponse['approvedLeave'],
  todayDate: '2026-09-16',
  todayShift: {
    id: 'shift-1',
    organizationId: 'org-1',
    name: 'Hành chính',
    code: 'HC',
    startTime: '08:30',
    endTime: '17:30',
    breakStart: '12:00',
    breakEnd: '13:00',
    gracePeriodMinutes: 10,
    isOvernight: false,
    isActive: true,
    description: null,
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
  },
  isOff: false,
};

const mockSummary = {
  period: { from: '2026-09-01', to: '2026-09-30' },
  totalWorkDays: 22,
  presentDays: 15,
  lateDays: 2,
  absentDays: 0,
  leaveDays: 1,
  totalWorkedMinutes: 8500,
  averageWorkedMinutes: 500,
  totalRecords: 17,
};

const mockHistoryRecord: attendanceApi.AttendanceRecord = {
  id: 'att-1',
  organizationId: 'org-1',
  employeeId: 'emp-actor',
  workDate: '2026-09-16T00:00:00.000Z',
  checkInAt: '2026-09-16T08:55:00.000Z',
  checkOutAt: '2026-09-16T18:05:00.000Z',
  status: 'PRESENT',
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  workedMinutes: 510,
  note: 'Check in on time',
  createdAt: '2026-09-16T08:55:00.000Z',
  updatedAt: '2026-09-16T18:05:00.000Z',
  employee: {
    id: 'emp-actor',
    employeeCode: 'EMP001',
    displayName: 'Actor User',
    jobTitle: 'Developer',
    departmentId: 'dept-1',
    department: { id: 'dept-1', name: 'Engineering', code: 'ENG' },
  },
};

describe('AttendancePage Component & User Flows', () => {
  beforeEach(() => {
    state.orgId = 'org-1';
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'geolocation', {configurable:true,value:{getCurrentPosition:vi.fn((success) => success({coords:{latitude:21,longitude:105.8,accuracy:5},timestamp:Date.now()}))}});
    vi.mocked(attendanceApi.getAttendanceLocation).mockResolvedValue({office:{label:'Văn phòng',latitude:21,longitude:105.8,updatedAt:''},radiusMeters:100,maxAccuracyMeters:50,maxAgeSeconds:60});
    state.permissions = new Set(['attendance:read', 'attendance:check-in', 'attendance:check-out']);

    vi.mocked(attendanceApi.getTodayAttendance).mockResolvedValue({ ...mockTodayData });
    vi.mocked(attendanceApi.getAttendanceSummary).mockResolvedValue({ ...mockSummary });
    vi.mocked(attendanceApi.listAttendance).mockResolvedValue({
      items: [mockHistoryRecord],
      nextCursor: null,
    });
    vi.mocked(employeesApi.listEmployees).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
  });

  it('1. renders permission denied state when user lacks attendance:read', async () => {
    state.permissions.clear();
    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('2. renders attendance overview with KPI cards and clock when authorized', async () => {
    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Quản lý Chấm công')).toBeInTheDocument();
    expect(screen.getByText('Chấm công hôm nay')).toBeInTheDocument();
    expect(screen.getByText('Tổng hợp tháng này')).toBeInTheDocument();
    expect(screen.getByText('Ngày công chuẩn')).toBeInTheDocument();
    expect(screen.getAllByText('Đúng giờ').length).toBeGreaterThanOrEqual(1);
  });

  it('3. performs check-in successfully and reloads attendance state', async () => {
    vi.mocked(attendanceApi.checkIn).mockResolvedValue({
      ...mockHistoryRecord,
      checkOutAt: null,
      workedMinutes: null,
    });

    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    const checkInBtn = await screen.findByRole('button', { name: /CHECK IN/i });
    await waitFor(() => expect(checkInBtn).not.toBeDisabled());

    fireEvent.click(checkInBtn);

    await waitFor(() => {
      expect(attendanceApi.checkIn).toHaveBeenCalledWith('org-1', undefined, expect.objectContaining({latitude:21,longitude:105.8,accuracyMeters:5,capturedAt:expect.any(String)}));
      expect(mockShowToast).toHaveBeenCalledWith('Điểm danh Check-in thành công!', 'success');
    });
  });

  it('4. performs check-out successfully when employee is already checked in', async () => {
    vi.mocked(attendanceApi.getTodayAttendance).mockResolvedValue({
      ...mockTodayData,
      record: {
        ...mockHistoryRecord,
        checkOutAt: null,
        workedMinutes: null,
      },
    });

    vi.mocked(attendanceApi.checkOut).mockResolvedValue({
      ...mockHistoryRecord,
      checkOutAt: '2026-09-16T18:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    const checkOutBtn = await screen.findByRole('button', { name: /CHECK OUT/i });
    await waitFor(() => expect(checkOutBtn).not.toBeDisabled());

    fireEvent.click(checkOutBtn);

    await waitFor(() => {
      expect(attendanceApi.checkOut).toHaveBeenCalledWith('org-1', undefined, expect.objectContaining({latitude:21,longitude:105.8,accuracyMeters:5,capturedAt:expect.any(String)}));
      expect(mockShowToast).toHaveBeenCalledWith('Điểm danh Check-out thành công!', 'success');
    });
  });

  it('5. disables check-in and shows alert banner when employee is on approved leave today', async () => {
    vi.mocked(attendanceApi.getTodayAttendance).mockResolvedValue({
      ...mockTodayData,
      approvedLeave: {
        id: 'leave-1',
        leaveType: 'ANNUAL',
        startsAt: '2026-09-16T01:00:00.000Z',
        endsAt: '2026-09-16T10:00:00.000Z',
        daysCount: 1.0,
        reason: 'Nghỉ phép thường niên',
      },
    });

    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Đang nghỉ phép \(Đã duyệt\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Hôm nay bạn đang trong thời gian nghỉ phép đã được duyệt/i)).toBeInTheDocument();

    const checkInBtn = screen.getByRole('button', { name: /CHECK IN/i });
    expect(checkInBtn).toBeDisabled();
  });

  it('6. disables check-in button when already checked in today', async () => {
    vi.mocked(attendanceApi.getTodayAttendance).mockResolvedValue({
      ...mockTodayData,
      record: mockHistoryRecord,
    });

    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    const checkInBtn = await screen.findByRole('button', { name: /CHECK IN/i });
    expect(checkInBtn).toBeDisabled();
  });

  it('7. renders employee selector for managers with attendance:manage permission', async () => {
    state.permissions.add('attendance:manage');
    vi.mocked(employeesApi.listEmployees).mockResolvedValue({
      items: [
        {
          id: 'emp-1',
          organizationId: 'org-1',
          userId: 'u-1',
          employeeCode: 'EMP001',
          displayName: 'Nguyen Van A',
          departmentId: null,
          jobTitle: null,
          phone: null,
          status: 'ACTIVE',
          createdAt: '',
          updatedAt: '',
        },
      ],
      nextCursor: null,
    });

    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Tất cả nhân viên')).toBeInTheDocument();
    expect(screen.getByText(/Nguyen Van A/i)).toBeInTheDocument();
  });

  it('8. filters attendance history by status when status filter changes', async () => {
    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    await screen.findByText('Lịch sử chấm công');
    const statusSelect = screen.getByDisplayValue('Tất cả trạng thái');

    fireEvent.change(statusSelect, { target: { value: 'LATE' } });

    await waitFor(() => {
      expect(attendanceApi.listAttendance).toHaveBeenCalledWith('org-1', expect.objectContaining({ status: 'LATE' }));
    });
  });

  it('9. disables check-in and displays warning when no schedule is assigned for today', async () => {
    vi.mocked(attendanceApi.getTodayAttendance).mockResolvedValue({
      ...mockTodayData,
      todayShift: null,
      isOff: false,
    });

    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Bạn chưa được phân ca làm việc cho hôm nay/i)).toBeInTheDocument();
    const checkInBtn = screen.getByRole('button', { name: /CHECK IN/i });
    expect(checkInBtn).toBeDisabled();
  });

  it('10. disables check-in and displays off-day notice when employee is scheduled off', async () => {
    vi.mocked(attendanceApi.getTodayAttendance).mockResolvedValue({
      ...mockTodayData,
      todayShift: null,
      isOff: true,
    });

    render(
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Hôm nay là.*NGÀY NGHỈ.*theo lịch phân ca/i)).toBeInTheDocument();
    const checkInBtn = screen.getByRole('button', { name: /CHECK IN/i });
    expect(checkInBtn).toBeDisabled();
  });
  it('11. denies check-in without browser location permission and never posts attendance', async () => {
    vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((_success,error)=>error?.({code:1} as GeolocationPositionError));
    render(<MemoryRouter><AttendancePage /></MemoryRouter>);
    const button=await screen.findByRole('button',{name:/CHECK IN/i});
    await waitFor(()=>expect(button).not.toBeDisabled());fireEvent.click(button);
    await waitFor(()=>expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('chưa cho phép'),'error'));
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });
  it('12. rejects a distant device and displays its distance without posting', async () => {
    vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation(success=>success({coords:{latitude:22,longitude:105.8,accuracy:5},timestamp:Date.now()} as GeolocationPosition));
    render(<MemoryRouter><AttendancePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:'Cập nhật vị trí của tôi'}));
    expect(await screen.findByText(/ngoài vùng chấm công 100 m/)).toBeInTheDocument();
    expect(screen.getByText(/Khoảng cách:/)).toBeInTheDocument();
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });
  it('13. blocks attendance until office is configured and does not expose settings to employees', async () => {
    vi.mocked(attendanceApi.getAttendanceLocation).mockResolvedValue({office:null,radiusMeters:100,maxAccuracyMeters:50,maxAgeSeconds:60});
    render(<MemoryRouter><AttendancePage /></MemoryRouter>);
    expect(await screen.findByText(/Công ty chưa thiết lập vị trí/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/CHECK IN/i})).toBeDisabled();
    expect(screen.queryByText('Thiết lập vị trí công ty')).not.toBeInTheDocument();
  });

  it('14. reports GPS timeout and does not post attendance', async () => {
    vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((_success,error)=>error?.({code:3} as GeolocationPositionError));
    render(<MemoryRouter><AttendancePage /></MemoryRouter>);
    const button=await screen.findByRole('button',{name:/CHECK IN/i});
    await waitFor(()=>expect(button).not.toBeDisabled()); fireEvent.click(button);
    await waitFor(()=>expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('quá thời gian'),'error'));
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });

  it('15. managers save the selected Google Maps pin without manual coordinates or client radius', async () => {
    state.permissions.add('attendance:manage');
    vi.mocked(attendanceApi.setAttendanceLocation).mockResolvedValue({office:{label:'Trụ sở',latitude:21,longitude:105.8,updatedAt:''},radiusMeters:100,maxAccuracyMeters:50,maxAgeSeconds:60});
    render(<MemoryRouter><AttendancePage /></MemoryRouter>);
    await screen.findByText('Văn phòng');
    fireEvent.click(screen.getByRole('button',{name:'Thiết lập vị trí công ty'}));
    fireEvent.change(screen.getByLabelText('Địa chỉ công ty'),{target:{value:'Trụ sở'}});
    expect(screen.getByRole('button',{name:'Lưu vị trí công ty'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Link địa điểm Google Maps'),{target:{value:'https://www.google.com/maps/place/Office/data=!3d21!4d105.8'}});
    fireEvent.click(screen.getByRole('button',{name:'Lưu vị trí công ty'}));
    await waitFor(()=>expect(attendanceApi.setAttendanceLocation).toHaveBeenCalledWith('org-1',{label:'Trụ sở',latitude:21,longitude:105.8}));
    expect(await screen.findByText('Trụ sở')).toBeInTheDocument();
  });

  it('16. ignores a delayed GPS result after organization switching', async () => {
    let complete: PositionCallback | undefined;
    vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation(success=>{complete=success;});
    const view=render(<MemoryRouter><AttendancePage /></MemoryRouter>);
    const button=await screen.findByRole('button',{name:/CHECK IN/i});
    await waitFor(()=>expect(button).not.toBeDisabled()); fireEvent.click(button);
    state.orgId='org-2'; view.rerender(<MemoryRouter><AttendancePage /></MemoryRouter>);
    await act(async()=>{complete?.({coords:{latitude:21,longitude:105.8,accuracy:5},timestamp:Date.now()} as GeolocationPosition);});
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
    expect(screen.queryByText(/Vị trí của bạn:/)).not.toBeInTheDocument();
  });

  it('17. blocks an ambiguous viewport URL and shows how to choose a real pin', async () => {
    state.permissions.add('attendance:manage');
    render(<MemoryRouter><AttendancePage /></MemoryRouter>);
    await screen.findByText('Văn phòng');
    fireEvent.click(screen.getByRole('button',{name:'Thiết lập vị trí công ty'}));
    fireEvent.change(screen.getByLabelText('Link địa điểm Google Maps'),{target:{value:'https://www.google.com/maps/@21,105.8,17z'}});
    expect(screen.getByRole('button',{name:'Lưu vị trí công ty'})).toBeDisabled();
    expect(screen.getByText(/Link chưa xác định ghim công ty/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Vĩ độ công ty')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Kinh độ công ty')).not.toBeInTheDocument();
    expect(attendanceApi.setAttendanceLocation).not.toHaveBeenCalled();
  });

});

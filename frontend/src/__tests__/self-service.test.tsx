// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LichDiLam } from '@/features/self-service/LichDiLam';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getMySchedule } from '@/api/self-service';
import type { MyScheduleOverview } from '@/api/types';

vi.mock('@/contexts/OrganizationContext', () => ({ useOrganization: vi.fn() }));
vi.mock('@/api/self-service', () => ({ getMySchedule: vi.fn() }));

const mockOrg = {
  id: 'org-demo',
  name: 'DX-OS Demo',
  slug: 'dxos-demo',
  status: 'ACTIVE' as const,
  createdAt: '',
  updatedAt: '',
};

const scheduleDefaults = { organizationId: 'org-demo', employeeId: 'emp-001', workDate: '2026-09-19T00:00:00.000Z', shiftId: null, notes: null, createdAt: '', updatedAt: '' };
const shiftDefaults = { organizationId: 'org-demo', breakStart: null, breakEnd: null, gracePeriodMinutes: 0, isOvernight: false, isActive: true, description: null, createdAt: '', updatedAt: '' };
const attendanceDefaults = { organizationId: 'org-demo', employeeId: 'emp-001', note: null, createdAt: '', updatedAt: '' };

const mockOverview: MyScheduleOverview = {
  isEmployee: true,
  employee: {
    id: 'emp-001',
    employeeCode: 'DEMO-EMP-001',
    displayName: 'Nguyễn Văn Test',
    jobTitle: 'Chuyên viên Kỹ thuật',
    phone: '+84901234567',
    email: 'test@dxos.local',
    status: 'ACTIVE',
    department: {
      id: 'dept-eng',
      name: 'Phòng Kỹ thuật',
      code: 'ENG',
    },
  },
  today: {
    date: '2026-09-19',
    dayOfWeek: 'Thứ Bảy',
    schedule: {
      ...scheduleDefaults,
      id: 'sched-today',
      isOff: true,
      shift: null,
    },
    shift: null,
    isOff: true,
    attendance: null,
    attendanceStatus: 'OFF',
    approvedLeave: null,
  },
  nextShift: {
    date: '2026-09-21',
    dayOfWeek: 'Thứ Hai',
    shift: {
      id: 'shift-hc',
      name: 'Ca hành chính',
      code: 'HC',
      startTime: '08:00',
      endTime: '17:00',
    },
    notes: 'Dự án trọng điểm',
  },
  schedules: [
    {
      ...scheduleDefaults,
      id: 's1',
      workDate: '2026-09-19T00:00:00.000Z',
      isOff: true,
      shiftId: null,
      shift: null,
    },
    {
      ...scheduleDefaults,
      id: 's2',
      workDate: '2026-09-21T00:00:00.000Z',
      isOff: false,
      shiftId: 'shift-hc',
      shift: {
        ...shiftDefaults,
        id: 'shift-hc',
        name: 'Ca hành chính',
        code: 'HC',
        startTime: '08:00',
        endTime: '17:00',
      },
    },
  ],
  attendanceRecords: [
    {
      ...attendanceDefaults,
      id: 'att-1',
      workDate: '2026-09-18T00:00:00.000Z',
      checkInAt: '2026-09-18T07:55:00.000Z',
      checkOutAt: '2026-09-18T17:02:00.000Z',
      status: 'PRESENT',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 547,
    },
  ],
  leaveRequests: [],
  summary: {
    totalScheduledDays: 20,
    workedDays: 17,
    offDays: 8,
    leaveDays: 2,
    lateCount: 1,
    earlyLeaveCount: 0,
    totalWorkedMinutes: 8160,
    totalWorkedHours: 136,
  },
};

const renderComponent = () =>
  render(
    <MemoryRouter>
      <LichDiLam />
    </MemoryRouter>,
  );

describe('LichDiLam (Employee Self-Service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrg: mockOrg,
      organizations: [mockOrg],
      isLoading: false,
      error: null,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    });
    vi.mocked(getMySchedule).mockResolvedValue(mockOverview);
  });

  it('renders page header and primary today card', async () => {
    renderComponent();

    expect(await screen.findByRole('heading', { level: 1, name: 'Lịch đi làm' })).toBeInTheDocument();
    expect(screen.getByText('Ngày nghỉ (OFF)')).toBeInTheDocument();
    expect(screen.getByText('Thứ Bảy, 2026-09-19')).toBeInTheDocument();
    expect(screen.getByText('Ca tiếp theo')).toBeInTheDocument();
    expect(screen.getByText('Ca hành chính')).toBeInTheDocument();
  });

  it('renders monthly summary statistics accurately', async () => {
    renderComponent();

    expect(await screen.findByText('Tổng giờ làm')).toBeInTheDocument();
    expect(screen.getByText('Ngày có lịch')).toBeInTheDocument();
    expect(screen.getByText('Đã làm')).toBeInTheDocument();
    expect(screen.getByText('136h')).toBeInTheDocument(); // totalWorkedHours
  });

  it('renders personal employee information card', async () => {
    renderComponent();

    expect(await screen.findByText('Nguyễn Văn Test')).toBeInTheDocument();
    expect(screen.getByText('DEMO-EMP-001')).toBeInTheDocument();
    expect(screen.getByText('test@dxos.local')).toBeInTheDocument();
    expect(screen.getByText('Phòng Kỹ thuật')).toBeInTheDocument();
    expect(screen.getByText('Chuyên viên Kỹ thuật')).toBeInTheDocument();
  });

  it('switches between month, week, and list views smoothly', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Default is Month view
    expect(await screen.findByText('Thứ Hai')).toBeInTheDocument();

    // Switch to List view
    await user.click(screen.getByRole('button', { name: /Danh sách/i }));
    expect(screen.getByRole('columnheader', { name: 'Ca làm việc' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Check-in' })).toBeInTheDocument();

    // Switch to Week view
    await user.click(screen.getByRole('button', { name: /Tuần này/i }));
    expect(screen.getByText('Lịch làm việc tuần hiện tại')).toBeInTheDocument();
  });

  it('renders error state when API fails and retries on button click', async () => {
    vi.mocked(getMySchedule).mockRejectedValueOnce(new Error('Mạng bị gián đoạn'));
    const user = userEvent.setup();
    renderComponent();

    expect(await screen.findByText(/Mạng bị gián đoạn/)).toBeInTheDocument();

    vi.mocked(getMySchedule).mockResolvedValueOnce(mockOverview);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Nguyễn Văn Test')).toBeInTheDocument();
  });
});

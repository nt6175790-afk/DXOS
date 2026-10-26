// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ReportsPage } from '@/features/reports/BaoCaoPhanTich';
import { ProtectedRoute } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/features/auth/DangNhap';
import { SsoCallback } from '@/features/auth/SsoCallback';
import { DashboardPage } from '@/features/dashboard/TongQuan';
import { DepartmentsPage } from '@/features/departments/QuanLyPhongBan';
import { PeoplePage } from '@/features/people/QuanLyNhanSu';
import { TasksPage } from '@/features/tasks/QuanLyCongViec';
import { TaskDetailPage } from '@/features/tasks/ChiTietCongViec';
import { NotificationsPage } from '@/features/notifications/TrungTamThongBao';
import { FilesPage } from '@/features/files/KhoTaiLieu';
import { AiAssistantPage } from '@/features/ai/TroLyAI';
import { SettingsPage } from '@/features/settings/CaiDatHeThong';
import { CalendarPage } from '@/features/calendar/LichSuKien';
import { LeavePage } from '@/features/leave/QuanLyNghiPhep';
import { AttendancePage } from '@/features/attendance/QuanLyChamCong';
import { ShiftsPage } from '@/features/shifts/QuanLyCaLamViec';
import { SchedulesPage } from '@/features/schedules/QuanLyPhanCa';
import { ApprovalsPage } from '@/features/approvals/QuanLyPheDuyet';
import { PayrollPage } from '@/features/payroll/QuanLyTienLuong';
import { PerformancePage } from '@/features/performance/QuanLyHieuSuat';
import { DocumentsPage } from '@/features/documents/QuanLyHoSo';
import { AutomationPage } from '@/features/automation/TuDongHoa';
import { WorkflowsPage } from '@/features/workflows/QuyTrinhLamViec';
import { LichDiLam as MySchedulePage } from '@/features/self-service/LichDiLam';

export const router = createBrowserRouter([
  { path: '/auth/sso/callback', element: <SsoCallback /> },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'my-schedule', element: <MySchedulePage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'departments', element: <DepartmentsPage /> },
      { path: 'people', element: <PeoplePage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'workflows', element: <WorkflowsPage /> },
      { path: 'automation', element: <AutomationPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'tasks/:taskId', element: <TaskDetailPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'leave', element: <LeavePage /> },
      { path: 'attendance', element: <AttendancePage /> },
      { path: 'shifts', element: <ShiftsPage /> },
      { path: 'schedules', element: <SchedulesPage /> },
      { path: 'approvals', element: <ApprovalsPage /> },
      { path: 'payroll', element: <PayrollPage /> },
      { path: 'performance', element: <PerformancePage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'files', element: <FilesPage /> },
      { path: 'ai', element: <AiAssistantPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
export type Metrics = Record<string, number | null>;
export interface ReportFilters {
  dateFrom: string; dateTo: string; interval: 'day' | 'week' | 'month'; departmentId?: string; employeeId?: string;
  employeeStatus?: 'ACTIVE' | 'INACTIVE'; attendanceStatus?: 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE' | 'INCOMPLETE';
  leaveStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  payrollStatus?: 'DRAFT' | 'PROCESSING' | 'CALCULATED' | 'PENDING_APPROVAL' | 'APPROVED' | 'FINALIZED' | 'CANCELLED';
}
export interface NumericReport { metrics: Metrics; trend: { bucket: string; metrics: Metrics }[] }
export interface MoneyGroup { currency: string; gross: string; net: string; averageNet: string | null; records: number; employees: number }
export interface PayrollReport { periods: number; records: number; employees: number; currencies: MoneyGroup[]; trend: { bucket: string; currencies: Omit<MoneyGroup, 'employees'>[] }[] }
export interface DepartmentReport { items: { id: string; name: string; status: string; workforce: Metrics; attendance: Metrics | null; leave: Metrics | null; payroll: MoneyGroup[] | null }[]; nextCursor: string | null }
export interface HrOverview {
  organizationId: string; generatedAt: string; timezone: string; filters: ReportFilters;
  workforce: NumericReport | null; attendance: NumericReport | null; leave: NumericReport | null; payroll: PayrollReport | null;
  departments: DepartmentReport | null; performance: { available: boolean; reason?: string; metrics?: Metrics };
}
export type ReportKind = 'workforce' | 'attendance' | 'leave' | 'payroll' | 'departments';
const base = (org: string) => `/organizations/${org}/reports`;
export const getHrOverview = async (org: string, params: ReportFilters) => (await api.get<HrOverview>(`${base(org)}/overview`, { params })).data;
export const getReportDepartments = async (org: string, params: ReportFilters, after: string) => (await api.get<DepartmentReport>(`${base(org)}/departments`, { params: { ...params, after } })).data;
export const exportReport = async (org: string, kind: ReportKind, params: ReportFilters) => (await api.get<Blob>(`${base(org)}/${kind}/export`, { params, responseType: 'blob' })).data;

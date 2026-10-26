// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
export type ReportKind = 'workforce' | 'attendance' | 'leave' | 'payroll' | 'departments';
export const REPORT_KINDS: readonly ReportKind[] = ['workforce', 'attendance', 'leave', 'payroll', 'departments'];
export type Counters = Record<string, number | null>;
export interface Trend { bucket: string; metrics: Counters }
export interface NumericReport { metrics: Counters; trend: Trend[] }
export interface MoneyGroup { currency: string; records: number; employees: number; gross: string; net: string; averageNet: string | null }
export interface PayrollReport { periods: number; records: number; employees: number; currencies: MoneyGroup[]; trend: { bucket: string; currencies: Omit<MoneyGroup, 'employees'>[] }[] }
export interface DepartmentReport { items: { id: string; name: string; status: string; workforce: Counters; attendance: Counters | null; leave: Counters | null; payroll: MoneyGroup[] | null }[]; nextCursor: string | null }
export interface PerformanceReport { available: boolean; reason?: 'integration_pending' | 'permission_denied'; metrics?: Counters }

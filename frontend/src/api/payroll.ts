// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  CompensationProfile,
  CreateCompensationRequest,
  CreatePayrollPeriodRequest,
  EmployeeCompensationSummary,
  FinalizePayrollRequest,
  PayrollPeriod,
  PayrollPeriodListParams,
  PayrollRecord,
  PayrollRecordListParams,
  RequestPayrollApprovalRequest,
  UpdateCompensationRequest,
} from './types';

export const compensationApi = {
  create: async (
    organizationId: string,
    employeeId: string,
    payload: CreateCompensationRequest,
  ): Promise<CompensationProfile> => {
    return api
      .post<CompensationProfile>(
        `/organizations/${organizationId}/employees/${employeeId}/compensation`,
        payload,
      )
      .then((res) => res.data);
  },

  getEmployeeCompensation: async (
    organizationId: string,
    employeeId: string,
  ): Promise<EmployeeCompensationSummary> => {
    return api
      .get<EmployeeCompensationSummary>(
        `/organizations/${organizationId}/employees/${employeeId}/compensation`,
      )
      .then((res) => res.data);
  },

  list: async (
    organizationId: string,
    params?: { employeeId?: string; isActive?: boolean },
  ): Promise<CompensationProfile[]> => {
    return api
      .get<CompensationProfile[]>(`/organizations/${organizationId}/compensation`, {
        params,
      })
      .then((res) => res.data);
  },

  update: async (
    organizationId: string,
    profileId: string,
    payload: UpdateCompensationRequest,
  ): Promise<CompensationProfile> => {
    return api
      .patch<CompensationProfile>(
        `/organizations/${organizationId}/compensation/${profileId}`,
        payload,
      )
      .then((res) => res.data);
  },
};

export const payrollApi = {
  createPeriod: async (
    organizationId: string,
    payload: CreatePayrollPeriodRequest,
  ): Promise<PayrollPeriod> => {
    return api
      .post<PayrollPeriod>(`/organizations/${organizationId}/payroll-periods`, payload)
      .then((res) => res.data);
  },

  listPeriods: async (
    organizationId: string,
    params?: PayrollPeriodListParams,
  ): Promise<PayrollPeriod[]> => {
    return api
      .get<PayrollPeriod[]>(`/organizations/${organizationId}/payroll-periods`, {
        params,
      })
      .then((res) => res.data);
  },

  getPeriod: async (organizationId: string, periodId: string): Promise<PayrollPeriod> => {
    return api
      .get<PayrollPeriod>(`/organizations/${organizationId}/payroll-periods/${periodId}`)
      .then((res) => res.data);
  },

  calculatePeriod: async (organizationId: string, periodId: string): Promise<PayrollPeriod> => {
    return api
      .post<PayrollPeriod>(
        `/organizations/${organizationId}/payroll-periods/${periodId}/calculate`,
        {},
      )
      .then((res) => res.data);
  },

  requestApproval: async (
    organizationId: string,
    periodId: string,
    payload?: RequestPayrollApprovalRequest,
  ): Promise<PayrollPeriod> => {
    return api
      .post<PayrollPeriod>(
        `/organizations/${organizationId}/payroll-periods/${periodId}/request-approval`,
        payload || {},
      )
      .then((res) => res.data);
  },

  finalizePeriod: async (
    organizationId: string,
    periodId: string,
    payload?: FinalizePayrollRequest,
  ): Promise<PayrollPeriod> => {
    return api
      .post<PayrollPeriod>(
        `/organizations/${organizationId}/payroll-periods/${periodId}/finalize`,
        payload || {},
      )
      .then((res) => res.data);
  },

  listRecords: async (
    organizationId: string,
    periodId: string,
    params?: PayrollRecordListParams,
  ): Promise<PayrollRecord[]> => {
    return api
      .get<PayrollRecord[]>(`/organizations/${organizationId}/payroll-periods/${periodId}/records`, {
        params,
      })
      .then((res) => res.data);
  },

  getRecord: async (organizationId: string, recordId: string): Promise<PayrollRecord> => {
    return api
      .get<PayrollRecord>(`/organizations/${organizationId}/payroll-records/${recordId}`)
      .then((res) => res.data);
  },

  getMyPayroll: async (organizationId: string): Promise<PayrollRecord[]> => {
    return api
      .get<PayrollRecord[]>(`/organizations/${organizationId}/me/payroll`)
      .then((res) => res.data);
  },
};

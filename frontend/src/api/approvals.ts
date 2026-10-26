// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  ApprovalListParams,
  ApprovalListPage,
  ApprovalRequest,
  ApprovalSummary,
  ApproveRequestPayload,
  CancelRequestPayload,
  CreateAttendanceAdjustmentRequest,
  RejectRequestPayload,
} from './types';

export const approvalsApi = {
  list: async (organizationId: string, params?: ApprovalListParams): Promise<ApprovalListPage> => {
    return api.get<ApprovalListPage>(`/organizations/${organizationId}/approvals`, {
      params,
    }).then((res) => res.data);
  },

  getSummary: async (organizationId: string): Promise<ApprovalSummary> => {
    return api.get<ApprovalSummary>(`/organizations/${organizationId}/approvals/summary`).then((res) => res.data);
  },

  getById: async (organizationId: string, approvalId: string): Promise<ApprovalRequest> => {
    return api.get<ApprovalRequest>(`/organizations/${organizationId}/approvals/${approvalId}`).then((res) => res.data);
  },

  createAttendanceAdjustment: async (
    organizationId: string,
    payload: CreateAttendanceAdjustmentRequest,
  ): Promise<ApprovalRequest> => {
    return api.post<ApprovalRequest>(`/organizations/${organizationId}/approvals/adjustment`, payload).then((res) => res.data);
  },

  approve: async (
    organizationId: string,
    approvalId: string,
    payload?: ApproveRequestPayload,
  ): Promise<ApprovalRequest> => {
    return api.post<ApprovalRequest>(`/organizations/${organizationId}/approvals/${approvalId}/approve`, payload ?? {}).then((res) => res.data);
  },

  reject: async (
    organizationId: string,
    approvalId: string,
    payload: RejectRequestPayload,
  ): Promise<ApprovalRequest> => {
    return api.post<ApprovalRequest>(`/organizations/${organizationId}/approvals/${approvalId}/reject`, payload).then((res) => res.data);
  },

  cancel: async (
    organizationId: string,
    approvalId: string,
    payload?: CancelRequestPayload,
  ): Promise<ApprovalRequest> => {
    return api.post<ApprovalRequest>(`/organizations/${organizationId}/approvals/${approvalId}/cancel`, payload ?? {}).then((res) => res.data);
  },
};

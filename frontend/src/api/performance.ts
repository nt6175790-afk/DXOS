// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type {
  CompleteReviewRequest,
  CreateGoalRequest,
  CreateKpiRequest,
  CreateReviewCycleRequest,
  CreateReviewRequest,
  EmployeePerformanceProfile,
  PerformanceCycleStatus,
  PerformanceDashboardSummary,
  PerformanceGoal,
  PerformanceKpi,
  PerformanceReview,
  PerformanceReviewCycle,
  PerformanceReviewStatus,
  SubmitManagerReviewRequest,
  SubmitSelfAssessmentRequest,
  UpdateGoalRequest,
  UpdateKpiRequest,
  UpdateReviewCycleRequest,
} from './types';

export const performanceApi = {
  // --- Cycles ---
  createCycle: async (
    organizationId: string,
    payload: CreateReviewCycleRequest,
  ): Promise<PerformanceReviewCycle> => {
    return api
      .post<PerformanceReviewCycle>(
        `/organizations/${organizationId}/performance-cycles`,
        payload,
      )
      .then((res) => res.data);
  },

  listCycles: async (
    organizationId: string,
    params?: { status?: PerformanceCycleStatus },
  ): Promise<PerformanceReviewCycle[]> => {
    return api
      .get<PerformanceReviewCycle[]>(
        `/organizations/${organizationId}/performance-cycles`,
        { params },
      )
      .then((res) => res.data);
  },

  getCycle: async (
    organizationId: string,
    cycleId: string,
  ): Promise<PerformanceReviewCycle> => {
    return api
      .get<PerformanceReviewCycle>(
        `/organizations/${organizationId}/performance-cycles/${cycleId}`,
      )
      .then((res) => res.data);
  },

  updateCycle: async (
    organizationId: string,
    cycleId: string,
    payload: UpdateReviewCycleRequest,
  ): Promise<PerformanceReviewCycle> => {
    return api
      .patch<PerformanceReviewCycle>(
        `/organizations/${organizationId}/performance-cycles/${cycleId}`,
        payload,
      )
      .then((res) => res.data);
  },

  // --- Goals ---
  createGoal: async (
    organizationId: string,
    payload: CreateGoalRequest,
  ): Promise<PerformanceGoal> => {
    return api
      .post<PerformanceGoal>(
        `/organizations/${organizationId}/performance-goals`,
        payload,
      )
      .then((res) => res.data);
  },

  listGoals: async (
    organizationId: string,
    params?: { cycleId?: string; employeeId?: string },
  ): Promise<PerformanceGoal[]> => {
    return api
      .get<PerformanceGoal[]>(
        `/organizations/${organizationId}/performance-goals`,
        { params },
      )
      .then((res) => res.data);
  },

  updateGoal: async (
    organizationId: string,
    goalId: string,
    payload: UpdateGoalRequest,
  ): Promise<PerformanceGoal> => {
    return api
      .patch<PerformanceGoal>(
        `/organizations/${organizationId}/performance-goals/${goalId}`,
        payload,
      )
      .then((res) => res.data);
  },

  // --- KPIs ---
  createKpi: async (
    organizationId: string,
    payload: CreateKpiRequest,
  ): Promise<PerformanceKpi> => {
    return api
      .post<PerformanceKpi>(
        `/organizations/${organizationId}/performance-kpis`,
        payload,
      )
      .then((res) => res.data);
  },

  listKpis: async (
    organizationId: string,
    params?: { cycleId?: string; employeeId?: string },
  ): Promise<PerformanceKpi[]> => {
    return api
      .get<PerformanceKpi[]>(
        `/organizations/${organizationId}/performance-kpis`,
        { params },
      )
      .then((res) => res.data);
  },

  updateKpi: async (
    organizationId: string,
    kpiId: string,
    payload: UpdateKpiRequest,
  ): Promise<PerformanceKpi> => {
    return api
      .patch<PerformanceKpi>(
        `/organizations/${organizationId}/performance-kpis/${kpiId}`,
        payload,
      )
      .then((res) => res.data);
  },

  // --- Reviews ---
  createReview: async (
    organizationId: string,
    payload: CreateReviewRequest,
  ): Promise<PerformanceReview> => {
    return api
      .post<PerformanceReview>(
        `/organizations/${organizationId}/performance-reviews`,
        payload,
      )
      .then((res) => res.data);
  },

  listReviews: async (
    organizationId: string,
    params?: {
      cycleId?: string;
      employeeId?: string;
      reviewerId?: string;
      status?: PerformanceReviewStatus;
      mine?: boolean;
    },
  ): Promise<PerformanceReview[]> => {
    return api
      .get<PerformanceReview[]>(
        `/organizations/${organizationId}/performance-reviews`,
        { params },
      )
      .then((res) => res.data);
  },

  getReview: async (
    organizationId: string,
    reviewId: string,
  ): Promise<PerformanceReview> => {
    return api
      .get<PerformanceReview>(
        `/organizations/${organizationId}/performance-reviews/${reviewId}`,
      )
      .then((res) => res.data);
  },

  submitSelfAssessment: async (
    organizationId: string,
    reviewId: string,
    payload: SubmitSelfAssessmentRequest,
  ): Promise<PerformanceReview> => {
    return api
      .post<PerformanceReview>(
        `/organizations/${organizationId}/performance-reviews/${reviewId}/self-assessment`,
        payload,
      )
      .then((res) => res.data);
  },

  submitManagerReview: async (
    organizationId: string,
    reviewId: string,
    payload: SubmitManagerReviewRequest,
  ): Promise<PerformanceReview> => {
    return api
      .post<PerformanceReview>(
        `/organizations/${organizationId}/performance-reviews/${reviewId}/manager-review`,
        payload,
      )
      .then((res) => res.data);
  },

  completeReview: async (
    organizationId: string,
    reviewId: string,
    payload: CompleteReviewRequest,
  ): Promise<PerformanceReview> => {
    return api
      .post<PerformanceReview>(
        `/organizations/${organizationId}/performance-reviews/${reviewId}/complete`,
        payload,
      )
      .then((res) => res.data);
  },

  cancelReview: async (
    organizationId: string,
    reviewId: string,
  ): Promise<PerformanceReview> => {
    return api
      .post<PerformanceReview>(
        `/organizations/${organizationId}/performance-reviews/${reviewId}/cancel`,
        {},
      )
      .then((res) => res.data);
  },

  // --- Dashboard & Profile ---
  getDashboardSummary: async (
    organizationId: string,
  ): Promise<PerformanceDashboardSummary> => {
    return api
      .get<PerformanceDashboardSummary>(
        `/organizations/${organizationId}/performance-dashboard`,
      )
      .then((res) => res.data);
  },

  getEmployeeProfile: async (
    organizationId: string,
    employeeId: string,
  ): Promise<EmployeePerformanceProfile> => {
    return api
      .get<EmployeePerformanceProfile>(
        `/organizations/${organizationId}/employees/${employeeId}/performance-profile`,
      )
      .then((res) => res.data);
  },
};

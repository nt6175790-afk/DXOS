// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { AiGenerateRequest, AiGenerateResponse, AiInsightsResponse } from './types';

export interface AiConfigResponse {
  provider: string;
  model: string;
  isConfigured: boolean;
}

export async function getAiConfig(orgId: string): Promise<AiConfigResponse> {
  const response = await api.get<AiConfigResponse>(`/organizations/${orgId}/ai/config`);
  return response.data;
}

export async function getAiInsights(orgId: string): Promise<AiInsightsResponse> {
  const response = await api.get<AiInsightsResponse>(`/organizations/${orgId}/ai/insights`);
  return response.data;
}

export async function generateAi(
  orgId: string,
  data: AiGenerateRequest
): Promise<AiGenerateResponse> {
  const response = await api.post<AiGenerateResponse>(
    `/organizations/${orgId}/ai/generate`,
    data
  );
  return response.data;
}

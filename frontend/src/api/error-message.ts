// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import axios from 'axios';
import { isApiError } from './client';

export function getErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && typeof error.error.message === 'string') return error.error.message;
  if (axios.isAxiosError<{ message?: unknown; error?: { message?: unknown } }>(error)) {
    const message = error.response?.data?.error?.message ?? error.response?.data?.message;
    if (typeof message === 'string' && message) return message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

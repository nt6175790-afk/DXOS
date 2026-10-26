// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Prisma } from '@prisma/client';
import { approvalProjection } from './approval.constants';

export type ApprovalRequestResponse = Prisma.ApprovalRequestGetPayload<{ select: typeof approvalProjection }>;

export interface LeavePayload {
  leaveRequestId: string;
  leaveType: string;
  startsAt: string;
  endsAt: string;
  daysCount: number;
}

export interface AttendanceAdjustmentPayload {
  workDate: string;
  targetCheckInAt: string;
  targetCheckOutAt?: string | null;
  shiftId?: string | null;
  originalCheckInAt?: string | null;
  originalCheckOutAt?: string | null;
}

export interface ApprovalSummaryResponse {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  myPendingCount: number;
}

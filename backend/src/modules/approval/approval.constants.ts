// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Prisma } from '@prisma/client';

export const approvalProjection = {
  id: true,
  organizationId: true,
  requesterId: true,
  type: true,
  status: true,
  title: true,
  reason: true,
  payload: true,
  reviewerId: true,
  reviewerNote: true,
  reviewedAt: true,
  referenceId: true,
  createdAt: true,
  updatedAt: true,
  requester: {
    select: {
      id: true,
      employeeCode: true,
      displayName: true,
      jobTitle: true,
      userId: true,
      departmentId: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  },
  reviewer: {
    select: {
      id: true,
      employeeCode: true,
      displayName: true,
      jobTitle: true,
      userId: true,
    },
  },
} satisfies Prisma.ApprovalRequestSelect;

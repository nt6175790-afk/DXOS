// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException } from '@nestjs/common';
import { isOrganizationIdentifier } from '../rbac/permission-catalog';

export const NOTIFICATION_TYPES = {
  ORGANIZATION_UPDATED: 'organization.updated',
  TASK_ASSIGNED: 'task.assigned',
  LEAVE_STATUS_CHANGED: 'leave.status_changed',
  SCHEDULE_UPDATED: 'schedule.updated',
  APPROVAL_STATUS_CHANGED: 'approval.status_changed',
  APPROVAL_NEW_REQUEST: 'approval.new_request',
  PAYROLL_STATUS_CHANGED: 'payroll.status_changed',
  PERFORMANCE_REVIEW_ASSIGNED: 'performance.review_assigned',
  PERFORMANCE_STATUS_CHANGED: 'performance.status_changed',
  DOCUMENT_EXPIRING_SOON: 'document.expiring_soon',
  DOCUMENT_EXPIRED: 'document.expired',
  AUTOMATION_TRIGGERED: 'automation.triggered',
  AUTOMATION_FAILED: 'automation.failed',
  WORKFLOW_WAITING_CONFIRMATION: 'workflow.waiting_confirmation',
  WORKFLOW_COMPLETED: 'workflow.completed',
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
export interface CreateNotification {
  organizationId: string;
  recipientUserId: string;
  type: NotificationType;
  metadata?: {
    changedFields?: ['name'];
    taskId?: string;
    leaveRequestId?: string;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    reason?: string;
    scheduleId?: string;
    message?: string;
    approvalRequestId?: string;
    approvalType?: string;
    title?: string;
    payrollPeriodId?: string;
    reviewId?: string;
    cycleId?: string;
    documentId?: string;
    documentTitle?: string;
    expiryDate?: string;
    ruleId?: string;
    workflowId?: string;
    workflowInstanceId?: string;
    stepName?: string;
  };
}

export function notificationContent(input: CreateNotification) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).some((key) => !['organizationId', 'recipientUserId', 'type', 'metadata'].includes(key)) ||
    !Object.values(NOTIFICATION_TYPES).includes(input.type)) throw new BadRequestException('Invalid notification');
  const metadata = (input.metadata ?? {}) as NonNullable<CreateNotification['metadata']>;
  if (input.type === NOTIFICATION_TYPES.TASK_ASSIGNED) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      Object.keys(metadata).some((key) => key !== 'taskId') || !isOrganizationIdentifier(metadata.taskId) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    return { title: 'Task assigned', body: 'A task was assigned to you.', metadata: { taskId: metadata.taskId } };
  }
  if (input.type === NOTIFICATION_TYPES.LEAVE_STATUS_CHANGED) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      !metadata.leaveRequestId || !isOrganizationIdentifier(metadata.leaveRequestId) ||
      !metadata.status || !['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(metadata.status) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    const statusText = metadata.status === 'APPROVED' ? 'đã được phê duyệt'
      : metadata.status === 'REJECTED' ? 'đã bị từ chối'
      : metadata.status === 'CANCELLED' ? 'đã bị hủy'
      : 'đang chờ phê duyệt';
    const title = `Đơn nghỉ phép: ${statusText}`;
    const body = metadata.status === 'REJECTED' && metadata.reason
      ? `Đơn nghỉ phép của bạn đã bị từ chối. Lý do: ${metadata.reason}`
      : `Đơn nghỉ phép của bạn ${statusText}.`;
    return {
      title,
      body,
      metadata: {
        leaveRequestId: metadata.leaveRequestId,
        status: metadata.status,
        ...(metadata.reason ? { reason: metadata.reason } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.SCHEDULE_UPDATED) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      (metadata.scheduleId && !isOrganizationIdentifier(metadata.scheduleId)) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    return {
      title: 'Lịch làm việc cập nhật',
      body: metadata.message || 'Lịch làm việc của bạn đã được cập nhật.',
      metadata: {
        ...(metadata.scheduleId ? { scheduleId: metadata.scheduleId } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.APPROVAL_STATUS_CHANGED) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      !metadata.approvalRequestId || !isOrganizationIdentifier(metadata.approvalRequestId) ||
      !metadata.status || !['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(metadata.status) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    const statusText = metadata.status === 'APPROVED' ? 'đã được phê duyệt'
      : metadata.status === 'REJECTED' ? 'đã bị từ chối'
      : metadata.status === 'CANCELLED' ? 'đã bị hủy'
      : 'đang chờ phê duyệt';
    const reqTitle = metadata.title || 'Yêu cầu';
    const title = `Phê duyệt: ${reqTitle} ${statusText}`;
    const body = metadata.status === 'REJECTED' && metadata.reason
      ? `${reqTitle} đã bị từ chối. Lý do: ${metadata.reason}`
      : `${reqTitle} ${statusText}.`;
    return {
      title,
      body,
      metadata: {
        approvalRequestId: metadata.approvalRequestId,
        status: metadata.status,
        ...(metadata.title ? { title: metadata.title } : {}),
        ...(metadata.reason ? { reason: metadata.reason } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.APPROVAL_NEW_REQUEST) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      !metadata.approvalRequestId || !isOrganizationIdentifier(metadata.approvalRequestId) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    return {
      title: 'Yêu cầu phê duyệt mới',
      body: metadata.message || `Có yêu cầu phê duyệt mới: ${metadata.title || ''}`,
      metadata: {
        approvalRequestId: metadata.approvalRequestId,
        ...(metadata.title ? { title: metadata.title } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.PAYROLL_STATUS_CHANGED) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      (metadata.payrollPeriodId && !isOrganizationIdentifier(metadata.payrollPeriodId)) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    return {
      title: 'Kỳ lương cập nhật',
      body: metadata.message || 'Kỳ lương đã thay đổi trạng thái.',
      metadata: {
        ...(metadata.payrollPeriodId ? { payrollPeriodId: metadata.payrollPeriodId } : {}),
        ...(metadata.status ? { status: metadata.status } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.PERFORMANCE_REVIEW_ASSIGNED) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      (metadata.reviewId && !isOrganizationIdentifier(metadata.reviewId)) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    return {
      title: 'Đánh giá hiệu suất mới',
      body: metadata.message || 'Bạn có nhiệm vụ đánh giá hiệu suất nhân viên mới.',
      metadata: {
        ...(metadata.reviewId ? { reviewId: metadata.reviewId } : {}),
        ...(metadata.cycleId ? { cycleId: metadata.cycleId } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.PERFORMANCE_STATUS_CHANGED) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      (metadata.reviewId && !isOrganizationIdentifier(metadata.reviewId)) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    return {
      title: 'Hiệu suất nhân viên cập nhật',
      body: metadata.message || 'Phiếu đánh giá hiệu suất đã thay đổi trạng thái.',
      metadata: {
        ...(metadata.reviewId ? { reviewId: metadata.reviewId } : {}),
        ...(metadata.status ? { status: metadata.status } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.DOCUMENT_EXPIRING_SOON) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      (metadata.documentId && !isOrganizationIdentifier(metadata.documentId)) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    return {
      title: 'Hồ sơ sắp hết hạn',
      body: metadata.message || `Hồ sơ ${metadata.documentTitle || ''} sắp hết hạn vào ngày ${metadata.expiryDate || ''}.`,
      metadata: {
        ...(metadata.documentId ? { documentId: metadata.documentId } : {}),
        ...(metadata.documentTitle ? { documentTitle: metadata.documentTitle } : {}),
        ...(metadata.expiryDate ? { expiryDate: metadata.expiryDate } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.DOCUMENT_EXPIRED) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      (metadata.documentId && !isOrganizationIdentifier(metadata.documentId)) ||
      Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
    return {
      title: 'Hồ sơ đã hết hạn',
      body: metadata.message || `Hồ sơ ${metadata.documentTitle || ''} đã hết hạn. Vui lòng cập nhật.`,
      metadata: {
        ...(metadata.documentId ? { documentId: metadata.documentId } : {}),
        ...(metadata.documentTitle ? { documentTitle: metadata.documentTitle } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.AUTOMATION_TRIGGERED) {
    return {
      title: metadata.title || 'Quy tắc tự động kích hoạt',
      body: metadata.message || 'Một quy tắc tự động đã được kích hoạt thành công.',
      metadata: {
        ...(metadata.ruleId ? { ruleId: metadata.ruleId } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.AUTOMATION_FAILED) {
    return {
      title: metadata.title || 'Lỗi thực thi tự động',
      body: metadata.message || 'Một quy tắc tự động đã gặp lỗi khi xử lý.',
      metadata: {
        ...(metadata.ruleId ? { ruleId: metadata.ruleId } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.WORKFLOW_WAITING_CONFIRMATION) {
    return {
      title: metadata.title || 'Quy trình cần xác nhận',
      body: metadata.message || 'Có bước quy trình đang chờ bạn phê duyệt/xác nhận.',
      metadata: {
        ...(metadata.workflowInstanceId ? { workflowInstanceId: metadata.workflowInstanceId } : {}),
        ...(metadata.stepName ? { stepName: metadata.stepName } : {}),
      },
    };
  }
  if (input.type === NOTIFICATION_TYPES.WORKFLOW_COMPLETED) {
    return {
      title: metadata.title || 'Quy trình hoàn tất',
      body: metadata.message || 'Quy trình đã hoàn thành thành công tất cả các bước.',
      metadata: {
        ...(metadata.workflowInstanceId ? { workflowInstanceId: metadata.workflowInstanceId } : {}),
      },
    };
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
    Object.keys(metadata).some((key) => key !== 'changedFields') ||
    (metadata.changedFields !== undefined && (!Array.isArray(metadata.changedFields) ||
      metadata.changedFields.length !== 1 || metadata.changedFields[0] !== 'name')) ||
    Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 1024) throw new BadRequestException('Invalid notification metadata');
  const title = 'Organization updated';
  const body = 'Your organization details were updated.';
  return { title, body, metadata: metadata.changedFields ? { changedFields: ['name'] } : {} };
}

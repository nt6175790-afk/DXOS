// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
const labels: Record<string, string> = {
  'calendar.event.created': 'Tạo sự kiện', 'calendar.event.updated': 'Cập nhật sự kiện',
  'task.created': 'Tạo công việc', 'task.updated': 'Cập nhật công việc', 'task.assigned': 'Phân công công việc',
  'task.status_changed': 'Đổi trạng thái công việc', 'task.comment.added': 'Thêm bình luận',
  'task.checklist.added': 'Thêm mục kiểm tra', 'task.checklist.updated': 'Cập nhật mục kiểm tra',
  'task.checklist.removed': 'Xóa mục kiểm tra', 'task.reviewer.changed': 'Đổi người kiểm tra',
  'task.attachment.linked': 'Gắn tài liệu vào công việc', 'task.attachment.unlinked': 'Gỡ tài liệu khỏi công việc',
  'employee.created': 'Thêm nhân sự', 'employee.updated': 'Cập nhật nhân sự',
  'department.created': 'Tạo phòng ban', 'department.updated': 'Cập nhật phòng ban',
  'file.uploaded': 'Tải tài liệu lên', 'file.deleted': 'Xóa tài liệu', 'notification.created': 'Gửi thông báo',
  'organization.created': 'Tạo tổ chức', 'organization.updated': 'Cập nhật tổ chức',
  'rbac.role.assigned': 'Gán vai trò', 'rbac.role.revoked': 'Thu hồi vai trò',
  'ai.request.started': 'Bắt đầu yêu cầu AI', 'ai.request.succeeded': 'Hoàn tất yêu cầu AI', 'ai.request.failed': 'Yêu cầu AI không thành công',
};
export const activityLabel = (event: string) => labels[event] ?? 'Hoạt động hệ thống';

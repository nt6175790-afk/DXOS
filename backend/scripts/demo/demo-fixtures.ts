// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { TaskPriority, TaskStatus } from '@prisma/client';

export const DEMO_ORGANIZATION_SLUG = 'dxos-demo';
export const DEMO_ADMIN_EMAIL = 'admin.demo@dxos.local';

// These IDs are private seed markers. Role IDs are always discovered from the DB/API.
export function demoId(organizationId: string, entity: string, key: string): string {
  const bytes = createHash('sha256').update(`DXOS-DEMO-002:v1:${organizationId}:${entity}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const DEMO_DEPARTMENTS = [
  { code: 'DEMO-DIR', name: 'Ban Giám đốc' },
  { code: 'DEMO-SALES', name: 'Phòng Kinh doanh' },
  { code: 'DEMO-TECH', name: 'Phòng Kỹ thuật' },
  { code: 'DEMO-HR', name: 'Phòng Nhân sự' },
  { code: 'DEMO-OPS', name: 'Phòng Kho vận' },
] as const;

export const DEMO_PEOPLE = [
  { key: 'admin', email: DEMO_ADMIN_EMAIL, name: 'DX-OS Demo Admin', department: 'DEMO-DIR', jobTitle: 'Quản trị demo', code: 'DEMO-EMP-001' },
  { key: 'an', email: 'an.demo@dxos.local', name: 'Nguyễn Văn An', department: 'DEMO-SALES', jobTitle: 'Chuyên viên kinh doanh', code: 'DEMO-EMP-002' },
  { key: 'anh', email: 'minh-anh.demo@dxos.local', name: 'Trần Minh Anh', department: 'DEMO-TECH', jobTitle: 'Kỹ sư phần mềm', code: 'DEMO-EMP-003' },
  { key: 'nam', email: 'hoang-nam.demo@dxos.local', name: 'Lê Hoàng Nam', department: 'DEMO-OPS', jobTitle: 'Chuyên viên kho vận', code: 'DEMO-EMP-004' },
  { key: 'ha', email: 'thu-ha.demo@dxos.local', name: 'Phạm Thu Hà', department: 'DEMO-HR', jobTitle: 'Chuyên viên nhân sự', code: 'DEMO-EMP-005' },
] as const;

export const DEMO_TASKS: ReadonlyArray<{
  code: string; title: string; assignee: (typeof DEMO_PEOPLE)[number]['key'];
  status: TaskStatus; priority: TaskPriority; dueDays: number; read: boolean;
}> = [
  { code: 'DEMO-TASK-001', title: 'Chuẩn bị báo cáo hoạt động tháng', assignee: 'an', status: 'TODO', priority: 'HIGH', dueDays: 3, read: false },
  { code: 'DEMO-TASK-002', title: 'Rà soát tài liệu kỹ thuật', assignee: 'anh', status: 'IN_PROGRESS', priority: 'URGENT', dueDays: 1, read: true },
  { code: 'DEMO-TASK-003', title: 'Kiểm tra danh mục tài liệu kho vận', assignee: 'nam', status: 'TODO', priority: 'MEDIUM', dueDays: 5, read: false },
  { code: 'DEMO-TASK-004', title: 'Chuẩn bị tài liệu cuộc họp', assignee: 'ha', status: 'DONE', priority: 'LOW', dueDays: -1, read: false },
  { code: 'DEMO-TASK-005', title: 'Hoàn thiện hướng dẫn sử dụng DX-OS', assignee: 'admin', status: 'IN_PROGRESS', priority: 'HIGH', dueDays: 7, read: true },
  { code: 'DEMO-TASK-006', title: 'Rà soát phân quyền thành viên', assignee: 'admin', status: 'TODO', priority: 'HIGH', dueDays: 2, read: false },
  { code: 'DEMO-TASK-007', title: 'Tổng hợp kế hoạch đào tạo', assignee: 'ha', status: 'DONE', priority: 'MEDIUM', dueDays: -3, read: true },
  { code: 'DEMO-TASK-008', title: 'Chuẩn bị phương án họp cũ', assignee: 'an', status: 'CANCELLED', priority: 'LOW', dueDays: -2, read: false },
];

export const DEMO_AI_REQUEST = {
  key: 'DEMO-AI-001',
  provider: 'mock',
  model: 'mock-v1',
  requestId: 'DXOS-DEMO-002-AI-001',
  inputTokens: 42,
  outputTokens: 96,
  latencyMs: 12,
} as const;

// Tiny, deterministic, valid single-page PDFs; ASCII filenames match the existing file policy.
export function demoPdf(title: string, lines: readonly string[]): Buffer {
  const escape = (text: string) => text.replace(/([\\()])/g, '\\$1');
  const text = ['DX-OS DEMO DATA - fictional examples', title, ...lines];
  const stream = `BT /F1 14 Tf 48 780 Td ${text.map((line, index) => `${index ? '0 -26 Td ' : ''}(${escape(line)}) Tj`).join('\n')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  result += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(result);
}

export const DEMO_DOCUMENTS = [
  { code: 'DEMO-DOC-001', filename: 'DEMO-001-DXOS-Guide.pdf', title: 'DX-OS demo guide', lines: [
    'Select DX-OS Demo Organization after signing in.',
    'Explore Departments, People, Tasks, Notifications and Files.',
    'Settings includes the real member and role catalog.',
    'Role assignments remain subject to backend authorization.',
  ] },
  { code: 'DEMO-DOC-002', filename: 'DEMO-002-People.pdf', title: 'Fictional demo personnel', lines: [
    'Nguyen Van An - Sales', 'Tran Minh Anh - Engineering',
    'Le Hoang Nam - Operations', 'Pham Thu Ha - Human Resources',
    'These names describe fictional demo records only.',
  ] },
  { code: 'DEMO-DOC-003', filename: 'DEMO-003-Task-Checklist.pdf', title: 'Task demonstration checklist', lines: [
    'Open a task detail and inspect its assignee and department.',
    'Filter TODO, IN_PROGRESS, DONE and CANCELLED tasks.',
    'Create tasks using the active demo admin Employee profile.',
    'AI Assistant uses the existing local mock-v1 provider.',
  ] },
] as const;

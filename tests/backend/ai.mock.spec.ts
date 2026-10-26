// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConfigService } from '@nestjs/config';
import { IsIn, IsOptional } from 'class-validator';
import { AiAgentService } from '../../backend/src/modules/ai/agent/ai-agent.service';
import type { AiChatInput } from '../../backend/src/modules/ai/ai-provider';
import { MockAiProvider, normalize } from '../../backend/src/modules/ai/mock-ai.provider';
import { AiToolRegistry } from '../../backend/src/modules/ai/tools/tool-registry';
import { objectSchema } from '../../backend/src/modules/ai/tools/tool.types';
import type { AiTool, ToolOutcome } from '../../backend/src/modules/ai/tools/tool.types';
import type { PermissionKey } from '../../backend/src/modules/rbac/permission-catalog';

const context = () => ({ requestId: 'r', signal: new AbortController().signal });
const TOOL_NAMES = ['list_departments', 'list_tasks', 'list_pending_approvals', 'list_document_alerts', 'get_my_schedule',
  'list_attendance_exceptions', 'list_leaves', 'list_calendar_events', 'get_hr_metrics', 'get_overview'];
const allTools = TOOL_NAMES.map((name) => ({ name, description: name, parameters: {} }));
const ask = (content: string, tools = allTools): AiChatInput =>
  ({ model: 'mock-v1', maxOutputTokens: 512, temperature: 0, tools, messages: [{ role: 'system', content: 's' }, { role: 'user', content }] });

describe('MockAiProvider intents', () => {
  const mock = new MockAiProvider();

  it.each([
    ['Công ty có bao nhiêu phòng ban?', 'list_departments', {}],
    ['Có việc nào đang quá hạn không?', 'list_tasks', { view: 'overdue' }],
    ['co viec nao qua han khong', 'list_tasks', { view: 'overdue' }],
    ['Tôi đang có những việc gì?', 'list_tasks', { view: 'mine' }],
    ['Việc nào sắp đến hạn?', 'list_tasks', { view: 'due_soon', withinDays: 7 }],
    ['Có đơn nào đang chờ duyệt không?', 'list_pending_approvals', {}],
    ['Ai còn thiếu hồ sơ bắt buộc?', 'list_document_alerts', { kind: 'missing' }],
    ['Hợp đồng nào sắp hết hạn?', 'list_document_alerts', { kind: 'expiring' }],
    ['Hôm nay tôi làm ca mấy giờ?', 'get_my_schedule', { period: 'today' }],
    ['Hôm qua tôi có đi trễ không?', 'get_my_schedule', { period: 'yesterday' }],
    ['Hôm qua ai đi trễ?', 'list_attendance_exceptions', { period: 'yesterday' }],
    ['Tuần sau ai nghỉ phép?', 'list_leaves', { period: 'next_week' }],
    ['Tuần này có cuộc họp nào?', 'list_calendar_events', { period: 'this_week' }],
    ['Tháng này có bao nhiêu nhân viên?', 'get_hr_metrics', { kind: 'workforce', period: 'this_month' }],
    ['Tình hình công ty hôm nay thế nào?', 'get_overview', {}],
  ])('"%s" → %s %j', async (question, tool, args) => {
    const result = await mock.chat(ask(question), context());
    expect(result).toMatchObject({ finishReason: 'tool_calls', text: '' });
    expect(result.toolCalls).toEqual([{ id: 'mock_' + tool, name: tool, arguments: JSON.stringify(args) }]);
  });

  it('greets, explains what it understands and never repeats "mock"', async () => {
    expect((await mock.chat(ask('Xin chào'), context())).text).toContain('Trợ lý AI DX-OS');
    // "em" addresses the assistant: answer as the assistant, in the "em – anh/chị" register, without tools.
    for (const q of ['em là ai', 'Em là ai?', 'em làm được gì', 'Chào em, em giúp được gì cho anh?']) {
      const reply = await mock.chat(ask(q), context());
      expect(reply.toolCalls).toEqual([]);
      expect(reply.text).toMatch(/^Chào anh\/chị! Em là Trợ lý AI DX-OS/);
    }
    expect((await mock.chat(ask('Bạn là ai?'), context())).text).toMatch(/Tôi là Trợ lý AI DX-OS/);
    const unknown = await mock.chat(ask('DO_NOT_PERSIST_THIS_PRIVATE_PROMPT'), context());
    expect(unknown).toMatchObject({ finishReason: 'stop', toolCalls: [] });
    expect(unknown.text).not.toMatch(/mockmock|DO_NOT_PERSIST/);
  });

  it('answers questions about the caller from the prompt\'s caller line, without a tool', async () => {
    const withCaller = (content: string, line: string): AiChatInput => ({ ...ask(content), messages: [
      { role: 'system', content: 'Bạn là "Trợ lý AI DX-OS"\n' + line + '\nQuy tắc' }, { role: 'user', content }] });
    const line = 'Người đang hỏi: "Nguyễn Văn An", mã nhân viên "E-002", chức danh "Chuyên viên kinh doanh", phòng ban "Phòng Kinh doanh".';
    for (const q of ['Tôi là ai?', 'Tôi làm phòng ban nào?', 'tôi thuộc phòng nào vậy', 'Chức danh của tôi là gì?', 'Mã nhân viên của mình là gì']) {
      const reply = await mock.chat(withCaller(q, line), context());
      expect(reply.toolCalls).toEqual([]);
      expect(reply.text).toBe('Bạn là Nguyễn Văn An, mã nhân viên E-002, chức danh Chuyên viên kinh doanh, phòng ban Phòng Kinh doanh.');
    }
    // A question about all departments still uses the tool.
    expect((await mock.chat(withCaller('Công ty có bao nhiêu phòng ban?', line), context())).toolCalls[0].name).toBe('list_departments');
  });

  it('does not call a tool the user may not use', async () => {
    const result = await mock.chat(ask('Có đơn nào chờ duyệt?', allTools.filter((t) => t.name !== 'list_pending_approvals')), context());
    expect(result).toMatchObject({ toolCalls: [], text: 'Bạn chưa có quyền tra cứu thông tin này qua trợ lý.' });
  });

  it('answers only from tool results: lists, counts, permission and scope notes', async () => {
    const reply = (name: string, data: object) => mock.chat({ ...ask('q'), messages: [
      { role: 'user', content: 'q' }, { role: 'assistant', content: '', toolCalls: [{ id: 'c', name, arguments: '{}' }] },
      { role: 'tool', toolCallId: 'c', content: JSON.stringify(data) }] }, context());
    expect((await reply('list_tasks', { status: 'OK', view: 'overdue', total: 2, truncated: false,
      items: [{ title: 'Báo cáo Q3', due: '20/10/2026 17:00', overdueDays: 4, assignee: 'Phạm Thu Hà' }] })).text)
      .toBe('Có 2 công việc quá hạn:\n- Báo cáo Q3 — hạn 20/10/2026 17:00 (trễ 4 ngày) — Phạm Thu Hà');
    expect((await reply('list_leaves', { status: 'EMPTY', visibility: 'ONLY_OWN_REQUESTS', total: 0 })).text).toContain('chỉ xem được dữ liệu của chính mình');
    expect((await reply('get_hr_metrics', { status: 'DENIED', requiredPermission: 'attendance:read' })).text).toContain('attendance:read');
    expect((await reply('list_tasks', { status: 'UNAVAILABLE' })).text).toBe('Tạm thời chưa tra cứu được dữ liệu này.');
  });

  it('normalizes Vietnamese diacritics including đ', () => {
    expect(normalize('ĐƠN CHỜ DUYỆT')).toBe('don cho duyet');
  });
});

class StatusArgs { @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ALL']) status?: string; }

describe('mock + agent end to end (offline demo, AC-9)', () => {
  it('runs the real loop: intent → tool → grounded answer with citations', async () => {
    const tool: AiTool<StatusArgs> = {
      name: 'list_departments', description: 'x', parameters: objectSchema({ status: { type: 'string' } }), argsType: StatusArgs,
      requiredPermissions: ['department:read'],
      execute: jest.fn(async (): Promise<ToolOutcome> => ({ status: 'OK', data: { total: 2, items: [
        { id: 'a', name: 'Kỹ thuật', activeEmployees: 3, openTasks: 1 }, { id: 'b', name: 'Nhân sự', activeEmployees: 2, openTasks: 0 }] },
      citations: [{ type: 'department', id: null, label: 'Danh sách phòng ban', href: '/departments' }] })),
    };
    const granted: PermissionKey[] = ['ai:use', 'department:read'];
    const authorization = { can: async (_u: string, p: PermissionKey) => granted.includes(p), effectivePermissions: async () => granted };
    const registry = new AiToolRegistry([tool] as AiTool[], authorization as never);
    const agent = new AiAgentService(new MockAiProvider(), registry, authorization as never,
      { organization: { findUnique: async () => ({ name: 'Demo' }) } } as never,
      new ConfigService({ app: { aiModel: 'mock-v1', aiAgentMaxSteps: 3, aiTimeoutMs: 5000 } }),
      { profileForAssistant: async () => ({ accountName: 'Demo User', employee: null }) } as never);
    const result = await agent.run({ userId: 'u', organizationId: 'o', requestId: 'r', messages: [{ role: 'user', content: 'Có bao nhiêu phòng ban?' }],
      maxOutputTokens: 512, temperature: 0, signal: new AbortController().signal });
    expect(result.text).toBe('Tổ chức có 2 phòng ban:\n- Kỹ thuật — 3 nhân viên, 1 việc đang mở\n- Nhân sự — 2 nhân viên, 0 việc đang mở');
    expect(result).toMatchObject({ finishReason: 'stop', steps: 2, toolCalls: 1, numericCheck: { status: 'PASS' },
      citations: [{ href: '/departments' }] });
  });
});

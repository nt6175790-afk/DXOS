// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type {
  AiChatInput, AiChatMessage, AiChatResult, AiProviderContext, AiProviderInput, AiProviderResult, AiToolCall,
} from './ai-provider';
import { AiProviderUnavailable, AiToolCallingProvider } from './ai-provider';

/**
 * Deterministic offline provider (CI, demo without a model). It recognises intents with keyword rules, calls the same
 * read-only tools as the real model, and writes the answer only from tool results — no canned figures (spec AC-9).
 */

type Json = Record<string, unknown>;
/** "tôi – bạn" by default; "em – anh/chị" when the user calls the assistant "em". */
function greeting(em: boolean): string {
  const [hello, self, you] = em ? ['Chào anh/chị!', 'Em', 'anh/chị'] : ['Xin chào!', 'Tôi', 'bạn'];
  return `${hello} ${self} là Trợ lý AI DX-OS (chế độ mô phỏng, không dùng model). ${self} có thể tra cứu công việc quá hạn, `
    + `đơn chờ duyệt, lịch làm và chấm công của ${you}, ai đi trễ hoặc nghỉ phép, giấy tờ sắp hết hạn, lịch họp, phòng ban và tình hình chung.`;
}
/** Questions about the caller ("tôi là ai", "tôi làm phòng nào"…), answered from the prompt's caller line, after normalize(). */
const ABOUT_CALLER = /\b(toi|minh) la ai\b|\b(phong|phong ban|chuc danh|chuc vu|ma nhan vien) (nao |gi )?cua (toi|minh)\b|\b(toi|minh)\b.*\b(phong nao|phong ban nao|thuoc phong|chuc danh|chuc vu|ma nhan vien)\b/;
/** Questions about the assistant itself ("bạn là ai", "em là ai", "em làm được gì"…), after normalize(). */
const ABOUT_ASSISTANT = /^\s*(xin )?chao\b|^\s*(hi|hello)\b|\b(ban|em|tro ly) la ai\b|\b(ban|em|tro ly) (lam|giup) duoc (gi|nhung gi)\b/;
const HELP = 'Chế độ mô phỏng chỉ hiểu một số câu hỏi mẫu, ví dụ: "Có việc nào quá hạn không?", "Có đơn nào chờ duyệt?", '
  + '"Hôm nay tôi làm ca mấy giờ?", "Tuần này ai nghỉ phép?", "Công ty có bao nhiêu phòng ban?".';
const NO_PERMISSION = 'Bạn chưa có quyền tra cứu thông tin này qua trợ lý.';

/** Lowercase without Vietnamese diacritics so "quá hạn", "qua han" and "QUÁ HẠN" match the same rule. */
export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

function period(q: string): string | undefined {
  if (/hom qua/.test(q)) return 'yesterday';
  if (/hom nay/.test(q)) return 'today';
  if (/ngay mai/.test(q)) return 'tomorrow';
  if (/tuan (sau|toi)/.test(q)) return 'next_week';
  if (/tuan truoc/.test(q)) return 'last_week';
  if (/tuan nay/.test(q)) return 'this_week';
  if (/thang truoc/.test(q)) return 'last_month';
  if (/thang sau|thang toi/.test(q)) return 'next_month';
  if (/thang nay/.test(q)) return 'this_month';
  return undefined;
}

/** Ordered intent rules: the first match wins. */
const INTENTS: { test: RegExp; tool: string; args: (q: string) => Json }[] = [
  { test: /phong ban/, tool: 'list_departments', args: () => ({}) },
  { test: /(toi|minh)\b.*\b(viec|task)|(viec|task).*\bcua toi\b/, tool: 'list_tasks', args: () => ({ view: 'mine' }) },
  { test: /qua han/, tool: 'list_tasks', args: () => ({ view: 'overdue' }) },
  { test: /(sap|den) han/, tool: 'list_tasks', args: () => ({ view: 'due_soon', withinDays: 7 }) },
  { test: /cho duyet|phe duyet|don nao/, tool: 'list_pending_approvals', args: () => ({}) },
  { test: /thieu ho so|ho so bat buoc|con thieu/, tool: 'list_document_alerts', args: () => ({ kind: 'missing' }) },
  { test: /het han/, tool: 'list_document_alerts', args: (q) => ({ kind: /da het han/.test(q) ? 'expired' : 'expiring' }) },
  { test: /(toi|minh)\b.*\b(ca|lich lam|di tre|cham cong|nghi)\b|ca may gio/, tool: 'get_my_schedule', args: (q) => ({ period: period(q) ?? 'this_week' }) },
  { test: /di tre|cham cong|check.?out|vang mat/, tool: 'list_attendance_exceptions', args: (q) => ({ period: period(q) ?? 'today' }) },
  { test: /nghi phep|ai nghi|xin nghi/, tool: 'list_leaves', args: (q) => ({ period: period(q) ?? 'this_week' }) },
  { test: /\bhop\b(?! dong)|su kien|lich hop/, tool: 'list_calendar_events', args: (q) => ({ period: period(q) ?? 'this_week' }) },
  { test: /bao nhieu nhan vien|so (luong )?nhan vien|nhan su/, tool: 'get_hr_metrics', args: (q) => ({ kind: 'workforce', period: period(q) ?? 'this_month' }) },
  { test: /tinh hinh|tong quan/, tool: 'get_overview', args: () => ({}) },
];

const ISSUE = { LATE: 'đi trễ', EARLY_LEAVE: 'về sớm', INCOMPLETE: 'chưa check-out', NOT_CHECKED_IN: 'chưa chấm công' } as Record<string, string>;
const lines = (items: unknown, render: (item: Json) => string, max = 10) =>
  (Array.isArray(items) ? items.slice(0, max) as Json[] : []).map((item) => '- ' + render(item)).join('\n');
const more = (data: Json, shown: unknown) => data.truncated === true && Array.isArray(shown)
  ? `\n(Chỉ liệt kê ${shown.length} trong tổng số ${String(data.total)}.)` : '';
const own = (data: Json) => data.visibility === 'ONLY_OWN_REQUESTS' ? ' Bạn chỉ xem được dữ liệu của chính mình.' : '';

/** Vietnamese answer built only from one tool result. */
function compose(tool: string, data: Json): string {
  if (data.status === 'DENIED') return `Bạn chưa có quyền xem thông tin này (cần quyền ${String(data.requiredPermission)}).`;
  if (data.status !== 'OK' && data.status !== 'EMPTY') return 'Tạm thời chưa tra cứu được dữ liệu này.';
  const empty = data.status === 'EMPTY';
  switch (tool) {
    case 'list_departments':
      return empty ? 'Tổ chức chưa có phòng ban nào.' : `Tổ chức có ${String(data.total)} phòng ban:\n` + lines(data.items, (d) =>
        `${String(d.name)}${d.activeEmployees !== null && d.activeEmployees !== undefined ? ` — ${String(d.activeEmployees)} nhân viên` : ''}`
        + `${d.openTasks !== null && d.openTasks !== undefined ? `, ${String(d.openTasks)} việc đang mở` : ''}`) + more(data, data.items);
    case 'list_tasks': {
      if (data.reason === 'NOT_AN_EMPLOYEE') return 'Tài khoản của bạn chưa gắn với hồ sơ nhân viên nên không có công việc được giao.';
      const label = data.view === 'overdue' ? 'quá hạn' : data.view === 'due_soon' ? 'sắp đến hạn' : data.view === 'mine' ? 'được giao cho bạn' : 'đang mở';
      if (empty) return `Không có công việc nào ${label}.`;
      return `Có ${String(data.total)} công việc ${label}:\n` + lines(data.items, (t) => `${String(t.title)}${t.due ? ` — hạn ${String(t.due)}` : ''}`
        + `${t.overdueDays !== undefined ? ` (trễ ${String(t.overdueDays)} ngày)` : t.overdueHours !== undefined ? ` (trễ ${String(t.overdueHours)} giờ)` : ''}`
        + `${t.assignee ? ` — ${String(t.assignee)}` : ''}`) + more(data, data.items);
    }
    case 'list_pending_approvals':
      return empty ? 'Không có đơn nào đang chờ duyệt.' + own(data) : `Có ${String(data.total)} đơn đang chờ duyệt:\n`
        + lines(data.items, (a) => `${String(a.title)} — ${String(a.requester)}`) + more(data, data.items) + own(data);
    case 'list_document_alerts':
      if (data.kind === 'missing') return empty ? 'Không có nhân viên nào thiếu hồ sơ bắt buộc.'
        : `Có ${String(data.total)} hồ sơ bắt buộc còn thiếu ở ${String(data.employeesAffected)} nhân viên:\n`
          + lines(data.items, (m) => `${String(m.employee)}: ${String(m.requirement)}`) + more(data, data.items);
      return empty ? (data.kind === 'expired' ? 'Không có giấy tờ nào đã hết hạn.' : 'Không có giấy tờ nào sắp hết hạn.')
        : `Có ${String(data.total)} giấy tờ ${data.kind === 'expired' ? 'đã hết hạn' : 'sắp hết hạn'}:\n`
          + lines(data.items, (d) => `${String(d.title)} — ${String(d.employee)} — hạn ${String(d.expiryDate)}`) + more(data, data.items)
          + (Number(data.hiddenSensitiveCount) > 0 ? `\nNgoài ra có ${String(data.hiddenSensitiveCount)} giấy tờ nhạy cảm bạn không xem được chi tiết.` : '');
    case 'get_my_schedule': {
      if (data.reason === 'NOT_AN_EMPLOYEE') return 'Tài khoản của bạn chưa gắn với hồ sơ nhân viên nên chưa có lịch làm.';
      const today = data.today as Json | null;
      const shift = today?.shift as Json | null | undefined;
      const summary = data.summary as Json | undefined;
      const parts = [today ? (today.isOff ? `Hôm nay (${String(today.date)}) bạn được nghỉ.`
        : shift ? `Hôm nay (${String(today.date)}) bạn làm ${String(shift.name)} từ ${String(shift.start)} đến ${String(shift.end)}.`
          : `Hôm nay (${String(today.date)}) bạn chưa có lịch làm.`) : ''];
      if (summary) parts.push(`Trong kỳ: ${String(summary.totalScheduledDays)} ngày có lịch, đi trễ ${String(summary.lateCount)} lần, `
        + `làm ${String(summary.totalWorkedHours)} giờ.`);
      return parts.filter(Boolean).join('\n');
    }
    case 'list_attendance_exceptions':
      return empty ? 'Không có trường hợp đi trễ, về sớm hay chưa chấm công nào trong khoảng thời gian này.'
        : `Có ${String(data.total)} trường hợp chấm công cần chú ý:\n` + lines(data.items, (r) => `${String(r.employee)} — ${String(r.date)} — `
          + (Array.isArray(r.issues) ? r.issues.map((i) => ISSUE[String(i)] ?? String(i)).join(', ') : '')
          + (r.lateMinutes ? ` (${String(r.lateMinutes)} phút)` : '')) + more(data, data.items);
    case 'list_leaves':
      return empty ? 'Không có đơn nghỉ phép nào trong khoảng thời gian này.' + own(data) : `Có ${String(data.total)} đơn nghỉ phép:\n`
        + lines(data.items, (l) => `${String(l.employee)} — từ ${String(l.from)} đến ${String(l.to)} (${String(l.status)})`) + more(data, data.items) + own(data);
    case 'list_calendar_events': {
      const events = Array.isArray(data.events) ? data.events : [];
      return empty ? 'Không có cuộc họp hay hạn công việc nào trong khoảng thời gian này.'
        : (events.length ? `Có ${events.length} cuộc họp/sự kiện:\n` + lines(events, (e) => `${String(e.title)} — ${String(e.starts)}`) : 'Không có cuộc họp nào.')
          + (Array.isArray(data.taskDeadlines) && data.taskDeadlines.length
            ? `\nHạn công việc:\n` + lines(data.taskDeadlines, (t) => `${String(t.title)} — ${String(t.due)}`) : '');
    }
    case 'get_hr_metrics': {
      const metrics = ((data.current as Json | null)?.metrics ?? {}) as Json;
      const entries = Object.entries(metrics).filter(([, v]) => typeof v === 'number');
      return entries.length ? 'Số liệu tổng hợp:\n' + entries.map(([k, v]) => `- ${k}: ${String(v)}`).join('\n') : 'Chưa có số liệu cho khoảng thời gian này.';
    }
    case 'get_overview': {
      const tasks = data.tasks as Json | null;
      const parts = [tasks ? `Công việc: ${String(tasks.open)} đang mở, ${String(tasks.overdue)} quá hạn, ${String(tasks.unassigned)} chưa giao.` : ''];
      if (data.employees) parts.push(`Nhân viên: ${String((data.employees as Json).active)} đang hoạt động.`);
      if (data.departments) parts.push(`Phòng ban: ${String((data.departments as Json).active)} đang hoạt động.`);
      parts.push(`Thông báo chưa đọc: ${String(data.unreadNotifications)}.`);
      return parts.filter(Boolean).join('\n');
    }
    default:
      return 'Đã tra cứu xong.';
  }
}

const tokens = (text: string) => Math.ceil(text.length / 4);

@Injectable()
export class MockAiProvider extends AiToolCallingProvider {
  /** Legacy single-call contract, kept for direct callers: a short deterministic text capped by maxOutputTokens. */
  async generateText(input: AiProviderInput, context: AiProviderContext): Promise<AiProviderResult> {
    if (context.signal.aborted) throw new AiProviderUnavailable();
    const outputTokens = Math.min(input.maxOutputTokens, 4);
    return {
      text: 'mock'.repeat(outputTokens),
      finishReason: outputTokens < 4 ? 'length' : 'stop',
      usage: { inputTokens: tokens(input.messages.map((m) => m.content).join('')), outputTokens },
    };
  }

  async chat(input: AiChatInput, context: AiProviderContext): Promise<AiChatResult> {
    if (context.signal.aborted) throw new AiProviderUnavailable();
    const inputTokens = tokens(input.messages.map((m) => m.content).join(''));
    const answer = (text: string): AiChatResult => ({ text, toolCalls: [], finishReason: 'stop', usage: { inputTokens, outputTokens: tokens(text) } });
    const last = input.messages[input.messages.length - 1];

    // Second step: tool results are back, write the answer from them.
    if (last?.role === 'tool') {
      const names = new Map<string, string>();
      for (const m of input.messages) if (m.role === 'assistant') for (const call of m.toolCalls ?? []) names.set(call.id, call.name);
      const results = trailingToolMessages(input.messages);
      return answer(results.map((m) => {
        try {
          return compose(names.get(m.toolCallId) ?? '', JSON.parse(m.content) as Json);
        } catch {
          return 'Tạm thời chưa tra cứu được dữ liệu này.';
        }
      }).join('\n\n'));
    }

    // First step: pick a tool from the question.
    const question = normalize(last?.role === 'user' ? last.content : '');
    if (ABOUT_ASSISTANT.test(question)) return answer(greeting(/\bem\b/.test(question)));
    if (ABOUT_CALLER.test(question)) {
      const system = input.messages.find((m) => m.role === 'system')?.content ?? '';
      const line = /^Người đang hỏi: (.+)$/m.exec(system)?.[1];
      return answer(line ? 'Bạn là ' + line.replace(/"/g, '') : 'Trợ lý không có thông tin về tài khoản của bạn.');
    }
    const intent = INTENTS.find((rule) => rule.test.test(question));
    if (!intent) return answer(HELP);
    if (!input.tools?.some((tool) => tool.name === intent.tool)) return answer(NO_PERMISSION);
    const call: AiToolCall = { id: 'mock_' + intent.tool, name: intent.tool, arguments: JSON.stringify(intent.args(question)) };
    return { text: '', toolCalls: [call], finishReason: 'tool_calls', usage: { inputTokens, outputTokens: 0 } };
  }
}

function trailingToolMessages(messages: AiChatMessage[]): Extract<AiChatMessage, { role: 'tool' }>[] {
  const result: Extract<AiChatMessage, { role: 'tool' }>[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'tool') break;
    result.unshift(m);
  }
  return result;
}

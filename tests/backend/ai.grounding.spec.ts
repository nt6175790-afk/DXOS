// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { numericCheck } from '../../backend/src/modules/ai/agent/grounding';
import { validatedAgentResult } from '../../backend/src/modules/ai/ai-validation';

const tool = (data: object) => JSON.stringify({ status: 'OK', ...data });

describe('numeric grounding check', () => {
  it('passes when every number comes from a tool result', () => {
    expect(numericCheck('Công ty có **5** phòng ban.', [tool({ total: 5 })], [])).toEqual({ status: 'PASS', unmatchedCount: 0 });
  });

  it('warns on numbers the request never saw', () => {
    expect(numericCheck('Có 7 phòng ban, 5 đang hoạt động.', [tool({ total: 5 })], [])).toEqual({ status: 'WARN', unmatchedCount: 1 });
  });

  it('reports only number presence, never semantic correctness of a claim', () => {
    // Ten tasks does not imply ten employees. The UI/API documentation must not present PASS as fact verification.
    expect(numericCheck('Có 10 nhân viên.', [tool({ tasks: 10 })], [])).toEqual({ status: 'PASS', unmatchedCount: 0 });
  });

  it.each([
    ['Vietnamese thousands', '1.284 nhân viên', { total: 1284 }],
    ['Vietnamese decimal comma', 'tỷ lệ 12,5%', { result: 12.5 }],
    ['rounded value', 'hoàn thành 28,6 %', { completionPercent: 28.571 }],
    ['date and time inside strings', 'hạn 24/10/2026 22:14', { due: '24/10/2026 22:14' }],
    ['numbers inside titles', 'task Báo cáo Q3 còn 2 việc', { title: 'Báo cáo Q3', total: 2 }],
    ['negative numbers shown as magnitudes', 'giảm 25%', { result: -25 }],
  ])('accepts %s', (_label, answer, data) => {
    expect(numericCheck(answer, [tool(data)], []).status).toBe('PASS');
  });

  it('ignores list numbering and codes', () => {
    expect(numericCheck('1. Rà soát hồ sơ\n2. Kiểm tra DEMO-EMP-001', [tool({ items: [] })], []).status).toBe('NOT_APPLICABLE');
  });

  it('accepts numbers the user or the system prompt (current date) provided', () => {
    expect(numericCheck('Trong 7 ngày tới không có việc nào.', [tool({ total: 0 })], ['Việc nào đến hạn trong 7 ngày tới?']).status).toBe('PASS');
    expect(numericCheck('Hôm nay là 25/10/2026.', [], ['Thời điểm hiện tại: Chủ nhật, 25/10/2026 09:00']).status).toBe('PASS');
  });

  it('is not applicable without numbers and survives non-JSON tool output', () => {
    expect(numericCheck('Không có việc nào quá hạn.', ['not json 3'], [])).toEqual({ status: 'NOT_APPLICABLE', unmatchedCount: 0 });
  });
});

describe('agent result validation', () => {
  const base = { text: 'ok', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 5000 } };

  it('keeps only citations to known internal routes and allows summed usage', () => {
    const result = validatedAgentResult({ ...base, numericCheck: { status: 'PASS', unmatchedCount: 0 }, citations: [
      { type: 'task', id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', label: 'Báo cáo Q3', href: '/tasks/7c9e6679-7425-40de-944b-e07fc1f90ae7' },
      { type: 'task', id: null, label: 'x', href: 'https://evil.example/phish' },
      { type: 'metric', id: null, label: 'Báo cáo', href: '/reports' },
      { type: 'unknown', id: null, label: 'x', href: '/reports' },
    ] });
    expect(result.citations?.map((c) => c.href)).toEqual(['/tasks/7c9e6679-7425-40de-944b-e07fc1f90ae7', '/reports']);
    expect(result.usage.outputTokens).toBe(5000);
    expect(result.numericCheck).toEqual({ status: 'PASS', unmatchedCount: 0 });
  });

  it('defaults a missing or malformed numeric check to NOT_APPLICABLE', () => {
    expect(validatedAgentResult({ ...base, numericCheck: { status: 'MAYBE' } }).numericCheck).toEqual({ status: 'NOT_APPLICABLE', unmatchedCount: 0 });
  });
});

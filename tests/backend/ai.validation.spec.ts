// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { getAppConfiguration } from '../../backend/src/config/environment';
import { GenerateAiDto } from '../../backend/src/modules/ai/ai.dto';
import { validatedAiInput, validatedAiResult } from '../../backend/src/modules/ai/ai-validation';
import { MockAiProvider } from '../../backend/src/modules/ai/mock-ai.provider';

describe('AI runtime and configuration boundaries', () => {
  it.each([{ AI_PROVIDER: 'vendor' }, { AI_MODEL: 'key-secret-value' }, { AI_TIMEOUT_MS: '0' }, { AI_TIMEOUT_MS: '30001' }, { AI_TIMEOUT_MS: '1.5' }])('rejects unsupported config without echoing it: %j', (input) => {
    expect(() => getAppConfiguration({ NODE_ENV: 'test', ...input })).toThrow('Invalid environment variable');
  });
  it('defaults to offline mock in tests and disabled in production', () => {
    expect(getAppConfiguration({ NODE_ENV: 'test' })).toMatchObject({ aiProvider: 'mock', aiModel: 'mock-v1', aiTimeoutMs: 5000 });
    expect(getAppConfiguration({ NODE_ENV: 'production', CORS_ORIGINS: 'https://example.test', DATABASE_URL: 'mysql://example:example@localhost/dx_os',
      JWT_ACCESS_SECRET: 'test-only-placeholder-long-enough-for-config', REDIS_URL: 'redis://localhost:6379' }).aiProvider).toBe('disabled');
  });
  it.each([null, {}, { messages: [] }, { messages: [{ role: 'system', content: 'secret' }] },
    { messages: [{ role: 'user', content: ' ' }] }, { messages: [{ role: 'user', content: 'x', secret: 'hidden' }] }])('rejects invalid internal input as well as HTTP DTO input', (input) => {
    expect(() => validatedAiInput(input as GenerateAiDto)).toThrow();
  });
  it.each([null, {}, { text: 'x', usage: { inputTokens: -1, outputTokens: 1 }, finishReason: 'stop' },
    { text: 'x'.repeat(8193), usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop' },
    { text: 'x', usage: { inputTokens: 1, outputTokens: 3 }, finishReason: 'stop' },
    { text: 'x', usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'tool_calls' },
    { text: 'x', usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop', apiKey: 'never forwarded' },
  ])('rejects untrusted provider payloads', (input) => { expect(() => validatedAiResult(input, 2)).toThrow(); });
  it('mock is deterministic, capped and does not echo input', async () => {
    const provider = new MockAiProvider(); const context = { requestId: 'test-request-id', signal: new AbortController().signal };
    const input = { model: 'mock-v1', messages: [{ role: 'user' as const, content: 'private prompt' }], temperature: 0, maxOutputTokens: 1 };
    const a = await provider.generateText(input, context); expect(await provider.generateText(input, context)).toEqual(a);
    expect(a).toMatchObject({ text: 'mock', finishReason: 'length', usage: { outputTokens: 1 } });
    expect(JSON.stringify(a)).not.toContain('private prompt');
  });
});

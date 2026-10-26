// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConfigService } from '@nestjs/config';
import { getAppConfiguration } from '../../backend/src/config/environment';
import type { AppConfiguration } from '../../backend/src/config/environment';
import { OpenAiProvider } from '../../backend/src/modules/ai/openai-ai.provider';
import type { AiProviderContext, AiProviderInput } from '../../backend/src/modules/ai/ai-provider';
import { AiProviderError, AiProviderLimit, AiProviderUnavailable } from '../../backend/src/modules/ai/ai-provider';

const input: AiProviderInput = {
  model: 'gpt-4o-mini',
  messages: [
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'previous answer' },
    { role: 'user', content: 'follow-up question' },
  ],
  maxOutputTokens: 32,
  temperature: 0.2,
};
const context = (): AiProviderContext => ({ requestId: 'request-id', signal: new AbortController().signal });

function provider(): OpenAiProvider {
  const app = { aiProvider: 'openai', aiModel: 'gpt-4o-mini', aiApiKey: 'k'.repeat(32) } as AppConfiguration;
  return new OpenAiProvider(new ConfigService({ app }));
}

describe('OpenAiProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('requires a key outside tests but permits keyless adapter tests', () => {
    expect(() => getAppConfiguration({ NODE_ENV: 'development', DATABASE_URL: `mysql://user:${'p'.repeat(8)}@localhost/dx_os`,
      JWT_ACCESS_SECRET: 'x'.repeat(32), AI_PROVIDER: 'openai', AI_MODEL: 'gpt-4o-mini' })).toThrow('AI_API_KEY');
    expect(getAppConfiguration({ NODE_ENV: 'test', AI_PROVIDER: 'openai', AI_MODEL: 'gpt-4o-mini' })).toMatchObject({
      aiProvider: 'openai', aiModel: 'gpt-4o-mini', aiApiKey: undefined,
    });
  });

  it('normalizes a successful multi-turn response without forwarding tools or system roles', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'real answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 17, completion_tokens: 4 },
    }), { status: 200 }));

    await expect(provider().generateText(input, context())).resolves.toEqual({
      text: 'real answer', finishReason: 'stop', usage: { inputTokens: 17, outputTokens: 4 },
    });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.messages).toEqual(input.messages);
    expect(request).not.toHaveProperty('tools');
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it.each([
    [429, AiProviderLimit], [408, AiProviderUnavailable], [500, AiProviderUnavailable], [400, AiProviderError],
  ])('maps provider HTTP status %s to a safe category', async (status, errorType) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('provider-sensitive-body', { status }));
    await expect(provider().generateText(input, context())).rejects.toBeInstanceOf(errorType);
    await expect(provider().generateText(input, context())).rejects.not.toThrow('provider-sensitive-body');
  });

  it('rejects malformed responses before any output is released', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'answer' }, finish_reason: 'tool_calls' }] }), { status: 200 }));
    await expect(provider().generateText(input, context())).rejects.toBeInstanceOf(AiProviderError);
  });

  it('normalizes transport failures as unavailable without exposing the underlying error', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private transport detail'));
    await expect(provider().generateText(input, context())).rejects.toBeInstanceOf(AiProviderUnavailable);
    await expect(provider().generateText(input, context())).rejects.not.toThrow('private transport detail');
  });

  it('fails closed when the OpenAI key is absent', async () => {
    const app = { aiProvider: 'openai', aiModel: 'gpt-4o-mini' } as AppConfiguration;
    const fetch = jest.spyOn(globalThis, 'fetch');
    await expect(new OpenAiProvider(new ConfigService({ app })).generateText(input, context())).rejects.toBeInstanceOf(AiProviderUnavailable);
    expect(fetch).not.toHaveBeenCalled();
  });
});

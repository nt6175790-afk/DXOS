import { ConfigService } from '@nestjs/config';
import { getAppConfiguration } from '../../backend/src/config/environment';
import type { AppConfiguration } from '../../backend/src/config/environment';
import { OpenAiCompatibleProvider } from '../../backend/src/modules/ai/providers/openai-compatible.provider';
import type { AiChatInput, AiProviderContext } from '../../backend/src/modules/ai/ai-provider';
import {
  AiProviderError, AiProviderLimit, AiProviderNotConfigured, AiProviderUnavailable, supportsToolCalling,
} from '../../backend/src/modules/ai/ai-provider';

const context = (): AiProviderContext => ({ requestId: 'request-id', signal: new AbortController().signal });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const usage = { prompt_tokens: 147, completion_tokens: 28 };

function provider(overrides: Partial<AppConfiguration> = {}): OpenAiCompatibleProvider {
  const app = {
    aiProvider: 'ollama', aiModel: 'gpt-oss:120b', aiBaseUrl: 'https://ollama.com/v1', aiApiKey: 'k'.repeat(40),
    aiReasoningEffort: 'low', ...overrides,
  } as AppConfiguration;
  return new OpenAiCompatibleProvider(new ConfigService({ app }));
}

const toolInput: AiChatInput = {
  model: 'gpt-oss:120b',
  maxOutputTokens: 512,
  temperature: 0,
  messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: 'Có bao nhiêu phòng ban?' }],
  tools: [{ name: 'list_departments', description: 'List departments', parameters: { type: 'object', properties: {} } }],
};

describe('open-weight AI configuration', () => {
  const base = { NODE_ENV: 'test' };

  it('defaults Ollama to the local OpenAI-compatible endpoint, gpt-oss and a longer timeout', () => {
    expect(getAppConfiguration({ ...base, AI_PROVIDER: 'ollama' })).toMatchObject({
      aiProvider: 'ollama', aiModel: 'gpt-oss:120b', aiBaseUrl: 'http://localhost:11434/v1', aiTimeoutMs: 30000,
      aiReasoningEffort: 'low', aiAgentMaxSteps: 3, aiAgentTotalTimeoutMs: 45000,
    });
  });

  it('accepts vLLM model ids with a slash and normalizes the base URL', () => {
    expect(getAppConfiguration({ ...base, AI_PROVIDER: 'vllm', AI_BASE_URL: 'http://llm:8000/v1/' })).toMatchObject({
      aiModel: 'openai/gpt-oss-120b', aiBaseUrl: 'http://llm:8000/v1',
    });
    expect(() => getAppConfiguration({ ...base, AI_PROVIDER: 'openai', AI_MODEL: 'openai/gpt-4o' })).toThrow('AI_MODEL');
  });

  it.each([
    { AI_PROVIDER: 'vllm' },
    { AI_PROVIDER: 'ollama', AI_BASE_URL: 'ftp://llm/v1' },
    { AI_PROVIDER: 'ollama', AI_BASE_URL: 'https://user:pass@ollama.com/v1' },
    { AI_PROVIDER: 'ollama', AI_BASE_URL: 'https://ollama.com/v1?target=x' },
    { AI_PROVIDER: 'ollama', AI_BASE_URL: 'not a url' },
    { AI_PROVIDER: 'ollama', AI_MODEL: '../escape' },
    { AI_PROVIDER: 'ollama', AI_REASONING_EFFORT: 'max' },
    { AI_PROVIDER: 'ollama', AI_AGENT_MAX_STEPS: '9' },
  ])('rejects unsafe open-weight configuration: %j', (input) => {
    expect(() => getAppConfiguration({ ...base, ...input })).toThrow('Invalid environment variable');
  });

  it('requires a key for Ollama Cloud outside tests but not for a self-hosted server', () => {
    const dev = { NODE_ENV: 'development', DATABASE_URL: `mysql://user:${'p'.repeat(8)}@localhost/dx_os`, JWT_ACCESS_SECRET: 'x'.repeat(32) };
    expect(() => getAppConfiguration({ ...dev, AI_PROVIDER: 'ollama', AI_BASE_URL: 'https://ollama.com/v1' })).toThrow('AI_API_KEY');
    expect(getAppConfiguration({ ...dev, AI_PROVIDER: 'ollama', AI_BASE_URL: 'http://localhost:11434/v1' }).aiApiKey).toBeUndefined();
  });
});

describe('OpenAiCompatibleProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('supports tool calling', () => {
    expect(supportsToolCalling(provider())).toBe(true);
  });

  it('sends tools in OpenAI format and parses tool calls without exposing reasoning', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: '', reasoning: 'PRIVATE_CHAIN_OF_THOUGHT',
          tool_calls: [{ id: 'call_olke6cmw', type: 'function', function: { name: 'list_departments', arguments: '{}' } }],
        },
      }],
      usage,
    }));

    const result = await provider().chat(toolInput, context());

    expect(result).toEqual({
      text: '', finishReason: 'tool_calls', usage: { inputTokens: 147, outputTokens: 28 },
      toolCalls: [{ id: 'call_olke6cmw', name: 'list_departments', arguments: '{}' }],
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CHAIN_OF_THOUGHT');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://ollama.com/v1/chat/completions');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${'k'.repeat(40)}`);
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: 'gpt-oss:120b', reasoning_effort: 'low', stream: false, max_tokens: 512 });
    expect(body.tools).toEqual([{ type: 'function', function: toolInput.tools![0] }]);
  });

  it('round-trips assistant tool calls and tool results in OpenAI format', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok({
      choices: [{ finish_reason: 'stop', message: { content: 'Công ty có **6 phòng ban**.' } }], usage,
    }));
    const call = { id: 'call_1', name: 'list_departments', arguments: '{}' };

    const result = await provider().chat({
      ...toolInput,
      messages: [
        ...toolInput.messages,
        { role: 'assistant', content: '', toolCalls: [call] },
        { role: 'tool', toolCallId: 'call_1', content: '{"status":"OK","total":6}' },
      ],
    }, context());

    expect(result).toMatchObject({ text: 'Công ty có **6 phòng ban**.', finishReason: 'stop', toolCalls: [] });
    const messages = JSON.parse(String(fetch.mock.calls[0][1]?.body)).messages;
    expect(messages.slice(2)).toEqual([
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list_departments', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: '{"status":"OK","total":6}' },
    ]);
  });

  it('accepts object arguments and treats tool calls with finish_reason=stop as tool calls', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok({
      choices: [{ finish_reason: 'stop', message: { content: null, tool_calls: [{ function: { name: 'list_tasks', arguments: { view: 'overdue' } } }] } }],
      usage,
    }));
    await expect(provider().chat(toolInput, context())).resolves.toMatchObject({
      finishReason: 'tool_calls', toolCalls: [{ id: 'call_0', name: 'list_tasks', arguments: '{"view":"overdue"}' }],
    });
  });

  it('omits the Authorization header for a keyless self-hosted server', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ choices: [{ finish_reason: 'stop', message: { content: 'xin chào' } }], usage }));
    await provider({ aiProvider: 'vllm', aiBaseUrl: 'http://llm:8000/v1', aiApiKey: undefined }).chat(toolInput, context());
    expect(fetch.mock.calls[0][0]).toBe('http://llm:8000/v1/chat/completions');
    expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
  });

  it('generates plain text for the legacy path with the system prompt first and no tools', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ choices: [{ finish_reason: 'stop', message: { content: ' trả lời ' } }], usage }));
    await expect(provider().generateText({
      model: 'gpt-oss:120b', maxOutputTokens: 64, temperature: 0, systemPrompt: 'context',
      messages: [{ role: 'user', content: 'hỏi' }],
    }, context())).resolves.toEqual({ text: 'trả lời', finishReason: 'stop', usage: { inputTokens: 147, outputTokens: 28 } });
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.messages).toEqual([{ role: 'system', content: 'context' }, { role: 'user', content: 'hỏi' }]);
    expect(body).not.toHaveProperty('tools');
  });

  it('rejects tool calls on the legacy text path', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok({
      choices: [{ finish_reason: 'tool_calls', message: { content: '', tool_calls: [{ id: 'c', function: { name: 'x_tool', arguments: '{}' } }] } }], usage,
    }));
    await expect(provider().generateText({ model: 'm', maxOutputTokens: 8, temperature: 0, messages: [{ role: 'user', content: 'q' }] }, context()))
      .rejects.toBeInstanceOf(AiProviderError);
  });

  it.each([
    [401, AiProviderNotConfigured], [403, AiProviderNotConfigured], [429, AiProviderLimit],
    [408, AiProviderUnavailable], [503, AiProviderUnavailable], [400, AiProviderError],
  ])('maps HTTP %s to a safe category without leaking the body', async (status, errorType) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('provider-sensitive-body', { status }));
    const attempt = provider().chat(toolInput, context());
    await expect(attempt).rejects.toBeInstanceOf(errorType);
    await expect(attempt).rejects.not.toThrow('provider-sensitive-body');
  });

  it('maps network failures and aborts to unavailable', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(provider().chat(toolInput, context())).rejects.toBeInstanceOf(AiProviderUnavailable);
  });

  it('fails closed when no base URL is configured', async () => {
    await expect(provider({ aiBaseUrl: undefined }).chat(toolInput, context())).rejects.toBeInstanceOf(AiProviderNotConfigured);
  });

  it.each([
    ['non-JSON body', new Response('<html>', { status: 200 })],
    ['missing usage', ok({ choices: [{ finish_reason: 'stop', message: { content: 'x' } }] })],
    ['unknown finish reason', ok({ choices: [{ finish_reason: 'content_filter', message: { content: 'x' } }], usage })],
    ['tool_calls without calls', ok({ choices: [{ finish_reason: 'tool_calls', message: { content: '' } }], usage })],
    ['invalid tool name', ok({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'c', function: { name: 'Drop Table', arguments: '{}' } }] } }], usage })],
    ['too many tool calls', ok({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, function: { name: 'list_tasks', arguments: '{}' } })) } }], usage })],
    ['oversized arguments', ok({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'c', function: { name: 'list_tasks', arguments: 'x'.repeat(8001) } }] } }], usage })],
  ])('rejects malformed responses: %s', async (_label, response) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(provider().chat(toolInput, context())).rejects.toBeInstanceOf(AiProviderError);
  });
});

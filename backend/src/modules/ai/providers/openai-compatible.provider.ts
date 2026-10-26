// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../../../config/environment';
import {
  AiChatInput,
  AiChatMessage,
  AiChatResult,
  AiProviderContext,
  AiProviderError,
  AiProviderInput,
  AiProviderLimit,
  AiProviderNotConfigured,
  AiProviderResult,
  AiProviderUnavailable,
  AiToolCall,
  AiToolCallingProvider,
} from '../ai-provider';
import { AI_LIMITS, AI_TOOL_NAME } from '../ai-policy';

const TOOL_CALL_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** OpenAI Chat Completions wire format. Reasoning fields are never sent back to the server. */
function toWireMessage(message: AiChatMessage): Record<string, unknown> {
  switch (message.role) {
    case 'assistant':
      return message.toolCalls?.length
        ? {
          role: 'assistant',
          content: message.content,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments },
          })),
        }
        : { role: 'assistant', content: message.content };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
    default:
      return { role: message.role, content: message.content };
  }
}

function parseToolCalls(value: unknown): AiToolCall[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > AI_LIMITS.toolCalls) throw new AiProviderError();
  return value.map((item, index) => {
    if (!isRecord(item) || !isRecord(item.function)) throw new AiProviderError();
    const name = item.function.name;
    const rawArguments = item.function.arguments ?? '{}';
    // Ollama and vLLM send arguments as a JSON string; some servers send an object.
    const args = typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments);
    if (typeof name !== 'string' || !AI_TOOL_NAME.test(name) || typeof args !== 'string' || args.length > AI_LIMITS.toolArgumentChars) {
      throw new AiProviderError();
    }
    const id = typeof item.id === 'string' && TOOL_CALL_ID.test(item.id) ? item.id : `call_${index}`;
    return { id, name, arguments: args };
  });
}

/**
 * Adapter for open-weight models behind an OpenAI-compatible server (Ollama, vLLM).
 * `chat` serves the agent loop; `generateText` fulfils the base AiProvider contract with one call without tools.
 */
@Injectable()
export class OpenAiCompatibleProvider extends AiToolCallingProvider {
  constructor(private readonly config: ConfigService) { super(); }

  async generateText(input: AiProviderInput, context: AiProviderContext): Promise<AiProviderResult> {
    const messages: AiChatMessage[] = [
      ...(input.systemPrompt ? [{ role: 'system' as const, content: input.systemPrompt }] : []),
      ...input.messages.map((m) => ({ role: m.role, content: m.content }) as AiChatMessage),
    ];
    const result = await this.chat(
      { model: input.model, messages, maxOutputTokens: input.maxOutputTokens, temperature: input.temperature },
      context,
    );
    if (result.toolCalls.length || result.finishReason === 'tool_calls' || !result.text.length) throw new AiProviderError();
    return { text: result.text, finishReason: result.finishReason, usage: result.usage };
  }

  async chat(input: AiChatInput, context: AiProviderContext): Promise<AiChatResult> {
    const app = this.config.getOrThrow<AppConfiguration>('app');
    if (!app.aiBaseUrl) throw new AiProviderNotConfigured();

    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.messages.map(toWireMessage),
      max_tokens: input.maxOutputTokens,
      temperature: input.temperature,
      reasoning_effort: app.aiReasoningEffort,
      stream: false,
    };
    if (input.tools?.length) {
      body.tools = input.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (app.aiApiKey) headers.Authorization = `Bearer ${app.aiApiKey}`;

    let response: Response;
    try {
      response = await fetch(`${app.aiBaseUrl}/chat/completions`, {
        method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: context.signal,
      });
    } catch {
      throw new AiProviderUnavailable();
    }

    if (response.status === 401 || response.status === 403) throw new AiProviderNotConfigured();
    if (response.status === 429) throw new AiProviderLimit();
    if (response.status === 408 || response.status >= 500) throw new AiProviderUnavailable();
    if (!response.ok) throw new AiProviderError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AiProviderError();
    }
    if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length < 1 || !isRecord(payload.usage)) {
      throw new AiProviderError();
    }
    const choice = payload.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) throw new AiProviderError();
    // Only `content` and `tool_calls` are read; `reasoning`/`reasoning_content`/`thinking` are dropped here (AC-13).
    const content = choice.message.content ?? '';
    if (typeof content !== 'string' || content.length > AI_LIMITS.chatTextChars) throw new AiProviderError();
    const toolCalls = parseToolCalls(choice.message.tool_calls);
    const finishReason = toolCalls.length ? 'tool_calls' : choice.finish_reason;
    if (finishReason !== 'stop' && finishReason !== 'length' && finishReason !== 'tool_calls') throw new AiProviderError();
    if (finishReason === 'tool_calls' && !toolCalls.length) throw new AiProviderError();
    const usage = payload.usage;
    if (!isSafeCount(usage.prompt_tokens) || !isSafeCount(usage.completion_tokens)) throw new AiProviderError();

    return {
      text: content.trim(),
      toolCalls,
      finishReason,
      usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
    };
  }
}

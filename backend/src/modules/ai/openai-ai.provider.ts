// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../../config/environment';
import {
  AiProvider,
  AiProviderError,
  AiProviderLimit,
  AiProviderNotConfigured,
  AiProviderResult,
  AiProviderUnavailable,
} from './ai-provider';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

@Injectable()
export class OpenAiProvider extends AiProvider {
  constructor(private readonly config: ConfigService) { super(); }

  async generateText(input: Parameters<AiProvider['generateText']>[0], context: Parameters<AiProvider['generateText']>[1]): Promise<AiProviderResult> {
    const app = this.config.getOrThrow<AppConfiguration>('app');
    if (!app.aiApiKey) throw new AiProviderNotConfigured();

    const messages = input.systemPrompt
      ? [{ role: 'system', content: input.systemPrompt }, ...input.messages]
      : input.messages;

    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${app.aiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: input.model,
          messages,
          max_completion_tokens: input.maxOutputTokens,
          temperature: input.temperature,
        }),
        signal: context.signal,
      });
    } catch (error) {
      if (context.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new AiProviderUnavailable();
      }
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
    if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== 'string' || !choice.message.content.length) {
      throw new AiProviderError();
    }
    if (choice.finish_reason !== 'stop' && choice.finish_reason !== 'length') throw new AiProviderError();
    const usage = payload.usage;
    if (!isSafeCount(usage.prompt_tokens) || !isSafeCount(usage.completion_tokens)) throw new AiProviderError();
    return {
      text: choice.message.content,
      finishReason: choice.finish_reason,
      usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
    };
  }
}

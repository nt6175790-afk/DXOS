// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { AiMessageDto } from './ai.dto';

export interface AiProviderInput {
  messages: AiMessageDto[];
  model: string;
  maxOutputTokens: number;
  temperature: number;
  systemPrompt?: string;
}
export interface AiProviderContext { requestId: string; signal: AbortSignal }
export interface AiProviderResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'length';
}
export abstract class AiProvider {
  abstract generateText(input: AiProviderInput, context: AiProviderContext): Promise<AiProviderResult>;
}

/** A function the model may call. `parameters` is a JSON Schema object sent to the model as-is. */
export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
/** A tool call requested by the model. `arguments` is untrusted JSON text and must be validated before use. */
export interface AiToolCall { id: string; name: string; arguments: string }
export type AiChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AiToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };
export interface AiChatInput {
  model: string;
  messages: AiChatMessage[];
  tools?: AiToolDefinition[];
  maxOutputTokens: number;
  temperature: number;
}
/** Model reasoning is never part of this result; adapters drop it. */
export interface AiChatResult {
  text: string;
  toolCalls: AiToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls';
  usage: { inputTokens: number; outputTokens: number };
}
/** Providers that can run the agent loop (tool calling). */
export abstract class AiToolCallingProvider extends AiProvider {
  abstract chat(input: AiChatInput, context: AiProviderContext): Promise<AiChatResult>;
}
export function supportsToolCalling(provider: AiProvider): provider is AiToolCallingProvider {
  return typeof (provider as Partial<AiToolCallingProvider>).chat === 'function';
}

export class AiProviderUnavailable extends Error {}
export class AiProviderLimit extends Error {}
export class AiProviderError extends Error {}
export class AiProviderNotConfigured extends AiProviderUnavailable {}

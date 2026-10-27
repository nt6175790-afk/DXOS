// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ApiErrorException } from '../../common/errors/api-error.exception';
import { GenerateAiDto } from './ai.dto';
import type { NumericCheck } from './agent/grounding';
import { AI_LIMITS } from './ai-policy';
import { AiProviderError } from './ai-provider';
import type { AiChatResult, AiProviderResult } from './ai-provider';
import { AI_CITATION_TYPES, MAX_CITATIONS, type AiCitation } from './tools/tool.types';

export function validatedAiInput(input: GenerateAiDto): GenerateAiDto {
  const invalid = () => { throw new ApiErrorException(400, 'AI_INVALID_REQUEST', 'Invalid AI request.'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const dto = plainToInstance(GenerateAiDto, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }).length) invalid();
  const content = dto.messages.map((m) => m.content).join('');
  if (content.length > AI_LIMITS.totalChars || Buffer.byteLength(content, 'utf8') > AI_LIMITS.inputBytes ||
    (dto.metadata !== undefined && (dto.metadata === null || Buffer.byteLength(JSON.stringify(dto.metadata), 'utf8') > AI_LIMITS.metadataBytes))) invalid();
  return dto;
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const isCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= AI_LIMITS.usageCount;
export function validatedAiResult(result: unknown, outputCap: number): AiProviderResult {
  const invalid = () => { throw new Error('Invalid normalized provider response'); };
  if (!record(result)) return invalid();
  if (Object.keys(result).some((key) => !['text', 'usage', 'finishReason'].includes(key)) ||
    typeof result.text !== 'string' || !result.text.length || result.text.length > AI_LIMITS.outputChars ||
    !['stop', 'length'].includes(result.finishReason as string) || !record(result.usage)) return invalid();
  const usage = result.usage;
  if (Object.keys(usage).some((key) => !['inputTokens', 'outputTokens'].includes(key)) ||
    !Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens) ||
    (usage.inputTokens as number) < 0 || (usage.inputTokens as number) > AI_LIMITS.usageCount ||
    (usage.outputTokens as number) < 0 || (usage.outputTokens as number) > outputCap) return invalid();
  return { text: result.text, finishReason: result.finishReason as 'stop' | 'length',
    usage: { inputTokens: usage.inputTokens as number, outputTokens: usage.outputTokens as number } };
}

/** Internal routes a citation may link to (frontend router). Anything else is dropped. */
const CITATION_ROUTE = /^\/(?:tasks\/[0-9a-f-]{36}|tasks|approvals|leave|documents|people|departments|calendar|attendance|my-schedule|reports|dashboard|files)$/;
const CITATION_TYPES: readonly string[] = AI_CITATION_TYPES;

export interface GenerationResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'length' | 'tool_limit';
  citations?: AiCitation[];
  numericCheck?: NumericCheck;
}

function validCitations(value: unknown): AiCitation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c): c is AiCitation => record(c) && typeof c.type === 'string' && CITATION_TYPES.includes(c.type) &&
    (c.id === null || (typeof c.id === 'string' && /^[0-9a-f-]{36}$/.test(c.id))) &&
    typeof c.label === 'string' && c.label.length > 0 && c.label.length <= 120 &&
    typeof c.href === 'string' && CITATION_ROUTE.test(c.href)).slice(0, MAX_CITATIONS)
    .map((c) => ({ type: c.type, id: c.id, label: c.label, href: c.href }));
}

/**
 * Agent results sum usage over several model calls, so the per-call output cap does not apply;
 * text size, finish reason and counters are still bounded before anything is released.
 */
export function validatedAgentResult(result: unknown): GenerationResult {
  const invalid = () => { throw new Error('Invalid agent result'); };
  if (!record(result) || typeof result.text !== 'string' || !result.text.length || result.text.length > AI_LIMITS.outputChars ||
    !['stop', 'length', 'tool_limit'].includes(result.finishReason as string) || !record(result.usage)) return invalid();
  const usage = result.usage;
  if (!isCount(usage.inputTokens) || !isCount(usage.outputTokens)) return invalid();
  const check: NumericCheck = record(result.numericCheck) && ['PASS', 'WARN', 'NOT_APPLICABLE'].includes(result.numericCheck.status as string) &&
    isCount(result.numericCheck.unmatchedCount)
    ? { status: result.numericCheck.status as NumericCheck['status'], unmatchedCount: result.numericCheck.unmatchedCount as number }
    : { status: 'NOT_APPLICABLE', unmatchedCount: 0 };
  return { text: result.text, finishReason: result.finishReason as GenerationResult['finishReason'],
    usage: { inputTokens: usage.inputTokens as number, outputTokens: usage.outputTokens as number },
    citations: validCitations(result.citations), numericCheck: check };
}

/**
 * Strict check of one tool-calling provider response before the agent uses it: only known keys and bounded values.
 * Unknown fields (e.g. raw vendor payloads) fail the call, like `validatedAiResult` on the legacy path.
 */
export function validatedChatResult(result: unknown): AiChatResult {
  const invalid = (): never => { throw new AiProviderError(); };
  if (!record(result) || Object.keys(result).some((k) => !['text', 'toolCalls', 'finishReason', 'usage'].includes(k)) ||
    typeof result.text !== 'string' || result.text.length > AI_LIMITS.chatTextChars ||
    !Array.isArray(result.toolCalls) || result.toolCalls.length > AI_LIMITS.toolCalls ||
    !['stop', 'length', 'tool_calls'].includes(result.finishReason as string) || !record(result.usage) ||
    Object.keys(result.usage).some((k) => !['inputTokens', 'outputTokens'].includes(k))) return invalid();
  const usage = result.usage as Record<string, unknown>;
  if (!isCount(usage.inputTokens) || !isCount(usage.outputTokens)) return invalid();
  const toolCalls = (result.toolCalls as unknown[]).map((call) => {
    if (!record(call) || Object.keys(call).some((k) => !['id', 'name', 'arguments'].includes(k)) || typeof call.id !== 'string' ||
      typeof call.name !== 'string' || typeof call.arguments !== 'string' || call.arguments.length > AI_LIMITS.toolArgumentChars) return invalid();
    return { id: call.id, name: call.name, arguments: call.arguments };
  });
  return { text: result.text, toolCalls, finishReason: result.finishReason as AiChatResult['finishReason'],
    usage: { inputTokens: usage.inputTokens as number, outputTokens: usage.outputTokens as number } };
}

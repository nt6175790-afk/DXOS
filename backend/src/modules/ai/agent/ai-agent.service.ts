import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import type { AppConfiguration } from '../../../config/environment';
import { PrismaService } from '../../../database/prisma.service';
import { AuthorizationService } from '../../rbac/authorization.service';
import type { PermissionKey } from '../../rbac/permission-catalog';
import { SelfServiceService } from '../../self-service/self-service.service';
import { AiProvider, AiProviderError, AiProviderNotConfigured, AiProviderUnavailable, supportsToolCalling } from '../ai-provider';
import type { AiChatInput, AiChatMessage, AiChatResult, AiToolCallingProvider } from '../ai-provider';
import { AI_LIMITS } from '../ai-policy';
import { validatedChatResult, type GenerationResult } from '../ai-validation';
import { AiToolRegistry } from '../tools/tool-registry';
import { MAX_CITATIONS, type AiCitation, type ToolContext } from '../tools/tool.types';
import { numericCheck } from './grounding';
import { buildSystemPrompt } from './system-prompt';

/** Harness budgets (spec 9.1). Step and time limits come from configuration. */
export const AGENT_HISTORY_MESSAGES = 8;
export const AGENT_TOOL_CALLS_PER_STEP = 3;
export const AGENT_TOTAL_TOOL_CHARS = 18_000;
const STEP_LIMIT_FALLBACK = 'Tôi chưa thể hoàn tất câu trả lời trong giới hạn tra cứu cho một câu hỏi. Bạn hãy hỏi cụ thể hơn hoặc tách thành nhiều câu.';

export interface AgentRunInput {
  userId: string;
  organizationId: string;
  requestId: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxOutputTokens: number;
  temperature: number;
  /** Aborts the whole run (total timeout or client disconnect). */
  signal: AbortSignal;
  now?: Date;
}

export interface AgentRunResult extends Required<GenerationResult> {
  steps: number;
  toolCalls: number;
}

/**
 * Agent loop: the model picks read-only tools, the server runs them under the caller's permissions,
 * results go back to the model, until it answers in text or the step budget is spent.
 */
@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    private readonly provider: AiProvider,
    private readonly registry: AiToolRegistry,
    private readonly authorization: AuthorizationService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly selfService: SelfServiceService,
  ) {}

  /** The agent needs a provider that supports tool calling (mock, ollama, vllm); openai/gemini keep the single-call path. */
  canRun(): boolean {
    return supportsToolCalling(this.provider);
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const provider = this.provider;
    if (!supportsToolCalling(provider)) throw new AiProviderNotConfigured();
    const app = this.config.getOrThrow<AppConfiguration>('app');
    const started = performance.now();
    const now = input.now ?? new Date();

    // The caller's own profile goes into the prompt so "tôi là ai / tôi làm phòng nào" needs no tool (a profile tool was
    // tried and made the model use the caller's record for questions about other people).
    const [granted, organization, caller] = await Promise.all([
      this.authorization.effectivePermissions(input.userId, input.organizationId),
      this.prisma.organization.findUnique({ where: { id: input.organizationId }, select: { name: true } }),
      this.selfService.profileForAssistant(input.organizationId, input.userId),
    ]);
    if (!granted) throw new ForbiddenException();
    // ③ Only describe tools the caller may use. Each tool still re-checks its permission when it runs.
    const permissions = new Set<PermissionKey>(granted);
    const definitions = this.registry.definitions(this.registry.allowedFor(permissions));

    const messages: AiChatMessage[] = [
      { role: 'system', content: buildSystemPrompt({
        organizationName: organization?.name ?? 'DX-OS', caller, now, hasTools: definitions.length > 0,
      }) },
      ...input.messages.slice(-AGENT_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content })),
    ];
    const context: ToolContext = { userId: input.userId, organizationId: input.organizationId, requestId: input.requestId, now, permissions };
    const usage = { inputTokens: 0, outputTokens: 0 };
    const citations: AiCitation[] = [];
    const toolResults: string[] = [];
    let toolChars = 0;
    let toolCalls = 0;

    let toolRounds = 0;
    let forced = false;
    for (let step = 1; ; step++) {
      // Tools stay available until `aiAgentMaxSteps` rounds have run. If the model still asks for tools after that,
      // one more call is made without tools so it must answer with what it has (finishReason=tool_limit).
      const offerTools = !forced && definitions.length > 0;
      const stepStarted = performance.now();
      const out = await this.call(provider, {
        model: app.aiModel, messages, tools: offerTools ? definitions : undefined,
        maxOutputTokens: input.maxOutputTokens, temperature: input.temperature,
      }, input, app);
      usage.inputTokens += out.usage.inputTokens;
      usage.outputTokens += out.usage.outputTokens;
      this.logger.log('ai_agent_step', {
        requestId: input.requestId, step, toolCallCount: out.toolCalls.length, latencyMs: Math.round(performance.now() - stepStarted),
      });

      if (!offerTools || !out.toolCalls.length) {
        let text = out.text.trim();
        if (!text) {
          if (!forced) throw new AiProviderError();
          text = STEP_LIMIT_FALLBACK;
        }
        let finishReason: AgentRunResult['finishReason'] = forced ? 'tool_limit' : out.finishReason === 'length' ? 'length' : 'stop';
        if (text.length > AI_LIMITS.outputChars) {
          text = text.slice(0, AI_LIMITS.outputChars);
          finishReason = 'length';
        }
        // ⑥ Grounding: numbers in the answer must come from tool results, the user's messages or the prompt's date/time.
        const check = numericCheck(text, toolResults, [messages[0].content, ...input.messages.filter((m) => m.role === 'user').map((m) => m.content)]);
        this.logger.log('ai_numeric_check', { requestId: input.requestId, status: check.status, unmatchedCount: check.unmatchedCount });
        const result: AgentRunResult = { text, finishReason, usage, citations: dedupeCitations(citations), numericCheck: check, steps: step, toolCalls };
        this.logger.log('ai_agent_completed', {
          requestId: input.requestId, model: app.aiModel, steps: step, toolCalls, stepLimitReached: forced,
          finishReason, totalLatencyMs: Math.round(performance.now() - started),
        });
        return result;
      }

      if (toolRounds >= app.aiAgentMaxSteps) {
        forced = true;
        continue;
      }
      toolRounds++;

      // ⑤ Run up to 3 calls of this step in parallel. Only executed calls are echoed back, so every id gets a result.
      const calls = out.toolCalls.slice(0, AGENT_TOOL_CALLS_PER_STEP);
      messages.push({ role: 'assistant', content: out.text, toolCalls: calls });
      const executions = await Promise.all(calls.map((call) => this.registry.execute(call, context)));
      for (const execution of executions) {
        toolCalls++;
        let content = execution.content;
        if (toolChars + content.length > AGENT_TOTAL_TOOL_CHARS) {
          content = JSON.stringify({ status: 'UNAVAILABLE', reason: 'CONTEXT_BUDGET' });
        } else {
          toolChars += content.length;
          toolResults.push(content);
          citations.push(...execution.citations);
        }
        messages.push({ role: 'tool', toolCallId: execution.callId, content });
      }
    }
  }

  /**
   * One model call bounded by AI_TIMEOUT_MS and the request's total budget. The race does not rely on the provider
   * honouring the abort signal, and the response is strictly validated before the loop reads it.
   */
  private call(provider: AiToolCallingProvider, request: AiChatInput, input: AgentRunInput, app: AppConfiguration): Promise<AiChatResult> {
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(app.aiTimeoutMs)]);
    return new Promise<AiChatResult>((resolve, reject) => {
      const onAbort = () => reject(new AiProviderUnavailable());
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      // Validation runs in its own step so a rejected response rejects the call instead of escaping the chain.
      Promise.resolve()
        .then(() => provider.chat(request, { requestId: input.requestId, signal }))
        .then(validatedChatResult)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });
  }
}

function dedupeCitations(citations: AiCitation[]): AiCitation[] {
  const seen = new Set<string>();
  const unique: AiCitation[] = [];
  for (const citation of citations) {
    const key = citation.type + '|' + (citation.id ?? citation.href);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(citation);
    if (unique.length === MAX_CITATIONS) break;
  }
  return unique;
}

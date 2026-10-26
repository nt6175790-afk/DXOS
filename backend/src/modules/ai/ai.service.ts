import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ApiErrorException } from '../../common/errors/api-error.exception';
import { currentRequest } from '../../common/http/request-context';
import { isOllamaCloudUrl, OPEN_WEIGHT_AI_PROVIDERS, type AppConfiguration } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_EVENTS } from '../audit/audit-catalog';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { GenerateAiDto } from './ai.dto';
import {
  AiProvider,
  AiProviderLimit,
  AiProviderNotConfigured,
  AiProviderUnavailable,
  AiProviderResult,
} from './ai-provider';
import { validatedAgentResult, validatedAiInput, validatedAiResult } from './ai-validation';
import type { GenerationResult } from './ai-validation';
import { AiAgentService } from './agent/ai-agent.service';
import { AiDataService } from './ai-data.service';
import { AiAnalyticsService } from './ai-analytics.service';

type Failure =
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_PROVIDER_ERROR'
  | 'AI_LIMIT_EXCEEDED'
  | 'AI_INTERNAL_ERROR'
  | 'FORBIDDEN'
  | 'AI_PROVIDER_NOT_CONFIGURED';

function safeError(category: Failure): ApiErrorException {
  const definitions = {
    AI_PROVIDER_NOT_CONFIGURED: [503, 'AI Provider chưa được cấu hình.'],
    AI_PROVIDER_UNAVAILABLE: [503, 'AI provider is unavailable.'],
    AI_PROVIDER_ERROR: [502, 'AI generation failed.'],
    AI_LIMIT_EXCEEDED: [429, 'AI limit exceeded.'],
    AI_INTERNAL_ERROR: [500, 'AI request could not be completed.'],
    FORBIDDEN: [403, 'You do not have permission to perform this action.'],
  } as const;
  return new ApiErrorException(definitions[category][0], category, definitions[category][1]);
}

/** Mock needs nothing; self-hosted Ollama/vLLM may run without a key; hosted APIs and Ollama Cloud need one. */
function isAiProviderConfigured(app: AppConfiguration): boolean {
  if (app.aiProvider === 'mock') return true;
  if (app.aiProvider === 'disabled') return false;
  if (OPEN_WEIGHT_AI_PROVIDERS.includes(app.aiProvider)) {
    return Boolean(app.aiBaseUrl) && (!isOllamaCloudUrl(app.aiBaseUrl) || Boolean(app.aiApiKey));
  }
  return Boolean(app.aiApiKey);
}

/** Only role and content reach a provider; anything else the DTO carries stays on the server. */
function plainMessages(dto: GenerateAiDto) {
  return dto.messages.map(({ role, content }) => ({ role, content }));
}

/**
 * Runs `work` with an abort signal and rejects with AiProviderUnavailable after `ms`,
 * even when `work` ignores the signal.
 */
async function withDeadline<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(abort.signal)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new AiProviderUnavailable());
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly provider: AiProvider,
    private readonly config: ConfigService,
    private readonly aiData: AiDataService,
    private readonly aiAnalytics?: AiAnalyticsService,
    private readonly agent?: AiAgentService
  ) {}

  async getConfig(organizationId: string) {
    void organizationId; // Configuration contains no organization data; authorization is enforced by the controller.
    const app = this.config.getOrThrow<AppConfiguration>('app');
    return {
      provider: app.aiProvider,
      model: app.aiModel,
      isConfigured: isAiProviderConfigured(app),
    };
  }

  async getInsights(userId: string, organizationId: string) {
    if (!this.aiAnalytics) {
      return { workforce: null, attendance: null, performance: null, compliance: null, payroll: null };
    }
    return this.aiAnalytics.getAiInsightsSummary(organizationId, userId);
  }

  async generate(userId: string, organizationId: string, input: GenerateAiDto) {
    const dto = validatedAiInput(input);
    const app = this.config.getOrThrow<AppConfiguration>('app');
    if (dto.model !== undefined && dto.model !== app.aiModel) {
      throw new ApiErrorException(400, 'AI_INVALID_REQUEST', 'Invalid AI model.');
    }
    const context = currentRequest.getStore();
    if (context?.actorUserId && context.actorUserId !== userId) throw new ForbiddenException();
    const requestId = context?.requestId ?? randomUUID();
    const started = performance.now();
    let id: string;
    try {
      id = await this.transaction(async (tx) => {
        await this.allow(tx, userId, organizationId);
        // Future tenant/user quota reservation belongs here, before any provider invocation.
        const row = await tx.aiRequest.create({
          data: {
            organizationId,
            userId,
            requestId,
            provider: app.aiProvider,
            model: app.aiModel,
            createdAt: new Date(),
          },
        });
        await this.audit.record(
          { event: AUDIT_EVENTS.AI_STARTED, organizationId, actorUserId: userId, resourceId: row.id },
          tx
        );
        return row.id;
      });
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw safeError('AI_INTERNAL_ERROR');
    }
    const attrs = { requestId, organizationId, userId, provider: app.aiProvider, model: app.aiModel };
    this.logger.log('ai_request_started', { ...attrs, status: 'STARTED' });
    let result: GenerationResult;
    try {
      if (app.aiProvider === 'disabled') throw new AiProviderUnavailable();
      if (this.agent?.canRun()) {
        // Agent path (tool-calling providers: mock, ollama, vllm): the model picks read-only tools; no fixed data block.
        result = await this.runAgent(dto, app, requestId, userId, organizationId);
      } else {
        // Single-call path (openai/gemini): one call with the fixed analytics context.
        const lastUserMessage = dto.messages.filter((m) => m.role === 'user').pop()?.content ?? '';
        const systemPrompt = typeof this.aiData.buildAnalyticsContext === 'function'
          ? await this.aiData.buildAnalyticsContext(organizationId, userId, lastUserMessage)
          : await this.aiData.buildContextSummary(organizationId, userId);
        result = await this.invoke(dto, app, requestId, systemPrompt);
      }
    } catch (error) {
      const category: Failure =
        error instanceof ForbiddenException
          ? 'FORBIDDEN'
          : error instanceof AiProviderNotConfigured
          ? 'AI_PROVIDER_NOT_CONFIGURED'
          : error instanceof AiProviderUnavailable
          ? 'AI_PROVIDER_UNAVAILABLE'
          : error instanceof AiProviderLimit
          ? 'AI_LIMIT_EXCEEDED'
          : 'AI_PROVIDER_ERROR';
      await this.fail(id, userId, organizationId, category, started);
      this.logger.warn('ai_request_failed', {
        ...attrs,
        status: 'FAILED',
        errorCategory: category,
        latencyMs: this.elapsed(started),
      });
      throw safeError(category);
    }
    try {
      await this.transaction(async (tx) => {
        await this.allow(tx, userId, organizationId);
        const updated = await tx.aiRequest.updateMany({
          where: { id, organizationId, userId, status: 'STARTED' },
          data: {
            status: 'SUCCEEDED',
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            latencyMs: this.elapsed(started),
            completedAt: new Date(),
          },
        });
        if (updated.count !== 1) throw new Error('Invalid AI lifecycle');
        await this.audit.record(
          { event: AUDIT_EVENTS.AI_SUCCEEDED, organizationId, actorUserId: userId, resourceId: id },
          tx
        );
      });
    } catch (error) {
      const category = error instanceof ForbiddenException ? 'FORBIDDEN' : 'AI_INTERNAL_ERROR';
      await this.fail(id, userId, organizationId, category, started);
      throw safeError(category);
    }
    this.logger.log('ai_request_completed', { ...attrs, status: 'SUCCEEDED', latencyMs: this.elapsed(started) });
    return {
      id,
      organizationId,
      requestId,
      provider: app.aiProvider,
      model: app.aiModel,
      text: result.text,
      finishReason: result.finishReason,
      usage: {
        ...result.usage,
        totalTokens: result.usage.inputTokens + result.usage.outputTokens,
      },
      // Agent path only; the legacy path has no tool sources to cite or check against.
      citations: result.citations ?? [],
      numericCheck: result.numericCheck ?? { status: 'NOT_APPLICABLE' as const, unmatchedCount: 0 },
    };
  }

  private async runAgent(
    dto: GenerateAiDto,
    app: AppConfiguration,
    requestId: string,
    userId: string,
    organizationId: string
  ): Promise<GenerationResult> {
    const result = await withDeadline(app.aiAgentTotalTimeoutMs, (signal) => this.agent!.run({
      userId,
      organizationId,
      requestId,
      messages: plainMessages(dto),
      maxOutputTokens: dto.maxOutputTokens,
      temperature: dto.temperature,
      signal,
    }));
    return validatedAgentResult(result);
  }

  private async invoke(
    dto: GenerateAiDto,
    app: AppConfiguration,
    requestId: string,
    systemPrompt?: string
  ): Promise<AiProviderResult> {
    const result = await withDeadline(app.aiTimeoutMs, (signal) => this.provider.generateText(
      { model: app.aiModel, messages: plainMessages(dto), maxOutputTokens: dto.maxOutputTokens, temperature: dto.temperature, systemPrompt },
      { requestId, signal }
    ));
    return validatedAiResult(result, dto.maxOutputTokens);
  }

  private async fail(id: string, userId: string, organizationId: string, category: Failure, started: number) {
    try {
      await this.transaction(async (tx) => {
        const changed = await tx.aiRequest.updateMany({
          where: { id, organizationId, userId, status: 'STARTED' },
          data: {
            status: 'FAILED',
            errorCategory: category,
            completedAt: new Date(),
            latencyMs: this.elapsed(started),
          },
        });
        if (changed.count) {
          await this.audit.record(
            { event: AUDIT_EVENTS.AI_FAILED, organizationId, actorUserId: userId, resourceId: id },
            tx
          );
        }
      });
    } catch {
      throw safeError('AI_INTERNAL_ERROR');
    }
  }

  private elapsed(started: number) {
    return Math.min(4294967295, Math.max(0, Math.round(performance.now() - started)));
  }

  private async allow(tx: Prisma.TransactionClient, userId: string, organizationId: string) {
    if (!(await this.authorization.can(userId, PERMISSIONS.AI_USE, organizationId, tx))) {
      throw new ForbiddenException();
    }
  }

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) {
          throw error;
        }
      }
    }
  }
}

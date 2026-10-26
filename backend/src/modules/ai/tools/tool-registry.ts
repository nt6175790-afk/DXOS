// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { performance } from 'node:perf_hooks';
import { AuthorizationService } from '../../rbac/authorization.service';
import type { PermissionKey } from '../../rbac/permission-catalog';
import { AI_TOOL_NAME } from '../ai-policy';
import type { AiToolCall, AiToolDefinition } from '../ai-provider';
import { AI_TOOLS, ToolArgumentError, ToolDeniedError } from './tool.types';
import type { AiCitation, AiTool, ToolContext, ToolStatus } from './tool.types';

/** Per-tool result budget sent back to the model (spec 9.1). */
export const TOOL_RESULT_BUDGET_CHARS = 6_000;
const MAX_CITATIONS_PER_TOOL = 20;

export interface ToolExecution {
  callId: string;
  name: string;
  status: ToolStatus;
  /** JSON text sent to the model as the tool message. */
  content: string;
  citations: AiCitation[];
  resultCount: number | null;
  truncated: boolean;
  latencyMs: number;
}

/** Top-level arrays of a tool result (items, events, schedule…), the parts that can be shortened. */
function arraysOf(data: Record<string, unknown>): unknown[][] {
  return Object.values(data).filter((value): value is unknown[] => Array.isArray(value));
}

function idsOf(arrays: unknown[][]): Set<string> {
  const ids = new Set<string>();
  for (const array of arrays) for (const item of array) {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof id === 'string') ids.add(id);
  }
  return ids;
}

@Injectable()
export class AiToolRegistry {
  private readonly logger = new Logger(AiToolRegistry.name);
  private readonly byName = new Map<string, AiTool>();

  constructor(@Inject(AI_TOOLS) tools: AiTool[], private readonly authorization: AuthorizationService) {
    for (const tool of tools) {
      if (!AI_TOOL_NAME.test(tool.name) || this.byName.has(tool.name)) throw new Error('Invalid AI tool registration');
      this.byName.set(tool.name, tool);
    }
  }

  /** Tools whose required permissions are all held. Only these are described to the model. */
  allowedFor(permissions: ReadonlySet<PermissionKey>): AiTool[] {
    return [...this.byName.values()].filter((tool) => tool.requiredPermissions.every((p) => permissions.has(p)));
  }

  definitions(tools: AiTool[]): AiToolDefinition[] {
    return tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
  }

  /**
   * Runs one model-requested call through the guardrails:
   * known name → valid arguments → permission re-check → handler → allowlisted, size-bounded result.
   * Never throws; every failure becomes a status the model can read.
   */
  async execute(call: AiToolCall, context: ToolContext): Promise<ToolExecution> {
    const started = performance.now();
    const finish = (status: ToolStatus, payload: Record<string, unknown>, citations: AiCitation[] = [], truncated = false,
      resultCount: number | null = null): ToolExecution => {
      const execution: ToolExecution = {
        callId: call.id, name: call.name, status, content: JSON.stringify({ status, ...payload }),
        citations: citations.slice(0, MAX_CITATIONS_PER_TOOL), resultCount, truncated,
        latencyMs: Math.round(performance.now() - started),
      };
      this.logger.log('ai_tool_invoked', {
        requestId: context.requestId, tool: this.byName.has(call.name) ? call.name : 'unknown', outcome: status,
        resultCount, truncated, latencyMs: execution.latencyMs,
      });
      return execution;
    };

    const tool = this.byName.get(call.name);
    if (!tool) return finish('INVALID_ARGUMENTS', { reason: 'UNKNOWN_TOOL' });

    let raw: unknown;
    try {
      raw = call.arguments.trim() ? JSON.parse(call.arguments) : {};
    } catch {
      return finish('INVALID_ARGUMENTS', { reason: 'MALFORMED_JSON' });
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return finish('INVALID_ARGUMENTS', { reason: 'ARGUMENTS_MUST_BE_OBJECT' });
    // Models often fill optional parameters with "" or null; treat those as omitted. Required ones still fail validation.
    // They also vary the case of enum values ("active" for ACTIVE): map to the canonical value declared in the schema.
    const properties = (tool.parameters.properties ?? {}) as Record<string, { enum?: unknown[] }>;
    const cleaned = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== null && value !== '').map(([name, value]) => {
      const options = Object.hasOwn(properties, name) ? properties[name].enum : undefined;
      if (typeof value !== 'string' || !Array.isArray(options) || options.includes(value)) return [name, value];
      const canonical = options.find((option) => typeof option === 'string' && option.toLowerCase() === value.trim().toLowerCase());
      return [name, canonical ?? value];
    }));
    // Tools without parameters take exactly {} (class-validator rejects classes without rules under forbidUnknownValues).
    const hasParameters = Object.keys(properties).length > 0;
    if (!hasParameters && Object.keys(cleaned).length) {
      return finish('INVALID_ARGUMENTS', { errors: [{ field: 'unknown_field', rules: ['whitelistValidation'], allowedFields: [] }] });
    }
    const args = plainToInstance(tool.argsType, cleaned);
    const errors = hasParameters ? validateSync(args, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }) : [];
    if (errors.length) {
      // Property names and rule names only; never echo the submitted values.
      // For known fields, echo our own schema so the model can correct the call on the next step.
      const fields = errors.slice(0, 10).map((e) => Object.hasOwn(properties, e.property)
        ? { field: e.property, rules: Object.keys(e.constraints ?? {}), expected: properties[e.property] }
        : { field: 'unknown_field', rules: Object.keys(e.constraints ?? {}), allowedFields: Object.keys(properties) });
      // Short identifier-like values of enum fields help tune tool descriptions; free text is never logged.
      const enumValues = errors.filter((e) => Object.hasOwn(properties, e.property) && typeof e.value === 'string' &&
        /^[A-Za-z_]{1,32}$/.test(e.value) && Object.keys(e.constraints ?? {}).some((rule) => rule === 'isIn' || rule === 'isEnum'))
        .map((e) => e.property + '=' + (e.value as string)).join(',');
      this.logger.log('ai_tool_invalid_arguments', { requestId: context.requestId, tool: tool.name,
        fields: fields.map((f) => f.field + ':' + f.rules.join('|')).join(','), ...(enumValues ? { enumValues } : {}) });
      return finish('INVALID_ARGUMENTS', { errors: fields });
    }

    for (const permission of tool.requiredPermissions) {
      if (!(await this.authorization.can(context.userId, permission, context.organizationId))) {
        return finish('DENIED', { requiredPermission: permission });
      }
    }

    try {
      const outcome = await tool.execute(args, context);
      const data = { ...outcome.data };
      let content = JSON.stringify({ status: outcome.status, ...data });
      let truncated = data.truncated === true;
      const arrays = arraysOf(data);
      const before = idsOf(arrays);
      // Over budget: shorten the longest list first, and say so, instead of failing the call.
      while (content.length > TOOL_RESULT_BUDGET_CHARS) {
        const longest = arrays.reduce<unknown[] | null>((a, b) => (!a || b.length > a.length ? b : a), null);
        if (!longest || longest.length === 0) break;
        longest.pop();
        truncated = true;
        data.truncated = true;
        content = JSON.stringify({ status: outcome.status, ...data });
      }
      if (content.length > TOOL_RESULT_BUDGET_CHARS) return finish('UNAVAILABLE', { reason: 'RESULT_TOO_LARGE' });
      const kept = idsOf(arrays);
      // Only cite records the model actually received.
      const citations = (outcome.citations ?? []).filter((c) => c.id === null || !before.has(c.id) || kept.has(c.id));
      const resultCount = Array.isArray(data.items) ? data.items.length : null;
      return finish(outcome.status, data, citations, truncated, resultCount);
    } catch (error) {
      if (error instanceof ForbiddenException) return finish('DENIED', { requiredPermission: tool.requiredPermissions[0] ?? null });
      if (error instanceof ToolDeniedError) return finish('DENIED', { requiredPermission: error.permission });
      if (error instanceof ToolArgumentError) return finish('INVALID_ARGUMENTS', { reason: error.reason });
      this.logger.warn('ai_tool_failed', { requestId: context.requestId, tool: tool.name, errorCategory: error instanceof Error ? error.name : 'Unknown' });
      return finish('UNAVAILABLE', {});
    }
  }
}

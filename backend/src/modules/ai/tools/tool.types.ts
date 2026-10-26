// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PERMISSIONS, type PermissionKey } from '../../rbac/permission-catalog';

/** Status every tool result carries back to the model. */
export type ToolStatus = 'OK' | 'EMPTY' | 'DENIED' | 'INVALID_ARGUMENTS' | 'UNAVAILABLE';

export const AI_CITATION_TYPES = ['task', 'approval', 'leave', 'document', 'employee', 'department', 'event', 'attendance', 'schedule', 'metric'] as const;
export type AiCitationType = (typeof AI_CITATION_TYPES)[number];
/** Citations returned per answer. */
export const MAX_CITATIONS = 30;

/** A link to the source record. `href` is always an internal route starting with '/'. */
export interface AiCitation { type: AiCitationType; id: string | null; label: string; href: string }

/** Server-side facts about the caller. Never filled from model output. */
export interface ToolContext {
  userId: string;
  organizationId: string;
  requestId: string;
  now: Date;
  permissions: ReadonlySet<PermissionKey>;
}

export interface ToolOutcome {
  status: 'OK' | 'EMPTY';
  data: Record<string, unknown>;
  citations?: AiCitation[];
}

/**
 * A read-only function the model may call.
 * `parameters` (JSON Schema for the model) and `argsType` (class-validator DTO) describe the same fields;
 * the DTO is the one that is enforced.
 */
export interface AiTool<TArgs extends object = object> {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly argsType: new () => TArgs;
  readonly requiredPermissions: readonly PermissionKey[];
  execute(args: TArgs, context: ToolContext): Promise<ToolOutcome>;
}

/** Injection token for the list of registered tools. */
export const AI_TOOLS = Symbol('AI_TOOLS');

/** Thrown by a tool when arguments are well-formed but unusable (e.g. division by zero). */
export class ToolArgumentError extends Error {
  constructor(readonly reason: string) { super(reason); }
}

/** Thrown by a tool when a specific permission (beyond its required ones) is missing. */
export class ToolDeniedError extends Error {
  constructor(readonly permission: PermissionKey) { super('DENIED'); }
}

/** Snapshot check used to hide fields (names, counts) the caller may not see on regular screens. */
export function holds(context: ToolContext, ...permissions: PermissionKey[]): boolean {
  return permissions.every((p) => context.permissions.has(p));
}

/** Department names follow the Departments screen: shown only with department:read. */
export function departmentName(context: ToolContext, name: string | null | undefined): string | null {
  return holds(context, PERMISSIONS.DEPARTMENT_READ) ? name ?? null : null;
}

/**
 * Optional `limit` argument. The DTO accepts any positive integer and the tool caps it with `limitOf`,
 * so a model asking for 50 rows still gets an answer instead of INVALID_ARGUMENTS.
 */
export function LimitArg(): PropertyDecorator {
  return applyDecorators(IsOptional(), Type(() => Number), IsInt(), Min(1), Max(1000));
}

export function limitSchema(defaultLimit: number, max: number, note = ''): Record<string, unknown> {
  return { type: 'integer', minimum: 1, maximum: max, description: `${note}Default ${defaultLimit}.` };
}

export function limitOf(limit: number | undefined, defaultLimit: number, max: number): number {
  return Math.min(limit ?? defaultLimit, max);
}

/** JSON Schema helper: object with only the listed properties. */
export function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}

/** Clips free text from the database before it reaches the model. */
export function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

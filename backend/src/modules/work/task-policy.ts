// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { PERMISSIONS, type PermissionKey } from '../rbac/permission-catalog';

export const TASK_COLLABORATION_KIND = 'dx-os:task-collaboration-kind';
export type TaskCollaborationKind = 'comments' | 'attachments' | 'planning' | 'reviewer' | 'checklist' | 'activity';
export function collaborationPermissions(method: string, kind: TaskCollaborationKind): PermissionKey[] {
  if (kind === 'reviewer') return [PERMISSIONS.TASK_ASSIGN];
  if (kind === 'planning' || kind === 'activity') return [PERMISSIONS.TASK_READ];
  const permissions: PermissionKey[] = [method === 'GET' ? PERMISSIONS.TASK_READ : PERMISSIONS.TASK_UPDATE];
  if (kind === 'attachments') permissions.push(PERMISSIONS.FILE_READ);
  return permissions;
}

// Same field-to-grant policy is used before DTO/resource lookup and again inside the transaction.
export function taskPermissions(method: 'GET' | 'POST' | 'PATCH', input: unknown): PermissionKey[] {
  if (method === 'GET') return [PERMISSIONS.TASK_READ];
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  if (method === 'POST') return body.assigneeEmployeeId !== undefined && body.assigneeEmployeeId !== null
    ? [PERMISSIONS.TASK_CREATE, PERMISSIONS.TASK_ASSIGN] : [PERMISSIONS.TASK_CREATE];
  const keys = Object.keys(body).filter((key) => body[key] !== undefined);
  const required: PermissionKey[] = [];
  if (keys.includes('assigneeEmployeeId')) required.push(PERMISSIONS.TASK_ASSIGN);
  if (!keys.length || keys.some((key) => key !== 'assigneeEmployeeId')) required.push(PERMISSIONS.TASK_UPDATE);
  return required;
}

export function isTaskTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = /^([1-9][0-9]{3})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(?:\.[0-9]{1,3})?(Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  if (Number(day) > new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() >= 1000 && parsed.getUTCFullYear() <= 9999;
}

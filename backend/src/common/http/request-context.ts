// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { StructuredLogger } from '../logging/structured-logger';

export const REQUEST_ID_HEADER = 'x-request-id';
export const currentRequest = new AsyncLocalStorage<{ requestId: string; actorUserId?: string }>();

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export interface HttpRequestContext {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  originalUrl: string;
  params?: Record<string, string | undefined>;
  requestId?: string;
}

export interface HttpResponseContext {
  statusCode: number;
  locals: Record<string, unknown>;
  setHeader(name: string, value: string): void;
  getHeader(name: string): unknown;
  once(event: 'finish', listener: () => void): void;
  status(statusCode: number): HttpResponseContext;
  json(body: unknown): void;
}

export type NextHandler = () => void;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function requestContextMiddleware(logger: StructuredLogger) {
  return (request: HttpRequestContext, response: HttpResponseContext, next: NextHandler): void => {
    const suppliedRequestId = request.headers[REQUEST_ID_HEADER];
    const requestId = isValidRequestId(suppliedRequestId) ? suppliedRequestId : randomUUID();
    const startedAt = process.hrtime.bigint();

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    response.once('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - startedAt) / BigInt(1_000_000));
      const path = request.originalUrl.split('?')[0];
      const errorCode = response.locals.apiErrorCode as string | undefined;

      logger.logRequest({
        requestId,
        method: request.method,
        path,
        statusCode: response.statusCode,
        durationMs,
        ...(errorCode ? { errorCode } : {}),
      });
    });

    currentRequest.run({ requestId }, next);
  };
}

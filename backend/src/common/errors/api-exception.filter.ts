// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { STATUS_CODES } from 'node:http';
import { ApiErrorException } from './api-error.exception';
import {
  REQUEST_ID_HEADER,
  type HttpRequestContext,
  type HttpResponseContext,
} from '../http/request-context';
import type { StructuredLogger } from '../logging/structured-logger';

interface ApiError {
  code: string;
  message: string;
  details: Record<string, unknown>;
  requestId: string;
}

interface ApiErrorEnvelope {
  success: false;
  error: ApiError;
}

interface ErrorDefinition {
  code: string;
  message: string;
}

const httpErrorDefinitions: Partial<Record<number, ErrorDefinition>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'BAD_REQUEST',
    message: 'The request is invalid.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: 'FORBIDDEN',
    message: 'You do not have permission to perform this action.',
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'NOT_FOUND',
    message: 'The requested resource was not found.',
  },
  [HttpStatus.CONFLICT]: {
    code: 'CONFLICT',
    message: 'The request conflicts with the current resource state.',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'UNPROCESSABLE_ENTITY',
    message: 'The request could not be processed.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Please try again later.',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validationMessages(value: unknown): string[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.message)) {
    return undefined;
  }

  return value.message.every((message) => typeof message === 'string')
    ? (value.message as string[])
    : undefined;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequestContext>();
    const response = http.getResponse<HttpResponseContext>();
    const { statusCode, error } = this.resolveError(exception, request, response);

    response.locals.apiErrorCode = error.code;
    this.logger.warn('http_request_failed', {
      requestId: error.requestId,
      method: request.method,
      path: request.originalUrl.split('?')[0],
      statusCode,
      errorCode: error.code,
    });
    response.status(statusCode).json({ success: false, error } satisfies ApiErrorEnvelope);
  }

  private resolveError(
    exception: unknown,
    request: HttpRequestContext,
    response: HttpResponseContext,
  ): { statusCode: number; error: ApiError } {
    const requestId = request.requestId ?? String(response.getHeader(REQUEST_ID_HEADER) ?? 'unknown');

    if (exception instanceof ApiErrorException) {
      return {
        statusCode: exception.getStatus(),
        error: {
          code: exception.code,
          message: exception.safeMessage,
          details: {},
          requestId,
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const definition = this.getPrismaErrorDefinition(exception.code);

      return {
        statusCode: definition.statusCode,
        error: {
          code: definition.code,
          message: definition.message,
          details: {},
          requestId,
        },
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const responseBody = exception.getResponse();
      const messages = validationMessages(responseBody);

      if (statusCode === HttpStatus.BAD_REQUEST && messages) {
        return {
          statusCode,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed.',
            details: { fields: messages },
            requestId,
          },
        };
      }

      const definition = httpErrorDefinitions[statusCode] ?? {
        code: 'HTTP_ERROR',
        message: 'The request could not be completed.',
      };

      const customMessage =
        typeof responseBody === 'string'
          ? responseBody
          : isRecord(responseBody) &&
              typeof responseBody.message === 'string' &&
              responseBody.message !== exception.name
            ? responseBody.message
            : undefined;

      return {
        statusCode,
        error: {
          code: definition.code,
          message: customMessage && customMessage !== STATUS_CODES[statusCode] ? customMessage : definition.message,
          details: {},
          requestId,
        },
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        details: {},
        requestId,
      },
    };
  }

  private getPrismaErrorDefinition(code: string): ErrorDefinition & { statusCode: number } {
    switch (code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'The request conflicts with the current resource state.',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'DATABASE_ERROR',
          message: 'A database operation could not be completed.',
        };
    }
  }
}

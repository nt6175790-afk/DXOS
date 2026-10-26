// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { LoggerService } from '@nestjs/common';
import type { LogLevel } from '../../config/environment';

export interface StructuredLogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  attributes?: Record<string, unknown>;
}

export type LogSink = (record: StructuredLogRecord) => void;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const sensitiveKeyPattern = /authorization|cookie|password|secret|token|api[-_]?key/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sensitiveKeyPattern.test(key) ? '[REDACTED]' : redact(nestedValue);
    }

    return result;
  }

  return value;
}

function redactText(value: string): string {
  return value.replace(
    /(password|secret|token|authorization|cookie|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
    '$1=[REDACTED]',
  );
}

function defaultSink(record: StructuredLogRecord): void {
  console.log(JSON.stringify(record));
}

export class StructuredLogger implements LoggerService {
  constructor(
    private readonly minimumLevel: LogLevel = 'info',
    private readonly sink: LogSink = defaultSink,
  ) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('info', message, this.getAttributes(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('error', message, this.getAttributes(optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('warn', message, this.getAttributes(optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, this.getAttributes(optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, this.getAttributes(optionalParams));
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('error', message, this.getAttributes(optionalParams));
  }

  logRequest(attributes: Record<string, unknown>): void {
    this.emit('info', 'http_request_completed', attributes);
  }

  private emit(level: LogLevel, message: unknown, attributes?: Record<string, unknown>): void {
    if (levelWeight[level] < levelWeight[this.minimumLevel]) {
      return;
    }

    this.sink({
      timestamp: new Date().toISOString(),
      level,
      message: redactText(typeof message === 'string' ? message : JSON.stringify(redact(message))),
      ...(attributes ? { attributes: redact(attributes) as Record<string, unknown> } : {}),
    });
  }

  private getAttributes(optionalParams: unknown[]): Record<string, unknown> | undefined {
    const candidate = optionalParams.find(
      (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    );

    return candidate as Record<string, unknown> | undefined;
  }
}

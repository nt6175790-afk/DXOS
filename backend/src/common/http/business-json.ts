// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IncomingMessage } from 'node:http';
import { ApiErrorException } from '../errors/api-error.exception';

// Registered before Nest's default parser; other endpoints retain the default JSON parser/limit.
export function configureBusinessJson(app: INestApplication, prefix: string): void {
  const matches = (url = '') => {
    const path = url.split('?')[0];
    if (path.toLowerCase().startsWith(`/${prefix}/organizations/`.toLowerCase()) && /\/calendar\/events(?:\/[^/]+)?\/?$/i.test(path)) return true;
    return path.toLowerCase().startsWith(`/${prefix}/organizations/`.toLowerCase()) && /(?:\/(?:departments|employees|tasks)(?:\/[^/]+)?|\/tasks\/[^/]+\/(?:comments|attachments)(?:\/[^/]+)?|\/tasks\/[^/]+\/(?:planning(?:\/reviewer)?|checklist(?:\/[^/]+)?|activity)|\/(?:members)(?:\/[^/]+\/roles(?:\/[^/]+)?)?)\/?$/i.test(path);
  };
  const expressApp = app as NestExpressApplication;
  expressApp.useBodyParser('json', { limit: '64kb', type: (req: IncomingMessage) =>
    matches(req.url) && /^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '') });
  expressApp.useBodyParser('json');
  app.use((error: unknown, req: IncomingMessage, _res: unknown, next: (error?: unknown) => void) => {
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    if (matches(req.url) && status === 413) {
      next(new ApiErrorException(HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE', 'The request body exceeds 64 KiB.'));
    } else if (matches(req.url) && (status === 400 || status === 415)) {
      next(new BadRequestException());
    } else next(error);
  });
}

@Injectable()
export class BusinessJsonGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<IncomingMessage>();
    if (['POST', 'PATCH'].includes(req.method ?? '') &&
      !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new BadRequestException();
    return true;
  }
}

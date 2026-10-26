// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import type { AppConfiguration } from './config/environment';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { requestContextMiddleware, REQUEST_ID_HEADER } from './common/http/request-context';
import { StructuredLogger } from './common/logging/structured-logger';
import { configureBusinessJson } from './common/http/business-json';

export function configureApplication(
  app: INestApplication,
  config: AppConfiguration,
  logger: StructuredLogger,
): void {
  app.useLogger(logger);
  app.use(helmet());
  app.use(requestContextMiddleware(logger));
  configureBusinessJson(app, config.apiPrefix);
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    credentials: true,
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
  app.setGlobalPrefix(config.apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter(logger));
}

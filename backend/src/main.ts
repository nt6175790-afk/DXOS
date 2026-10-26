// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import { loadVaultSecrets } from './config/vault';
import { configureApplication } from './app.setup';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from './config/environment';
import { StructuredLogger } from './common/logging/structured-logger';

export async function bootstrap(): Promise<void> {
  for (const file of ['.env', 'backend/.env', '../backend/.env']) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
  await loadVaultSecrets();
  // Import after Vault bootstrap: ConfigModule validates the completed environment.
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  const config = app.get(ConfigService).getOrThrow<AppConfiguration>('app');
  const logger = new StructuredLogger(config.logLevel);

  configureApplication(app, config, logger);
  await app.listen(config.port);
  logger.log('application_started', {
    environment: config.environment,
    port: config.port,
    apiPrefix: config.apiPrefix,
  });
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Application startup failed.');
  if (process.env.NODE_ENV !== 'production') {
    logger.debug(error instanceof Error ? error.name : 'Unknown startup error');
  }
  process.exitCode = 1;
});

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { ApiDocumentationController } from './api-documentation.controller';

@Module({
  controllers: [ApiDocumentationController],
})
export class ApiDocumentationModule {}

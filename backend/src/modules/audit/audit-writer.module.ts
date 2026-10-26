// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditWriterModule {}

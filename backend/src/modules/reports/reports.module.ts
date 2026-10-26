// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AnalyticsRepository } from './analytics.repository';
import { PerformanceAnalyticsProvider } from './performance-analytics.provider';
@Module({ imports: [AuthModule, RbacModule], controllers: [ReportsController], providers: [ReportsService, AnalyticsRepository, PerformanceAnalyticsProvider], exports: [ReportsService] })
export class ReportsModule {}

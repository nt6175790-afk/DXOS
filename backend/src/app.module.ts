// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { ReportsModule } from './modules/reports/reports.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ConfigModule } from '@nestjs/config';
import { getAppConfiguration, validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { ApiDocumentationModule } from './modules/api-documentation/api-documentation.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AuditModule } from './modules/audit/audit.module';
import { FilesModule } from './modules/files/files.module';
import { AiModule } from './modules/ai/ai.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { PeopleModule } from './modules/people/people.module';
import { WorkModule } from './modules/work/work.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SearchModule } from './modules/search/search.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { LeaveModule } from './modules/leave/leave.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ShiftModule } from './modules/shift/shift.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { AutomationModule } from './modules/automation/automation.module';
import { SelfServiceModule } from './modules/self-service/self-service.module';

@Module({
  imports: [
    ReportsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', 'backend/.env', '../backend/.env'],
      validate: validateEnvironment,
      load: [() => ({ app: getAppConfiguration() })],
    }),
    DatabaseModule,
    HealthModule,
    ApiDocumentationModule,
    AuthModule,
    RbacModule,
    OrganizationsModule,
    AuditModule,
    FilesModule,
    AiModule,
    DepartmentsModule,
    PeopleModule,
    WorkModule,
    DashboardModule,
    SearchModule,
    CalendarModule,
    LeaveModule,
    AttendanceModule,
    ShiftModule,
    ScheduleModule,
    ApprovalModule,
    PayrollModule,
    PerformanceModule,
    DocumentsModule,
    WorkflowModule,
    AutomationModule,
    SelfServiceModule,
  ],
})
export class AppModule {}

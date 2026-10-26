import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { ApprovalModule } from '../approval/approval.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { CalendarModule } from '../calendar/calendar.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DepartmentsModule } from '../departments/departments.module';
import { DocumentsModule } from '../documents/documents.module';
import { LeaveModule } from '../leave/leave.module';
import { PeopleModule } from '../people/people.module';
import { ReportsModule } from '../reports/reports.module';
import { SelfServiceModule } from '../self-service/self-service.module';
import { WorkModule } from '../work/work.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiDataService } from './ai-data.service';
import { AiAnalyticsService } from './ai-analytics.service';
import { AiProvider } from './ai-provider';
import { MockAiProvider } from './mock-ai.provider';
import { OpenAiProvider } from './openai-ai.provider';
import { GeminiAiProvider } from './gemini-ai.provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';
import { AiAgentService } from './agent/ai-agent.service';
import { AiToolRegistry } from './tools/tool-registry';
import { AI_TOOLS } from './tools/tool.types';
import { CalculateTool } from './tools/calculate.tool';
import { ListDepartmentsTool } from './tools/list-departments.tool';
import { ListTasksTool } from './tools/list-tasks.tool';
import { GetTaskTool } from './tools/get-task.tool';
import { ListPendingApprovalsTool } from './tools/list-pending-approvals.tool';
import { ListDocumentAlertsTool } from './tools/list-document-alerts.tool';
import { GetMyScheduleTool } from './tools/get-my-schedule.tool';
import { GetHrMetricsTool } from './tools/get-hr-metrics.tool';
import { GetOverviewTool } from './tools/get-overview.tool';
import { ListCalendarEventsTool } from './tools/list-calendar-events.tool';
import { FindEmployeeTool } from './tools/find-employee.tool';
import { ListAttendanceExceptionsTool } from './tools/list-attendance-exceptions.tool';
import { ListLeavesTool } from './tools/list-leaves.tool';
import { ConfigService } from '@nestjs/config';
import { OPEN_WEIGHT_AI_PROVIDERS, type AppConfiguration } from '../../config/environment';

/** Read-only tools available to the agent (spec 9.3): A "what do I need to do", B "mine", C "organization", calculate. */
const TOOLS = [
  ListTasksTool, GetTaskTool, ListPendingApprovalsTool, ListDocumentAlertsTool,
  GetMyScheduleTool,
  GetHrMetricsTool, GetOverviewTool, ListCalendarEventsTool, ListDepartmentsTool, FindEmployeeTool, ListAttendanceExceptionsTool, ListLeavesTool,
  CalculateTool,
];

@Module({
  imports: [
    AuthModule, RbacModule, AuditWriterModule,
    // Domain modules whose read services the tools reuse.
    ApprovalModule, AttendanceModule, CalendarModule, DashboardModule, DepartmentsModule, DocumentsModule,
    LeaveModule, PeopleModule, ReportsModule, SelfServiceModule, WorkModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiDataService,
    AiAnalyticsService,
    MockAiProvider,
    OpenAiProvider,
    GeminiAiProvider,
    OpenAiCompatibleProvider,
    ...TOOLS,
    { provide: AI_TOOLS, useFactory: (...tools: unknown[]) => tools, inject: TOOLS },
    AiToolRegistry,
    AiAgentService,
    {
      provide: AiProvider,
      useFactory: (
        config: ConfigService,
        mock: MockAiProvider,
        openai: OpenAiProvider,
        gemini: GeminiAiProvider,
        openWeight: OpenAiCompatibleProvider
      ) => {
        const app = config.getOrThrow<AppConfiguration>('app');
        if (OPEN_WEIGHT_AI_PROVIDERS.includes(app.aiProvider)) return openWeight;
        if (app.aiProvider === 'openai') return openai;
        if (app.aiProvider === 'gemini') return gemini;
        return mock;
      },
      inject: [ConfigService, MockAiProvider, OpenAiProvider, GeminiAiProvider, OpenAiCompatibleProvider],
    },
  ],
  exports: [AiService, AiDataService, AiAnalyticsService],
})
export class AiModule {}

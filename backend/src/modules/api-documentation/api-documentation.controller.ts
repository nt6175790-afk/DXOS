// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Controller, Get, NotFoundException } from '@nestjs/common';
import { reportPaths, reportSchemas } from '../reports/reports.openapi';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../../config/environment';
import { organizationPaths, organizationSchemas } from '../organizations/organizations.openapi';
import { auditPaths, auditSchemas } from '../audit/audit.openapi';
import { notificationPaths, notificationSchemas } from '../notifications/notification.openapi';
import { filePaths, fileSchemas } from '../files/files.openapi';
import { aiActionsPaths } from '../ai/ai-actions.openapi';
import { organizationAccountPaths } from '../rbac/organization-accounts.openapi';
import { aiPaths, aiSchemas } from '../ai/ai.openapi';
import { departmentPaths, departmentSchemas } from '../departments/departments.openapi';
import { employeePaths, employeeSchemas } from '../people/employees.openapi';
import { taskPaths, taskSchemas } from '../work/tasks.openapi';
import { permissionPaths, permissionSchemas } from '../rbac/permissions.openapi';
import { roleAdministrationPaths, roleAdministrationSchemas } from '../rbac/role-administration.openapi';
import { dashboardPaths, dashboardSchemas } from '../dashboard/dashboard.openapi';
import { searchPaths, searchSchemas } from '../search/search.openapi';
import { calendarPaths, calendarSchemas } from '../calendar/calendar.openapi';
import { ssoPaths } from '../auth/sso.openapi';
import { attendancePaths, attendanceSchemas } from '../attendance/attendance.openapi';
import { workflowPaths, workflowSchemas } from '../workflow/workflow.openapi';

@Controller('docs')
export class ApiDocumentationController {
  constructor(private readonly configService: ConfigService) {}

  @Get('openapi.json')
  getOpenApiDocument(): Record<string, unknown> {
    const config = this.configService.getOrThrow<AppConfiguration>('app');

    if (!config.swaggerEnabled) {
      throw new NotFoundException();
    }

    return {
      openapi: '3.0.3',
      info: {
        title: 'DX-OS API',
        version: 'v1',
        description: 'DX-OS platform API foundation',
      },
      servers: [{ url: '/' + config.apiPrefix, description: 'DX-OS API v1' }],
      paths: {
        ...workflowPaths,
        ...attendancePaths,
        ...ssoPaths,
        ...reportPaths,
        ...organizationPaths,
        ...dashboardPaths,
        ...searchPaths,
        ...calendarPaths,
        ...auditPaths,
        ...notificationPaths,
        ...filePaths,
        ...aiPaths, ...aiActionsPaths, ...organizationAccountPaths,
        ...departmentPaths,
        ...employeePaths,
        ...taskPaths,
        ...permissionPaths,
        ...roleAdministrationPaths,
        '/health': {
          get: {
            summary: 'Read API operational health',
            responses: {
              '200': {
                description: 'Operational health response',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HealthResponse' },
                  },
                },
              },
              '500': {
                description: 'Standard DX-OS error envelope',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ErrorEnvelope' },
                  },
                },
              },
            },
          },
        },
        '/auth/login': {
          post: {
            summary: 'Authenticate with an email and password',
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
              },
            },
            responses: {
              '200': {
                description: 'Authenticated token pair',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
                },
              },
              '400': { $ref: '#/components/responses/ErrorResponse' },
              '401': { $ref: '#/components/responses/ErrorResponse' },
              '403': { $ref: '#/components/responses/ErrorResponse' },
              '429': { $ref: '#/components/responses/ErrorResponse' },
              '503': { $ref: '#/components/responses/ErrorResponse' },
              '500': { $ref: '#/components/responses/ErrorResponse' },
            },
          },
        },
        '/auth/refresh': {
          post: {
            summary: 'Rotate an opaque refresh token',
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/RefreshTokenRequest' } },
              },
            },
            responses: {
              '200': {
                description: 'Rotated token pair',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
                },
              },
              '400': { $ref: '#/components/responses/ErrorResponse' },
              '401': { $ref: '#/components/responses/ErrorResponse' },
              '403': { $ref: '#/components/responses/ErrorResponse' },
              '429': { $ref: '#/components/responses/ErrorResponse' },
              '503': { $ref: '#/components/responses/ErrorResponse' },
            },
          },
        },
        '/auth/me': {
          get: {
            summary: 'Read the authenticated identity',
            security: [{ bearerAuth: [] }],
            responses: {
              '200': {
                description: 'Authenticated identity',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/CurrentUser' } },
                },
              },
              '401': { $ref: '#/components/responses/ErrorResponse' },
            },
          },
        },
        '/auth/logout': {
          post: {
            summary: 'Revoke the current authenticated session',
            security: [{ bearerAuth: [] }],
            responses: {
              '204': { description: 'Session revoked' },
              '401': { $ref: '#/components/responses/ErrorResponse' },
            },
          },
        },
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        responses: {
          ErrorResponse: {
            description: 'Standard DX-OS error envelope',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
            },
          },
        },
        schemas: {
          ...workflowSchemas,
          ...reportSchemas,
          ...organizationSchemas,
          ...auditSchemas,
          ...notificationSchemas,
          ...fileSchemas,
          ...aiSchemas,
          ...departmentSchemas,
          ...employeeSchemas,
          ...taskSchemas,
          ...permissionSchemas,
        ...dashboardSchemas,
        ...searchSchemas,
        ...calendarSchemas,
        ...attendanceSchemas,
          ...roleAdministrationSchemas,
          HealthResponse: {
            type: 'object',
            required: ['status', 'service', 'timestamp'],
            properties: {
              status: { type: 'string', enum: ['ok'], example: 'ok' },
              service: { type: 'string', enum: ['dx-os-api'], example: 'dx-os-api' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
          ErrorEnvelope: {
            type: 'object',
            required: ['success', 'error'],
            properties: {
              success: { type: 'boolean', enum: [false] },
              error: {
                type: 'object',
                required: ['code', 'message', 'details', 'requestId'],
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                  requestId: { type: 'string' },
                },
              },
            },
          },
          LoginRequest: {
            type: 'object',
            required: ['email', 'password'],
            additionalProperties: false,
            properties: {
              email: { type: 'string', format: 'email', maxLength: 320 },
              password: { type: 'string', minLength: 1, maxLength: 1024, writeOnly: true },
            },
          },
          RefreshTokenRequest: {
            type: 'object',
            required: ['refreshToken'],
            additionalProperties: false,
            properties: {
              refreshToken: { type: 'string', minLength: 64, maxLength: 512, writeOnly: true },
            },
          },
          AuthResponse: {
            type: 'object',
            required: ['accessToken', 'refreshToken', 'tokenType', 'expiresIn'],
            properties: {
              accessToken: { type: 'string', description: 'JWT access token' },
              refreshToken: { type: 'string', description: 'Opaque refresh token' },
              tokenType: { type: 'string', enum: ['Bearer'] },
              expiresIn: { type: 'integer', minimum: 60, description: 'Access-token lifetime in seconds' },
            },
          },
          CurrentUser: {
            type: 'object',
            required: ['id', 'email', 'displayName', 'accountStatus'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              displayName: { type: ['string', 'null'], maxLength: 200 },
              accountStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
            },
          },
        },
      },
    };
  }
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AutomationEngineService } from './automation-engine.service';
import { AUTOMATION_TRIGGERS } from './automation.types';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';

@Injectable()
export class AutomationSchedulerService {
  private readonly logger = new Logger(AutomationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutomationEngineService,
    private readonly authorization: AuthorizationService,
  ) {}

  async runScan(organizationId: string, actorId: string, specificTrigger?: string) {
    if (!(await this.authorization.can(actorId, PERMISSIONS.AUTOMATION_MANAGE, organizationId))) {
      throw new ForbiddenException();
    }
    return this.scan(organizationId, actorId, specificTrigger);
  }

  // Trusted background entry point; HTTP calls must use runScan with an authenticated actor.
  async runScheduledScan(organizationId: string, specificTrigger?: string) {
    return this.scan(organizationId, 'system', specificTrigger);
  }

  private async scan(organizationId: string, actorId: string, specificTrigger?: string) {
    const summary = {
      scannedAt: new Date(),
      triggersFired: 0,
      details: [] as unknown[],
    };

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // 1. Scan Documents Expiring in 30 days
    if (!specificTrigger || specificTrigger === AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_30D) {
      const docs30 = await this.prisma.employeeDocument.findMany({
        where: {
          organizationId,
          status: 'ACTIVE',
          expiryDate: {
            gt: now,
            lte: in30Days,
          },
        },
        include: {
          employee: {
            select: { id: true, employeeCode: true, displayName: true },
          },
        },
      });

      for (const doc of docs30) {
        const diffMs = doc.expiryDate!.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        const res = await this.engine.dispatchTrigger(
          {
            organizationId,
            trigger: AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_30D,
            entityType: 'EMPLOYEE_DOCUMENT',
            entityId: doc.id,
            data: {
              documentId: doc.id,
              title: doc.title,
              category: doc.category,
              expiryDate: doc.expiryDate?.toISOString().slice(0, 10),
              daysRemaining,
              employeeId: doc.employee.id,
              employeeCode: doc.employee.employeeCode,
              employeeName: doc.employee.displayName,
            },
          },
          actorId,
        );

        if (res.length > 0) {
          summary.triggersFired += res.length;
          summary.details.push({ trigger: AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_30D, docId: doc.id, results: res });
        }
      }
    }

    // 2. Scan Documents Expiring in 7 days
    if (!specificTrigger || specificTrigger === AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_7D) {
      const docs7 = await this.prisma.employeeDocument.findMany({
        where: {
          organizationId,
          status: 'ACTIVE',
          expiryDate: {
            gt: now,
            lte: in7Days,
          },
        },
        include: {
          employee: {
            select: { id: true, employeeCode: true, displayName: true },
          },
        },
      });

      for (const doc of docs7) {
        const diffMs = doc.expiryDate!.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        const res = await this.engine.dispatchTrigger(
          {
            organizationId,
            trigger: AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_7D,
            entityType: 'EMPLOYEE_DOCUMENT',
            entityId: doc.id,
            data: {
              documentId: doc.id,
              title: doc.title,
              category: doc.category,
              expiryDate: doc.expiryDate?.toISOString().slice(0, 10),
              daysRemaining,
              employeeId: doc.employee.id,
              employeeName: doc.employee.displayName,
            },
          },
          actorId,
        );

        if (res.length > 0) {
          summary.triggersFired += res.length;
          summary.details.push({ trigger: AUTOMATION_TRIGGERS.DOCUMENT_EXPIRING_7D, docId: doc.id, results: res });
        }
      }
    }

    // 3. Scan Missing Mandatory Documents
    if (!specificTrigger || specificTrigger === AUTOMATION_TRIGGERS.MISSING_MANDATORY_DOCUMENT) {
      const mandatoryRequirements = await this.prisma.documentRequirement.findMany({
        where: {
          organizationId,
          isRequired: true,
        },
      });

      if (mandatoryRequirements.length > 0) {
        const activeEmployees = await this.prisma.employee.findMany({
          where: { organizationId, status: 'ACTIVE' },
          select: { id: true, displayName: true, employeeCode: true },
          take: 20,
        });

        for (const emp of activeEmployees) {
          const employeeDocs = await this.prisma.employeeDocument.findMany({
            where: { organizationId, employeeId: emp.id, status: 'ACTIVE' },
            select: { category: true },
          });
          const existingCategories = new Set(employeeDocs.map((d) => d.category));

          for (const req of mandatoryRequirements) {
            if (!existingCategories.has(req.category)) {
              const res = await this.engine.dispatchTrigger(
                {
                  organizationId,
                  trigger: AUTOMATION_TRIGGERS.MISSING_MANDATORY_DOCUMENT,
                  entityType: 'EMPLOYEE',
                  entityId: `${emp.id}:${req.category}`,
                  data: {
                    employeeId: emp.id,
                    employeeName: emp.displayName,
                    employeeCode: emp.employeeCode,
                    missingCategory: req.category,
                    requirementName: req.name,
                  },
                },
                actorId,
              );

              if (res.length > 0) {
                summary.triggersFired += res.length;
                summary.details.push({
                  trigger: AUTOMATION_TRIGGERS.MISSING_MANDATORY_DOCUMENT,
                  employeeId: emp.id,
                  category: req.category,
                  results: res,
                });
              }
            }
          }
        }
      }
    }

    return summary;
  }
}

// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { DepartmentsModule } from '../departments/departments.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({ imports: [AuthModule, RbacModule, AuditWriterModule, OrganizationsModule, DepartmentsModule],
  controllers: [EmployeesController], providers: [EmployeesService], exports: [EmployeesService] })
export class PeopleModule {}

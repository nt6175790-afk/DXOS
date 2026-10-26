// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { PeopleModule } from '../people/people.module';
import { DepartmentsModule } from '../departments/departments.module';
import { NotificationModule } from '../notifications/notification.module';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TaskPermissionGuard } from './task-permission.guard';
import { FilesModule } from '../files/files.module';
import { TaskCollaborationService } from './task-collaboration.service';
import { TaskCollaborationController } from './task-collaboration.controller';
import { TaskPlanningService } from './task-planning.service';
import { TaskPlanningController } from './task-planning.controller';
@Module({ imports: [AuthModule, RbacModule, AuditWriterModule, PeopleModule, DepartmentsModule, NotificationModule, FilesModule],
  controllers: [TasksController, TaskCollaborationController, TaskPlanningController], providers: [TasksService, TaskPermissionGuard, TaskCollaborationService, TaskPlanningService], exports: [TasksService] })
export class WorkModule {}

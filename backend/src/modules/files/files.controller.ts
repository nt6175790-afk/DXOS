// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Delete, Get, Header, Param, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationPermissionGuard } from '../rbac/guards/organization-permission.guard';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/permission-catalog';
import { FilesService, ReceivedFile } from './files.service';
import { FileUploadInterceptor } from './file-upload.interceptor';
import { FileListQueryDto } from './file-list.dto';

export class EmptyFileInput {}

@Controller('organizations/:organizationId/files')
@UseGuards(JwtAuthGuard, OrganizationPermissionGuard)
@OrganizationContext()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.FILE_READ)
  list(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') org: string,
    @Query() query: FileListQueryDto) {
    return this.files.list(caller.user.id, org, query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.FILE_UPLOAD)
  @UseInterceptors(FileUploadInterceptor)
  upload(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') org: string,
    @UploadedFile() file: ReceivedFile | undefined, @Query() query: EmptyFileInput, @Body() body: EmptyFileInput) {
    void query; void body;
    return this.files.finish(caller.user.id, org, file);
  }

  @Get(':fileId')
  @RequirePermission(PERMISSIONS.FILE_READ)
  metadata(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') org: string,
    @Param('fileId') id: string, @Query() query: EmptyFileInput) {
    void query; return this.files.metadata(caller.user.id, org, id);
  }

  @Get(':fileId/content')
  @RequirePermission(PERMISSIONS.FILE_READ)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') org: string,
    @Param('fileId') id: string, @Query() query: EmptyFileInput) {
    void query;
    const file = await this.files.download(caller.user.id, org, id);
    return new StreamableFile(file.stream, { type: file.contentType, length: file.size,
      disposition: `attachment; filename="${file.filename}"` });
  }

  @Delete(':fileId')
  @RequirePermission(PERMISSIONS.FILE_DELETE)
  remove(@CurrentUser() caller: AuthenticatedRequestContext, @Param('organizationId') org: string,
    @Param('fileId') id: string, @Query() query: EmptyFileInput, @Body() body: EmptyFileInput) {
    void query; void body; return this.files.remove(caller.user.id, org, id);
  }
}

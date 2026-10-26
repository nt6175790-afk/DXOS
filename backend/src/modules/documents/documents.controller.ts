// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationContext } from '../rbac/decorators/organization-context.decorator';
import {
  CreateDocumentDto,
  CreateDocumentVersionDto,
  DocumentQueryDto,
  UpdateDocumentDto,
} from './documents.dto';
import { DocumentsService } from './documents.service';

@Controller('organizations/:organizationId/documents')
@UseGuards(JwtAuthGuard)
@OrganizationContext()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  list(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Query() query: DocumentQueryDto,
  ) {
    return this.documentsService.list(caller.user.id, orgId, query);
  }

  @Post()
  create(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documentsService.create(caller.user.id, orgId, dto);
  }

  @Get(':id')
  getById(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.documentsService.getById(caller.user.id, orgId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(caller.user.id, orgId, id, dto);
  }

  @Post(':id/versions')
  createVersion(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: CreateDocumentVersionDto,
  ) {
    return this.documentsService.createVersion(caller.user.id, orgId, id, dto);
  }

  @Post(':id/archive')
  archive(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.documentsService.archive(caller.user.id, orgId, id);
  }

  @Post(':id/restore')
  restore(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.documentsService.restore(caller.user.id, orgId, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.documentsService.remove(caller.user.id, orgId, id);
  }

  @Get(':id/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    const file = await this.documentsService.download(caller.user.id, orgId, id);
    return new StreamableFile(file.stream, {
      type: file.contentType,
      length: file.size,
      disposition: `attachment; filename="${encodeURIComponent(file.filename)}"`,
    });
  }

  @Get(':id/versions/:versionId/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async downloadVersion(
    @CurrentUser() caller: AuthenticatedRequestContext,
    @Param('organizationId') orgId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    const file = await this.documentsService.download(caller.user.id, orgId, id, versionId);
    return new StreamableFile(file.stream, {
      type: file.contentType,
      length: file.size,
      disposition: `attachment; filename="${encodeURIComponent(file.filename)}"`,
    });
  }
}

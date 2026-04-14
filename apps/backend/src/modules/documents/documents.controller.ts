import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { DocumentsService } from './documents.service.js';
import { DocumentsRequestPersistenceInterceptor } from './infrastructure/documents-request-persistence.interceptor.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type {
  BaseFilter,
  CreateNumberingRuleRequest,
  CreateTemplateBindingRequest,
  CreateTemplateRequest,
  CreateTemplateVariableRequest,
  CreateTemplateVersionRequest,
  GenerateDocumentRequest,
  UpdateNumberingRuleRequest,
  UpdateTemplateBindingRequest,
  UpdateTemplateRequest,
  UpdateTemplateVariableRequest,
  UpdateTemplateVersionRequest
} from './documents.dto.js';
import type { RequestContext } from '../../common/context/request-context.js';

@Controller()
@UseInterceptors(DocumentsRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documentsService: DocumentsService) {}

  @Get('templates')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTemplates(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listTemplates(c.tenantId!, q);
  }
  @Post('templates')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplate(@CurrentContext() c: RequestContext, @Body() b: CreateTemplateRequest) {
    return this.documentsService.createTemplate(c.tenantId!, c.userId, b, c);
  }
  @Get('templates/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTemplate(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getTemplate(c.tenantId!, id);
  }
  @Patch('templates/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplate(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: UpdateTemplateRequest
  ) {
    return this.documentsService.updateTemplate(c.tenantId!, c.userId, id, b, c);
  }
  @Post('templates/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  archiveTemplate(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.archiveTemplate(c.tenantId!, c.userId, id, c);
  }
  @Post('templates/:id/unarchive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  unarchiveTemplate(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.unarchiveTemplate(c.tenantId!, c.userId, id, c);
  }
  @Post('templates/:id/set-current-version')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  setCurrentVersion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: { templateVersionId: string }
  ) {
    return this.documentsService.setCurrentVersion(c.tenantId!, id, b.templateVersionId);
  }

  @Get('template-versions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTemplateVersions(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listTemplateVersions(c.tenantId!, q);
  }
  @Post('template-versions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplateVersion(
    @CurrentContext() c: RequestContext,
    @Body() b: CreateTemplateVersionRequest
  ) {
    return this.documentsService.createTemplateVersion(c.tenantId!, c.userId, b);
  }
  @Get('template-versions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTemplateVersion(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getTemplateVersion(c.tenantId!, id);
  }
  @Patch('template-versions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplateVersion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: UpdateTemplateVersionRequest
  ) {
    return this.documentsService.updateTemplateVersion(c.tenantId!, id, b);
  }
  @Post('template-versions/:id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  activateVersion(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.activateTemplateVersion(c.tenantId!, id);
  }
  @Post('template-versions/:id/parse-variables')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  parseVariables(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.listTemplateVariables(c.tenantId!, { templateVersionId: id });
  }

  @Get('template-variables')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTemplateVariables(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listTemplateVariables(c.tenantId!, q);
  }
  @Post('template-variables')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplateVariable(
    @CurrentContext() c: RequestContext,
    @Body() b: CreateTemplateVariableRequest
  ) {
    return this.documentsService.createTemplateVariable(c.tenantId!, b);
  }
  @Get('template-variables/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTemplateVariable(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getTemplateVariable(c.tenantId!, id);
  }
  @Patch('template-variables/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplateVariable(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: UpdateTemplateVariableRequest
  ) {
    return this.documentsService.updateTemplateVariable(c.tenantId!, id, b);
  }
  @Delete('template-variables/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  deleteTemplateVariable(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.deleteTemplateVariable(c.tenantId!, id);
  }

  @Get('template-bindings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTemplateBindings(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listTemplateBindings(c.tenantId!, q);
  }
  @Post('template-bindings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplateBinding(
    @CurrentContext() c: RequestContext,
    @Body() b: CreateTemplateBindingRequest
  ) {
    return this.documentsService.createTemplateBinding(c.tenantId!, b);
  }
  @Get('template-bindings/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTemplateBinding(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getTemplateBinding(c.tenantId!, id);
  }
  @Patch('template-bindings/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplateBinding(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: UpdateTemplateBindingRequest
  ) {
    return this.documentsService.updateTemplateBinding(c.tenantId!, id, b);
  }
  @Delete('template-bindings/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  deleteTemplateBinding(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.deleteTemplateBinding(c.tenantId!, id);
  }

  @Get('documents')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listDocuments(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listDocuments(c.tenantId!, q);
  }
  @Get('documents/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getDocument(c.tenantId!, id);
  }
  @Post('documents/generate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.generate')
  generateDocument(@CurrentContext() c: RequestContext, @Body() b: GenerateDocumentRequest) {
    return this.documentsService.generateDocument(c.tenantId!, c.userId, b);
  }
  @Post('documents/:id/finalize')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  finalizeDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.finalizeDocument(c.tenantId!, id);
  }
  @Post('documents/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  archiveDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.archiveDocument(c.tenantId!, id);
  }
  @Get('documents/:id/download')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  downloadDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    const doc = this.documentsService.getDocument(c.tenantId!, id);
    return { downloadUrl: `/api/v1/files/${doc.fileId}/download` };
  }

  @Get('document-tasks')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTasks(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listDocumentTasks(c.tenantId!, q);
  }
  @Get('document-tasks/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTask(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getDocumentTask(c.tenantId!, id);
  }
  @Post('document-tasks/:id/retry')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  retryTask(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.retryTask(c.tenantId!, id);
  }
  @Post('document-tasks/:id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  cancelTask(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.cancelTask(c.tenantId!, id);
  }

  @Get('numbering-rules')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listRules(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listNumberingRules(c.tenantId!, q);
  }
  @Post('numbering-rules')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createRule(@CurrentContext() c: RequestContext, @Body() b: CreateNumberingRuleRequest) {
    return this.documentsService.createNumberingRule(c.tenantId!, b);
  }
  @Get('numbering-rules/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getRule(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getNumberingRule(c.tenantId!, id);
  }
  @Patch('numbering-rules/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchRule(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: UpdateNumberingRuleRequest
  ) {
    return this.documentsService.updateNumberingRule(c.tenantId!, id, b);
  }
  @Post('numbering-rules/:id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  activateRule(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.activateNumberingRule(c.tenantId!, id);
  }
  @Post('numbering-rules/:id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  deactivateRule(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.deactivateNumberingRule(c.tenantId!, id);
  }
}

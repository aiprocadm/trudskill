import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import {
  DocumentsService,
  type IssueGroupOrderRequest,
  type IssuedDocumentFilter
} from './documents.service.js';
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
  GenerateDocumentsBatchRequest,
  UpdateNumberingRuleRequest,
  UpdateTemplateBindingRequest,
  UpdateTemplateRequest,
  UpdateTemplateVariableRequest,
  UpdateTemplateVersionRequest
} from './documents.dto.js';
import type { RequestContext } from '../../common/context/request-context.js';

/** Hard cap для CSV-экспорта книги выдачи — защита от DoS на больших тенантах. */
export const ISSUANCE_JOURNAL_CSV_HARD_CAP = 10000;

/** Заголовки CSV в книге выдачи (точный порядок столбцов). */
export const ISSUANCE_JOURNAL_CSV_HEADER =
  '№;Дата выдачи;№ документа;Тип документа;Статус;ID документа;ID группового приказа';

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
    return this.documentsService.generateDocument(c.tenantId!, c.userId, b, c);
  }
  @Post('documents/generate/batch')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.generate')
  generateDocumentsBatch(
    @CurrentContext() c: RequestContext,
    @Body() b: GenerateDocumentsBatchRequest
  ) {
    return this.documentsService.generateDocumentsBatch(c.tenantId!, c.userId, b, c);
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

  // ==========================================================================
  // Pillar A Plan B §5.6 — книга выдачи документов (issuance journal).
  // ==========================================================================

  @Get('admin/documents/issuance-journal')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listIssuanceJournal(
    @CurrentContext() c: RequestContext,
    @Query() q: Record<string, string | string[] | undefined>
  ) {
    return this.documentsService.listIssuedDocuments(c.tenantId!, parseIssuanceFilter(q));
  }

  @Get('admin/documents/issuance-journal.csv')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="issuance-journal.csv"')
  exportIssuanceJournalCsv(
    @CurrentContext() c: RequestContext,
    @Query() q: Record<string, string | string[] | undefined>
  ): string {
    const filter = parseIssuanceFilter(q);
    const page = this.documentsService.listIssuedDocuments(c.tenantId!, {
      ...filter,
      limit: ISSUANCE_JOURNAL_CSV_HARD_CAP,
      offset: 0
    });
    return renderIssuanceJournalCsv(page.items);
  }

  // ==========================================================================
  // Pillar A Plan B §5.7 — групповые приказы (issueGroupOrder).
  // ==========================================================================

  @Post('admin/documents/group-orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  issueGroupOrder(@CurrentContext() c: RequestContext, @Body() b: IssueGroupOrderRequest) {
    return this.documentsService.issueGroupOrder(c.tenantId!, c.userId, b, c);
  }
}

// ============================================================================
// Pillar A Plan B §5.6 — utilities для книги выдачи. Экспортируются для
// использования в unit-тестах CSV-рендеринга.
// ============================================================================

function parseIssuanceFilter(
  query: Record<string, string | string[] | undefined>
): IssuedDocumentFilter {
  const asArray = (v: string | string[] | undefined): string[] | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v : [v];
  const asString = (v: string | string[] | undefined): string | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v[0] : v;
  const asInt = (v: string | string[] | undefined): number | undefined => {
    const s = asString(v);
    if (s === undefined) return undefined;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    from: asString(query.from),
    to: asString(query.to),
    types: asArray(query.types),
    status: asString(query.status),
    groupOrderDocumentId: asString(query.groupOrderDocumentId),
    limit: asInt(query.limit),
    offset: asInt(query.offset)
  };
}

function csvEscape(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Рендерит CSV для книги выдачи с UTF-8 BOM и `;`-разделителем — формат,
 * который Excel в русской локали корректно открывает без manual import wizard'а.
 */
export function renderIssuanceJournalCsv(
  rows: Array<{
    id: string;
    documentNumber?: string;
    documentType?: string;
    status?: string;
    documentDate?: string;
    groupOrderDocumentId?: string;
  }>
): string {
  const body = rows.map((d, idx) =>
    [
      String(idx + 1),
      d.documentDate ?? '',
      csvEscape(d.documentNumber ?? ''),
      d.documentType ?? '',
      d.status ?? '',
      d.id,
      d.groupOrderDocumentId ?? ''
    ].join(';')
  );
  // ﻿ — UTF-8 BOM. Excel в русской локали без BOM по умолчанию пытается
  // декодировать как Windows-1251 и ломает кириллицу.
  return '﻿' + [ISSUANCE_JOURNAL_CSV_HEADER, ...body].join('\r\n');
}

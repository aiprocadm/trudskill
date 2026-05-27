import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';

import { DOCUMENTS_STATE } from './documents-state.token.js';
import {
  type BaseFilter,
  type CreateNumberingRuleRequest,
  type CreateTemplateBindingRequest,
  type CreateTemplateRequest,
  type CreateTemplateVariableRequest,
  type CreateTemplateVersionRequest,
  type GenerateDocumentRequest,
  type GenerateDocumentsBatchRequest,
  type UpdateNumberingRuleRequest,
  type UpdateTemplateBindingRequest,
  type UpdateTemplateRequest,
  type UpdateTemplateVariableRequest,
  type UpdateTemplateVersionRequest,
  assertTemplateType,
  assertVariableCategoryCode
} from './documents.dto.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type {
  DocumentGenerationTaskEntity,
  GeneratedDocumentEntity,
  NumberReservationEntity,
  NumberingRuleEntity,
  TemplateBindingEntity,
  TemplateEntity,
  TemplateVariableEntity,
  TemplateVersionEntity
} from './documents.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

const ASYNC_TASK_STATUS_CHANGED_EVENT = 'async_task.status_changed';

/** Pillar A Plan B §5.6 — фильтры книги выдачи документов. */
export interface IssuedDocumentFilter {
  /** ISO date (YYYY-MM-DD), inclusive. */
  from?: string;
  /** ISO date (YYYY-MM-DD), inclusive. */
  to?: string;
  /** documentType filter (multi). Пустой массив трактуется как «без фильтра». */
  types?: string[];
  /** exact status match. */
  status?: string;
  /** Все удостоверения, выпущенные по одному групповому приказу. */
  groupOrderDocumentId?: string;
  /** Лимит на страницу (default — все строки). */
  limit?: number;
  /** Смещение в отсортированном списке. */
  offset?: number;
}

export interface IssuedDocumentsPage {
  items: GeneratedDocumentEntity[];
  total: number;
}

/**
 * Pillar A Plan C §5.8 — результат публичной QR-проверки.
 * Не раскрывает tenantId / СНИЛС / другие чувствительные поля — только то,
 * что есть на бумажном удостоверении: ФИО, программа, часы, № и дата.
 */
export interface PublicVerifyResult {
  status: 'valid' | 'revoked' | 'not_found';
  documentId?: string;
  documentNumber?: string;
  documentType?: string;
  issueDate?: string;
  /** Из source enrollment → mvp.learners. Резолвится caller'ом / адаптером (Plan C MVP — заглушка). */
  learnerFullName?: string;
  /** Из source enrollment → group → course → program meta. Caller adapter. */
  programTitle?: string;
  academicHours?: number;
  /** Краткое имя выдавшей организации (без tenant_id). */
  issuerName?: string;
  /** Заполнены только для status='revoked'. */
  revokedAt?: string;
  revocationReason?: string;
}

/** Pillar A Plan B §5.7 — атомарный выпуск группового приказа + каскад удостоверений. */
export interface IssueGroupOrderRequest {
  groupId: string;
  /** Шаблон приказа — должен быть templateType='order'. */
  templateId: string;
  /** Enrollment-ы, для которых нужно выпустить удостоверение. Caller отвечает за фильтрацию по status='completed'. */
  enrollmentIds: string[];
  /** Опциональный шаблон удостоверения; если не задан — только приказ без каскада. */
  certificateTemplateId?: string;
}

export interface IssueGroupOrderResult {
  order: GeneratedDocumentEntity;
  certificates: GeneratedDocumentEntity[];
  /** true если ордер уже существовал (идемпотентный повтор). */
  alreadyExisted: boolean;
}

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DOCUMENTS_STATE) private readonly state: InMemoryDocumentsState,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(RealtimeEventsService) private readonly realtimeEvents: RealtimeEventsService,
    @Inject(MetricsService) @Optional() private readonly metrics?: MetricsService
  ) {}

  listTemplates(tenantId: string, query: BaseFilter) {
    return this.page(
      this.state.templates.filter((x) => x.tenantId === tenantId),
      query
    );
  }
  createTemplate(
    tenantId: string,
    actorId: string | undefined,
    req: CreateTemplateRequest,
    ctx: RequestContext
  ) {
    assertTemplateType(req.templateType);
    const now = this.now();
    const entity: TemplateEntity = {
      id: this.id('tpl'),
      tenantId,
      name: req.name,
      templateType: req.templateType,
      description: req.description,
      status: 'active',
      createdBy: actorId,
      createdAt: now,
      updatedAt: now
    };
    this.state.templates.push(entity);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_created',
      entityType: 'documents.template',
      entityId: entity.id,
      newValues: entity as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return entity;
  }
  getTemplate(tenantId: string, id: string) {
    return this.must(this.state.templates, tenantId, id);
  }
  updateTemplate(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: UpdateTemplateRequest,
    ctx: RequestContext
  ) {
    const current = this.getTemplate(tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, req, { updatedAt: this.now() });
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_updated',
      entityType: 'documents.template',
      entityId: id,
      oldValues,
      newValues: current as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return current;
  }
  archiveTemplate(tenantId: string, actorId: string | undefined, id: string, ctx: RequestContext) {
    return this.updateTemplate(tenantId, actorId, id, { status: 'archived' }, ctx);
  }
  unarchiveTemplate(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    return this.updateTemplate(tenantId, actorId, id, { status: 'active' }, ctx);
  }
  setCurrentVersion(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    versionId: string,
    ctx: RequestContext
  ) {
    const tpl = this.getTemplate(tenantId, id);
    const version = this.must(this.state.versions, tenantId, versionId);
    if (version.templateId !== id) throw new BadRequestException('Template version mismatch');
    const oldVersion = tpl.currentVersionId;
    tpl.currentVersionId = version.id;
    tpl.updatedAt = this.now();
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_version_set_current',
      entityType: 'documents.template',
      entityId: id,
      oldValues: { currentVersionId: oldVersion },
      newValues: { currentVersionId: version.id },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return tpl;
  }

  listTemplateVersions(tenantId: string, query: BaseFilter) {
    const rows = this.state.versions.filter(
      (x) => x.tenantId === tenantId && (!query.templateId || query.templateId === x.templateId)
    );
    return this.page(rows, query);
  }
  createTemplateVersion(
    tenantId: string,
    actorId: string | undefined,
    req: CreateTemplateVersionRequest
  ) {
    this.getTemplate(tenantId, req.templateId);
    const entity: TemplateVersionEntity = {
      id: this.id('tplv'),
      tenantId,
      templateId: req.templateId,
      versionNo: this.state.versions.filter((x) => x.templateId === req.templateId).length + 1,
      fileId: req.fileId,
      variablesSchema: req.variablesSchema ?? {},
      isActive: false,
      createdBy: actorId,
      createdAt: this.now()
    };
    this.state.versions.push(entity);
    return entity;
  }
  getTemplateVersion(tenantId: string, id: string) {
    return this.must(this.state.versions, tenantId, id);
  }
  updateTemplateVersion(tenantId: string, id: string, req: UpdateTemplateVersionRequest) {
    const v = this.getTemplateVersion(tenantId, id);
    if (req.variablesSchema) v.variablesSchema = req.variablesSchema;
    if (typeof req.isActive === 'boolean') v.isActive = req.isActive;
    return v;
  }
  activateTemplateVersion(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const version = this.getTemplateVersion(tenantId, id);
    this.state.versions
      .filter((x) => x.tenantId === tenantId && x.templateId === version.templateId)
      .forEach((x) => {
        x.isActive = x.id === id;
      });
    this.setCurrentVersion(tenantId, actorId, version.templateId, id, ctx);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_version_activated',
      entityType: 'documents.template_version',
      entityId: id,
      newValues: { templateId: version.templateId, isActive: true },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return version;
  }

  listTemplateVariables(tenantId: string, query: BaseFilter) {
    const rows = this.state.variables.filter(
      (x) =>
        x.tenantId === tenantId &&
        !x.deletedAt &&
        (!query.templateVersionId || query.templateVersionId === x.templateVersionId)
    );
    return this.page(rows, query);
  }
  createTemplateVariable(tenantId: string, req: CreateTemplateVariableRequest) {
    this.getTemplateVersion(tenantId, req.templateVersionId);
    assertVariableCategoryCode(req.categoryCode);
    const duplicate = this.state.variables.find(
      (x) =>
        x.tenantId === tenantId &&
        x.templateVersionId === req.templateVersionId &&
        x.variableCode === req.variableCode &&
        !x.deletedAt
    );
    if (duplicate) throw new ConflictException('Variable code already exists');
    const entity: TemplateVariableEntity = {
      id: this.id('tplvar'),
      tenantId,
      templateVersionId: req.templateVersionId,
      variableCode: req.variableCode,
      displayName: req.displayName,
      categoryCode: req.categoryCode,
      dataType: req.dataType,
      isRequired: req.isRequired ?? false,
      description: req.description
    };
    this.state.variables.push(entity);
    return entity;
  }
  getTemplateVariable(tenantId: string, id: string) {
    return this.must(
      this.state.variables.filter((x) => !x.deletedAt),
      tenantId,
      id
    );
  }
  updateTemplateVariable(tenantId: string, id: string, req: UpdateTemplateVariableRequest) {
    const row = this.getTemplateVariable(tenantId, id);
    if (req.categoryCode !== undefined) {
      assertVariableCategoryCode(req.categoryCode);
    }
    Object.assign(row, req);
    return row;
  }
  deleteTemplateVariable(tenantId: string, id: string) {
    const row = this.getTemplateVariable(tenantId, id);
    row.deletedAt = this.now();
    return { deleted: true };
  }

  listTemplateBindings(tenantId: string, query: BaseFilter) {
    return this.page(
      this.state.bindings.filter((x) => x.tenantId === tenantId),
      query
    );
  }
  createTemplateBinding(tenantId: string, req: CreateTemplateBindingRequest) {
    this.getTemplate(tenantId, req.templateId);
    this.validateBindingPayload(req.bindType, req.directionId, req.courseId, req.groupId);
    const entity: TemplateBindingEntity = {
      id: this.id('tplbind'),
      tenantId,
      templateId: req.templateId,
      bindType: req.bindType,
      directionId: req.directionId,
      courseId: req.courseId,
      groupId: req.groupId,
      attachMode: req.attachMode ?? 'strict',
      inheritToChildren: req.inheritToChildren ?? false,
      priority: req.priority ?? 100,
      createdAt: this.now()
    };
    this.state.bindings.push(entity);
    return entity;
  }
  getTemplateBinding(tenantId: string, id: string) {
    return this.must(this.state.bindings, tenantId, id);
  }
  updateTemplateBinding(tenantId: string, id: string, req: UpdateTemplateBindingRequest) {
    const row = this.getTemplateBinding(tenantId, id);
    Object.assign(row, req);
    this.validateBindingPayload(row.bindType, row.directionId, row.courseId, row.groupId);
    return row;
  }
  deleteTemplateBinding(tenantId: string, id: string) {
    this.getTemplateBinding(tenantId, id);
    this.state.bindings = this.state.bindings.filter(
      (x) => !(x.tenantId === tenantId && x.id === id)
    );
    return { deleted: true };
  }

  listDocumentTasks(tenantId: string, query: BaseFilter) {
    return this.page(
      this.state.tasks.filter((x) => x.tenantId === tenantId),
      query
    );
  }
  getDocumentTask(tenantId: string, id: string) {
    return this.must(this.state.tasks, tenantId, id);
  }
  retryTask(tenantId: string, id: string) {
    const task = this.getDocumentTask(tenantId, id);
    if (task.status !== 'failed')
      throw new BadRequestException('Retry allowed only for failed tasks');
    task.status = 'queued';
    this.publishTaskEvent(task);
    task.errorMessage = undefined;
    task.startedAt = undefined;
    task.finishedAt = undefined;
    this.metrics?.incrementJobRetry({ queue: 'documents_generation' });
    this.writeTaskAudit(task, 'documents.task.retried');
    return task;
  }
  cancelTask(tenantId: string, id: string) {
    const task = this.getDocumentTask(tenantId, id);
    if (!['queued', 'running'].includes(task.status)) {
      throw new BadRequestException('Cancel allowed only for queued or running tasks');
    }
    task.status = 'cancelled';
    this.publishTaskEvent(task);
    task.finishedAt = this.now();
    this.writeTaskAudit(task, 'documents.task.cancelled');
    return task;
  }

  listDocuments(tenantId: string, query: BaseFilter) {
    const rows = this.state.generatedDocuments.filter(
      (x) =>
        x.tenantId === tenantId &&
        (!query.documentType || x.documentType === query.documentType) &&
        (!query.sourceEntityType || x.sourceEntityType === query.sourceEntityType) &&
        (!query.sourceEntityId || x.sourceEntityId === query.sourceEntityId)
    );
    return this.page(rows, query);
  }

  /**
   * Pillar A Plan B §5.6 — книга выдачи документов. Возвращает GeneratedDocumentEntity
   * прямо из state (без обогащения join'ами), отсортированные по documentDate desc.
   *
   * Caller (controller или frontend) при необходимости обогащает строки именами
   * учеников/программ через mvpService — это не coupling-free, но соответствует
   * принятому паттерну в codebase: documents-сервис не знает о mvp-state.
   */
  listIssuedDocuments(tenantId: string, filter: IssuedDocumentFilter): IssuedDocumentsPage {
    let rows = this.state.generatedDocuments.filter((d) => d.tenantId === tenantId);

    if (filter.from) {
      const from = filter.from;
      rows = rows.filter((d) => d.documentDate !== undefined && d.documentDate >= from);
    }
    if (filter.to) {
      const to = filter.to;
      rows = rows.filter((d) => d.documentDate !== undefined && d.documentDate <= to);
    }
    if (filter.types && filter.types.length > 0) {
      const set = new Set(filter.types);
      rows = rows.filter((d) => set.has(d.documentType));
    }
    if (filter.status) {
      rows = rows.filter((d) => d.status === filter.status);
    }
    if (filter.groupOrderDocumentId) {
      rows = rows.filter((d) => d.groupOrderDocumentId === filter.groupOrderDocumentId);
    }

    rows.sort((a, b) => {
      const aDate = a.documentDate ?? '';
      const bDate = b.documentDate ?? '';
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });

    const total = rows.length;
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = filter.limit !== undefined && filter.limit > 0 ? filter.limit : total;
    return {
      items: rows.slice(offset, offset + limit),
      total
    };
  }

  getDocument(tenantId: string, id: string) {
    return this.must(this.state.generatedDocuments, tenantId, id);
  }
  generateDocument(
    tenantId: string,
    actorId: string | undefined,
    req: GenerateDocumentRequest,
    ctx?: RequestContext
  ) {
    this.cleanupIdempotencyCache();
    const idemKey = `${tenantId}:${req.idempotencyKey}`;
    const existing = this.state.idem.get(idemKey);
    if (existing && existing.expiresAt > Date.now())
      return this.getDocumentTask(tenantId, existing.taskId);
    const template = this.getTemplate(tenantId, req.templateId);
    if (template.status === 'archived')
      throw new BadRequestException('Cannot generate documents from archived template');
    const versionId = req.templateVersionId ?? template.currentVersionId;
    if (!versionId) throw new BadRequestException('No template version selected');
    this.getTemplateVersion(tenantId, versionId);
    const task: DocumentGenerationTaskEntity = {
      id: this.id('dtask'),
      tenantId,
      templateId: template.id,
      templateVersionId: versionId,
      documentType: req.documentType,
      taskType: 'generate',
      sourceEntityType: req.sourceEntityType,
      sourceEntityId: req.sourceEntityId,
      status: 'queued',
      requestedBy: actorId,
      requestedAt: this.now(),
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      outboxPayload: {
        request_id: ctx?.requestId,
        correlation_id: ctx?.correlationId,
        enqueued_at: this.now()
      }
    };
    this.state.tasks.push(task);
    this.state.idem.set(idemKey, { taskId: task.id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    this.writeTaskAudit(task, 'documents.task.created');
    return task;
  }

  generateDocumentsBatch(
    tenantId: string,
    actorId: string | undefined,
    req: GenerateDocumentsBatchRequest,
    ctx?: RequestContext
  ) {
    const sourceIds = req.sourceEntityIds.map((item) => item.trim()).filter(Boolean);
    const batchBaseTime = Date.now();
    return {
      items: sourceIds.map((sourceEntityId, index) =>
        this.generateDocument(
          tenantId,
          actorId,
          {
            templateId: req.templateId,
            templateVersionId: req.templateVersionId,
            sourceEntityType: req.sourceEntityType,
            sourceEntityId,
            documentType: req.documentType,
            idempotencyKey: `${sourceEntityId}-${batchBaseTime}-${index}`
          },
          ctx
        )
      )
    };
  }

  completeTask(tenantId: string, taskId: string, fileId: string, generatedBy?: string) {
    this.startTask(tenantId, taskId);
    const task = this.getDocumentTask(tenantId, taskId);
    if (task.status === 'completed') return this.getDocument(tenantId, task.generatedDocumentId!);
    if (task.status !== 'running') throw new BadRequestException('Task state is not processable');
    const reserved = task.numberReservationId
      ? this.getReservation(tenantId, task.numberReservationId)
      : this.reserveNumber(tenantId, task.documentType);
    task.numberReservationId = reserved.id;
    const generated: GeneratedDocumentEntity = {
      id: this.id('gdoc'),
      tenantId,
      templateId: task.templateId,
      templateVersionId: task.templateVersionId!,
      documentType: task.documentType,
      name: `Document ${reserved.reservedNumber}`,
      sourceEntityType: task.sourceEntityType,
      sourceEntityId: task.sourceEntityId,
      fileId,
      status: 'generated',
      documentNumber: reserved.reservedNumber,
      documentDate: this.now().slice(0, 10),
      isFinal: false,
      generatedBy,
      generatedAt: this.now(),
      qrToken: this.generateQrToken()
    };
    this.state.generatedDocuments.push(generated);
    task.status = 'completed';
    this.publishTaskEvent(task);
    task.finishedAt = this.now();
    task.generatedDocumentId = generated.id;
    reserved.status = 'used';
    reserved.documentId = generated.id;
    reserved.usedAt = this.now();
    this.writeTaskAudit(task, 'documents.task.completed', { generatedDocumentId: generated.id });
    return generated;
  }
  startTask(tenantId: string, id: string) {
    const task = this.getDocumentTask(tenantId, id);
    if (task.status === 'completed' || task.status === 'failed')
      throw new BadRequestException('Terminal task cannot be started');
    if (task.status === 'running') return task;
    task.status = 'running';
    this.publishTaskEvent(task);
    task.startedAt = task.startedAt ?? this.now();
    this.metrics?.observeQueueLag(Date.now() - Date.parse(task.requestedAt), {
      queue: 'documents_generation'
    });
    if (!task.numberReservationId) {
      task.numberReservationId = this.reserveNumber(tenantId, task.documentType).id;
    }
    this.writeTaskAudit(task, 'documents.task.started');
    return task;
  }
  failTask(tenantId: string, id: string, message: string) {
    const task = this.getDocumentTask(tenantId, id);
    if (task.status === 'completed')
      throw new BadRequestException('Completed task cannot be failed');
    task.status = 'failed';
    this.publishTaskEvent(task);
    task.errorMessage = message;
    task.finishedAt = this.now();
    if (task.numberReservationId) {
      const reservation = this.getReservation(tenantId, task.numberReservationId);
      if (reservation.status === 'reserved') reservation.status = 'failed';
    }
    this.metrics?.incrementDocumentGenerationFailure({ queue: 'documents_generation' });
    this.writeTaskAudit(task, 'documents.task.failed', { errorMessage: message });
    return task;
  }
  async finalizeDocument(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived')
      throw new BadRequestException('Archived document cannot be finalized');
    const oldValues = { status: doc.status, isFinal: doc.isFinal };
    doc.status = 'final';
    doc.isFinal = true;
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'documents.finalized',
      entityType: 'documents.generated',
      entityId: id,
      oldValues,
      newValues: { status: doc.status, isFinal: doc.isFinal },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return doc;
  }
  async archiveDocument(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived') return doc;
    const oldStatus = doc.status;
    doc.status = 'archived';
    doc.archivedAt = this.now();
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'documents.archived',
      entityType: 'documents.generated',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: { status: 'archived', archivedAt: doc.archivedAt },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return doc;
  }

  listNumberingRules(tenantId: string, query: BaseFilter) {
    return this.page(
      this.state.numberingRules.filter((x) => x.tenantId === tenantId),
      query
    );
  }
  createNumberingRule(tenantId: string, req: CreateNumberingRuleRequest) {
    this.state.numberingRules
      .filter((x) => x.tenantId === tenantId && x.documentType === req.documentType)
      .forEach((x) => {
        x.isActive = false;
        x.updatedAt = this.now();
      });
    const entity: NumberingRuleEntity = {
      id: this.id('nrule'),
      tenantId,
      documentType: req.documentType,
      prefix: req.prefix ?? '',
      suffix: req.suffix ?? '',
      pattern: req.pattern ?? '{prefix}{counter}{suffix}',
      currentCounter: 0,
      resetPeriod: req.resetPeriod ?? 'none',
      isActive: true,
      updatedAt: this.now()
    };
    this.state.numberingRules.push(entity);
    return entity;
  }
  getNumberingRule(tenantId: string, id: string) {
    return this.must(this.state.numberingRules, tenantId, id);
  }
  updateNumberingRule(tenantId: string, id: string, req: UpdateNumberingRuleRequest) {
    const row = this.getNumberingRule(tenantId, id);
    Object.assign(row, req, { updatedAt: this.now() });
    return row;
  }
  activateNumberingRule(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const row = this.getNumberingRule(tenantId, id);
    this.state.numberingRules
      .filter((x) => x.tenantId === tenantId && x.documentType === row.documentType)
      .forEach((x) => {
        x.isActive = x.id === id;
        x.updatedAt = this.now();
      });
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.numbering_rule_activated',
      entityType: 'documents.numbering_rule',
      entityId: id,
      newValues: { documentType: row.documentType, isActive: true },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return row;
  }
  deactivateNumberingRule(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const row = this.getNumberingRule(tenantId, id);
    row.isActive = false;
    row.updatedAt = this.now();
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.numbering_rule_deactivated',
      entityType: 'documents.numbering_rule',
      entityId: id,
      newValues: { isActive: false },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return row;
  }

  reserveNumber(tenantId: string, documentType: string) {
    let rule = this.state.numberingRules.find(
      (x) => x.tenantId === tenantId && x.documentType === documentType && x.isActive
    );
    if (!rule) {
      // Default-rule с documentType в префиксе — иначе разные типы документов
      // в рамках одного tenant'а коллидируют по reservedNumber ('000001').
      // Pillar A Plan B §5.7: issueGroupOrder выпускает order + certificate
      // в одной операции, и оба нуждаются в номере — без префикса всё ломается.
      rule = {
        id: this.id('nrule'),
        tenantId,
        documentType,
        prefix: `${documentType.toUpperCase()}-`,
        suffix: '',
        pattern: '{prefix}{counter}{suffix}',
        currentCounter: 0,
        resetPeriod: 'none',
        isActive: true,
        updatedAt: this.now()
      };
      this.state.numberingRules.push(rule);
    }
    const periodKey = this.periodKey(rule.resetPeriod);
    if (rule.periodKey && rule.periodKey !== periodKey) rule.currentCounter = 0;
    rule.periodKey = periodKey;
    rule.currentCounter += 1;
    const counter = `${rule.currentCounter}`.padStart(6, '0');
    const formatted = rule.pattern
      .replace('{prefix}', rule.prefix)
      .replace('{suffix}', rule.suffix)
      .replace('{counter}', counter);
    if (
      this.state.reservations.some((x) => x.tenantId === tenantId && x.reservedNumber === formatted)
    ) {
      throw new ConflictException(`Reservation number ${formatted} already exists`);
    }
    const reservation: NumberReservationEntity = {
      id: this.id('nres'),
      tenantId,
      ruleId: rule.id,
      reservedNumber: formatted,
      reservedAt: this.now(),
      status: 'reserved'
    };
    this.state.reservations.push(reservation);
    return reservation;
  }
  getReservation(tenantId: string, reservationId: string) {
    return this.must(this.state.reservations, tenantId, reservationId);
  }
  /** Подбор шаблона сертификата: сначала привязки к курсам программы, затем к группе. */
  resolveAutoCertificateTemplateBinding(
    tenantId: string,
    groupId: string,
    courseIdsInGroup: string[]
  ): { templateId: string } | null {
    const courseBindings = this.state.bindings.filter(
      (b) =>
        b.tenantId === tenantId &&
        b.bindType === 'course' &&
        b.courseId &&
        courseIdsInGroup.includes(b.courseId)
    );
    const coursePick = this.pickBestCertificateBinding(tenantId, courseBindings);
    if (coursePick) return { templateId: coursePick.templateId };
    const groupBindings = this.state.bindings.filter(
      (b) => b.tenantId === tenantId && b.bindType === 'group' && b.groupId === groupId
    );
    const groupPick = this.pickBestCertificateBinding(tenantId, groupBindings);
    return groupPick ? { templateId: groupPick.templateId } : null;
  }

  private pickBestCertificateBinding(
    tenantId: string,
    candidates: TemplateBindingEntity[]
  ): TemplateBindingEntity | null {
    let best: TemplateBindingEntity | null = null;
    let bestPriority = -Infinity;
    for (const b of candidates) {
      const tpl = this.state.templates.find(
        (t) => t.tenantId === tenantId && t.id === b.templateId
      );
      if (!tpl || tpl.status !== 'active' || tpl.templateType !== 'certificate') continue;
      if (b.priority > bestPriority) {
        bestPriority = b.priority;
        best = b;
      }
    }
    return best;
  }

  resolveTemplateVariables(
    tenantId: string,
    templateVersionId: string,
    payload: Record<string, unknown>
  ): Record<string, unknown> {
    const version = this.getTemplateVersion(tenantId, templateVersionId);
    const variables = this.state.variables.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.templateVersionId === templateVersionId &&
        !item.deletedAt
    );
    const resolved: Record<string, unknown> = { ...payload };
    const schemaVariables = Array.isArray(version.variablesSchema.variables)
      ? (version.variablesSchema.variables as Array<{ code?: string; required?: boolean }>)
      : [];
    const missing = new Set<string>();

    for (const variable of variables) {
      if (variable.isRequired && resolved[variable.variableCode] === undefined) {
        missing.add(variable.variableCode);
      }
    }
    for (const variable of schemaVariables) {
      if (variable.required && variable.code && resolved[variable.code] === undefined) {
        missing.add(variable.code);
      }
    }

    if (missing.size) {
      throw new BadRequestException(`Required variables are missing: ${[...missing].join(', ')}`);
    }

    return {
      ...resolved,
      __snapshot: {
        templateVersionId,
        resolvedAt: this.now()
      }
    };
  }

  private periodKey(reset: 'none' | 'year' | 'month') {
    const d = new Date();
    if (reset === 'year') return `${d.getUTCFullYear()}`;
    if (reset === 'month')
      return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, '0')}`;
    return 'all';
  }
  private page<T>(rows: T[], query: BaseFilter) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.toLowerCase();
    const filtered = search
      ? rows.filter((x) => JSON.stringify(x).toLowerCase().includes(search))
      : rows;
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: filtered.length
    };
  }
  private must<T extends { tenantId: string; id: string }>(arr: T[], tenantId: string, id: string) {
    const row = arr.find((x) => x.tenantId === tenantId && x.id === id);
    if (!row) throw new NotFoundException(`Entity ${id} not found`);
    return row;
  }
  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
  private now() {
    return new Date().toISOString();
  }

  /**
   * Pillar A Plan C §5.8 — генерация публичного токена для QR-проверки.
   * 16 байт = 128 бит энтропии, base64url ≈ 22 символа без =-паддинга.
   * Уникальность гарантируется partial unique index (migration 0033) + 128 бит
   * делают коллизию практически невозможной (≈10^38 пар нужно для 50% chance).
   */
  private generateQrToken(): string {
    return randomBytes(16).toString('base64url');
  }

  private publishTaskEvent(task: DocumentGenerationTaskEntity) {
    this.realtimeEvents.publish({
      event_name: ASYNC_TASK_STATUS_CHANGED_EVENT,
      version: 'v1',
      tenant_id: task.tenantId,
      occurred_at: this.now(),
      payload: {
        task_id: task.id,
        status: task.status,
        source: task.sourceEntityType,
        request_id: task.requestId,
        correlation_id: task.correlationId
      }
    });
  }
  private writeTaskAudit(
    task: DocumentGenerationTaskEntity,
    action: string,
    extras?: Record<string, unknown>
  ) {
    this.auditService.write({
      tenantId: task.tenantId,
      actorId: task.requestedBy,
      action,
      entityType: 'document_task',
      entityId: task.id,
      newValues: {
        status: task.status,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        requestId: task.requestId,
        correlationId: task.correlationId,
        ...extras
      },
      requestId: task.requestId,
      correlationId: task.correlationId
    });
  }

  private cleanupIdempotencyCache() {
    const now = Date.now();
    for (const [key, value] of this.state.idem.entries()) {
      if (value.expiresAt <= now) this.state.idem.delete(key);
    }
  }

  private validateBindingPayload(
    bindType: 'direction' | 'course' | 'group',
    directionId?: string,
    courseId?: string,
    groupId?: string
  ) {
    if (bindType === 'direction' && !directionId)
      throw new BadRequestException('directionId is required for direction binding');
    if (bindType === 'course' && !courseId)
      throw new BadRequestException('courseId is required for course binding');
    if (bindType === 'group' && !groupId)
      throw new BadRequestException('groupId is required for group binding');
  }

  // ==========================================================================
  // Pillar A Plan C §5.9 — аннулирование и перевыпуск.
  // ==========================================================================

  /**
   * Аннулирует документ. State-machine: generated/final → revoked; повтор → 409.
   * archived → 422 (no-op revoke на архивных — недопустимо без отдельного бизнес-кейса).
   * Reason обязательна (валидируется здесь — UI тоже проверяет, но defence in depth).
   */
  async revokeDocument(
    tenantId: string,
    actorId: string | undefined,
    documentId: string,
    reason: string,
    ctx: RequestContext
  ): Promise<GeneratedDocumentEntity> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException({
        code: 'revocation_reason_required',
        message: 'Причина аннулирования обязательна'
      });
    }
    const doc = this.must(this.state.generatedDocuments, tenantId, documentId);
    if (doc.status === 'revoked') {
      throw new ConflictException({
        code: 'already_revoked',
        message: 'Документ уже аннулирован'
      });
    }
    if (doc.status === 'archived') {
      throw new BadRequestException({
        code: 'cannot_revoke_archived',
        message: 'Нельзя аннулировать архивированный документ'
      });
    }
    const oldStatus = doc.status;
    doc.status = 'revoked';
    doc.revokedAt = this.now();
    doc.revokedBy = actorId;
    doc.revocationReason = reason.trim();
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'documents.revoked',
      entityType: 'documents.generated',
      entityId: documentId,
      oldValues: { status: oldStatus } as unknown as Record<string, unknown>,
      newValues: {
        status: 'revoked',
        revocationReason: doc.revocationReason
      } as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return doc;
  }

  /**
   * Перевыпускает документ: создаёт новый документ с теми же template/source,
   * новым номером + новым qr_token, связывает replaces/replaced_by, и аннулирует
   * оригинал с reason "Перевыпуск: ${reason}".
   *
   * Idempotency: если оригинал уже имеет replacedByDocumentId — возвращает
   * cached pair (replacement = существующий) без создания нового документа.
   * Если оригинал revoked но без replacedByDocumentId — означает был просто
   * revoke без reissue; reissue в этом случае запрещён (409).
   */
  async reissueDocument(
    tenantId: string,
    actorId: string | undefined,
    originalId: string,
    reason: string,
    ctx: RequestContext
  ): Promise<{ original: GeneratedDocumentEntity; replacement: GeneratedDocumentEntity }> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException({
        code: 'reissue_reason_required',
        message: 'Причина перевыпуска обязательна'
      });
    }
    const original = this.must(this.state.generatedDocuments, tenantId, originalId);
    if (original.replacedByDocumentId) {
      const cached = this.state.generatedDocuments.find(
        (d) => d.tenantId === tenantId && d.id === original.replacedByDocumentId
      );
      if (cached) {
        return { original, replacement: cached };
      }
    }
    if (original.status === 'revoked') {
      throw new ConflictException({
        code: 'cannot_reissue_revoked',
        message: 'Документ был аннулирован вручную и не может быть перевыпущен'
      });
    }
    const now = this.now();
    const newNumber = this.reserveNumber(tenantId, original.documentType).reservedNumber;
    const replacement: GeneratedDocumentEntity = {
      id: this.id('gdoc'),
      tenantId,
      templateId: original.templateId,
      templateVersionId: original.templateVersionId,
      documentType: original.documentType,
      name: `${original.documentType} ${newNumber}`,
      sourceEntityType: original.sourceEntityType,
      sourceEntityId: original.sourceEntityId,
      fileId: '',
      status: 'generated',
      documentNumber: newNumber,
      documentDate: now.slice(0, 10),
      isFinal: false,
      generatedBy: actorId,
      generatedAt: now,
      qrToken: this.generateQrToken(),
      replacesDocumentId: originalId
    };
    this.state.generatedDocuments.push(replacement);

    // Link original ← replacement и аннулируем оригинал.
    original.replacedByDocumentId = replacement.id;
    original.status = 'revoked';
    original.revokedAt = now;
    original.revokedBy = actorId;
    original.revocationReason = `Перевыпуск: ${reason.trim()}`;

    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'documents.reissued',
      entityType: 'documents.generated',
      entityId: replacement.id,
      newValues: {
        replacesDocumentId: originalId,
        originalNumber: original.documentNumber
      } as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'documents.revoked',
      entityType: 'documents.generated',
      entityId: originalId,
      newValues: {
        status: 'revoked',
        revocationReason: original.revocationReason,
        replacedByDocumentId: replacement.id
      } as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return { original, replacement };
  }

  // ==========================================================================
  // Pillar A Plan C §5.8 — публичная QR-проверка подлинности.
  // ==========================================================================

  /**
   * Global lookup по qrToken across ALL tenants — endpoint публичный без auth.
   * Возвращает агрегат для public response. Не раскрывает tenantId.
   *
   * Caller (controller) отвечает за rate-limiting и audit. Resolver не лезет
   * в mvp state — caller / адаптер обогащает learnerFullName / programTitle
   * через mvpService (или оставляет пустыми если нет).
   */
  verifyDocumentByQrToken(token: string): PublicVerifyResult {
    if (!token || token.length < 8) {
      return { status: 'not_found' };
    }
    const doc = this.state.generatedDocuments.find((d) => d.qrToken === token);
    if (!doc) {
      return { status: 'not_found' };
    }
    const result: PublicVerifyResult = {
      status: doc.status === 'revoked' ? 'revoked' : 'valid',
      documentId: doc.id,
      documentType: doc.documentType
    };
    if (doc.documentNumber) result.documentNumber = doc.documentNumber;
    if (doc.documentDate) result.issueDate = doc.documentDate;
    if (doc.status === 'revoked') {
      if (doc.revokedAt) result.revokedAt = doc.revokedAt;
      if (doc.revocationReason) result.revocationReason = doc.revocationReason;
    }
    return result;
  }

  // ==========================================================================
  // Pillar A Plan B §5.7 — приказы по группам (issueGroupOrder).
  // ==========================================================================

  /**
   * Атомарная операция: создаёт документ типа `order` и опционально каскадно
   * выпускает удостоверения для каждого enrollment-а в `enrollmentIds`,
   * связывая их с приказом через `groupOrderDocumentId`.
   *
   * Идемпотентность: повторный вызов с тем же `(groupId, templateId)` пары
   * возвращает существующий неархивированный приказ (`alreadyExisted=true`)
   * и НЕ создаёт дубликат. Это важно для UI: пользователь нажимает «Сгенерировать»
   * дважды — мы не должны выпускать два приказа.
   */
  async issueGroupOrder(
    tenantId: string,
    actorId: string | undefined,
    req: IssueGroupOrderRequest,
    ctx: RequestContext
  ): Promise<IssueGroupOrderResult> {
    const orderTpl = this.state.templates.find(
      (t) => t.tenantId === tenantId && t.id === req.templateId
    );
    if (!orderTpl) {
      throw new NotFoundException(`Template ${req.templateId} not found`);
    }
    if (orderTpl.templateType !== 'order') {
      throw new BadRequestException({
        code: 'invalid_template_type',
        message: `Group order requires template of template_type='order' (got '${orderTpl.templateType}')`
      });
    }

    // Idempotency: уже есть активный приказ для этой пары?
    const existing = this.state.generatedDocuments.find(
      (d) =>
        d.tenantId === tenantId &&
        d.sourceEntityType === 'group' &&
        d.sourceEntityId === req.groupId &&
        d.templateId === req.templateId &&
        d.documentType === 'order' &&
        d.status !== 'archived'
    );
    if (existing) {
      const certificates = this.state.generatedDocuments.filter(
        (d) => d.tenantId === tenantId && d.groupOrderDocumentId === existing.id
      );
      return { order: existing, certificates, alreadyExisted: true };
    }

    const now = this.now();
    const orderVersionId =
      orderTpl.currentVersionId ??
      this.state.versions.find(
        (v) => v.tenantId === tenantId && v.templateId === req.templateId && v.isActive
      )?.id ??
      '';
    const orderNumber = this.reserveNumber(tenantId, 'order').reservedNumber;
    const order: GeneratedDocumentEntity = {
      id: this.id('gdoc'),
      tenantId,
      templateId: req.templateId,
      templateVersionId: orderVersionId,
      documentType: 'order',
      name: `Приказ ${orderNumber}`,
      sourceEntityType: 'group',
      sourceEntityId: req.groupId,
      fileId: '',
      status: 'generated',
      documentNumber: orderNumber,
      documentDate: now.slice(0, 10),
      isFinal: false,
      generatedBy: actorId,
      generatedAt: now,
      qrToken: this.generateQrToken()
    };
    this.state.generatedDocuments.push(order);
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'documents.group_order_issued',
      entityType: 'documents.generated',
      entityId: order.id,
      newValues: { groupId: req.groupId, templateId: req.templateId } as unknown as Record<
        string,
        unknown
      >,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    const certificates: GeneratedDocumentEntity[] = [];
    if (req.certificateTemplateId && req.enrollmentIds.length > 0) {
      const certTpl = this.state.templates.find(
        (t) => t.tenantId === tenantId && t.id === req.certificateTemplateId
      );
      if (!certTpl) {
        throw new NotFoundException(`Template ${req.certificateTemplateId} not found`);
      }
      const certVersionId =
        certTpl.currentVersionId ??
        this.state.versions.find(
          (v) => v.tenantId === tenantId && v.templateId === req.certificateTemplateId && v.isActive
        )?.id ??
        '';
      for (const enrId of req.enrollmentIds) {
        // Within-order idempotency: тот же enrollment не выпускается дважды.
        const dup = this.state.generatedDocuments.find(
          (d) =>
            d.tenantId === tenantId &&
            d.sourceEntityType === 'enrollment' &&
            d.sourceEntityId === enrId &&
            d.templateId === req.certificateTemplateId &&
            d.groupOrderDocumentId === order.id
        );
        if (dup) {
          certificates.push(dup);
          continue;
        }
        const certNumber = this.reserveNumber(tenantId, certTpl.templateType).reservedNumber;
        const cert: GeneratedDocumentEntity = {
          id: this.id('gdoc'),
          tenantId,
          templateId: req.certificateTemplateId,
          templateVersionId: certVersionId,
          documentType: certTpl.templateType,
          name: `${certTpl.name} ${certNumber}`,
          sourceEntityType: 'enrollment',
          sourceEntityId: enrId,
          fileId: '',
          status: 'generated',
          documentNumber: certNumber,
          documentDate: now.slice(0, 10),
          isFinal: false,
          generatedBy: actorId,
          generatedAt: now,
          groupOrderDocumentId: order.id,
          qrToken: this.generateQrToken()
        };
        this.state.generatedDocuments.push(cert);
        certificates.push(cert);
        await this.auditService.writeCritical({
          tenantId,
          actorId,
          action: 'documents.certificate_issued_via_order',
          entityType: 'documents.generated',
          entityId: cert.id,
          newValues: { enrollmentId: enrId, orderId: order.id } as unknown as Record<
            string,
            unknown
          >,
          requestId: ctx.requestId,
          correlationId: ctx.correlationId,
          ip: ctx.ip,
          userAgent: ctx.userAgent
        });
      }
    }

    return { order, certificates, alreadyExisted: false };
  }
}

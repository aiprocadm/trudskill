import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { assertDocumentKindFitsTemplate, assertDocumentKindFitsType } from './document-kinds.js';
import { DOCUMENT_REVOKED_EVENT } from './document-revoked.event.js';
import { DOCUMENTS_STATE } from './documents-state.token.js';
import {
  type BaseFilter,
  type CloseGroupRequest,
  type CloseGroupResult,
  type CreateNumberingRuleRequest,
  type CreateTemplateBindingRequest,
  type CreateTemplateRequest,
  type CreateTemplateVariableRequest,
  type CreateTemplateVersionRequest,
  type GenerateDocumentRequest,
  type GenerateDocumentsBatchRequest,
  type GroupClosureStatus,
  type UpdateNumberingRuleRequest,
  type UpdateTemplateBindingRequest,
  type UpdateTemplateRequest,
  type UpdateTemplateVariableRequest,
  type UpdateTemplateVersionRequest,
  assertTemplateType,
  assertVariableCategoryCode
} from './documents.dto.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import {
  type NumberingFacts,
  factTokensOf,
  formatRuleNumber,
  isDerivedPattern,
  missingFacts
} from './numbering-format.js';
import {
  type PublicVerifyResult,
  buildPublicVerifyResult,
  maskFullName
} from './public-verify.util.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import { periodKeyIn, todayIn } from '../../common/utils/tenant-calendar.js';
import {
  DOCUMENT_SIGNATURE_PROVIDER,
  type DocumentSignatureProvider,
  type SignatureResult
} from '../../infrastructure/document-signature/document-signature.provider.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type {
  DocumentGenerationTaskEntity,
  GeneratedDocumentEntity,
  NumberReservationEntity,
  NumberingRuleEntity,
  TaskStatus,
  TemplateBindingEntity,
  TemplateEntity,
  TemplateType,
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

// Pillar A Plan C §5.8 — публичный результат QR-проверки + чистый билдер вынесены
// в public-verify.util.ts (общий источник для in-tenant и кросс-tenant путей).
export type { PublicVerifyResult } from './public-verify.util.js';

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
    @Inject(MetricsService) @Optional() private readonly metrics?: MetricsService,
    @Optional() @Inject(EventEmitter2) private readonly events?: EventEmitter2,
    @Optional()
    @Inject(DOCUMENT_SIGNATURE_PROVIDER)
    private readonly signatureProvider?: DocumentSignatureProvider
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
    if (version.templateId !== id)
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Template version mismatch'
      });
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
  createTemplateVariable(
    tenantId: string,
    actorId: string | undefined,
    req: CreateTemplateVariableRequest,
    ctx: RequestContext
  ) {
    this.getTemplateVersion(tenantId, req.templateVersionId);
    assertVariableCategoryCode(req.categoryCode);
    const duplicate = this.state.variables.find(
      (x) =>
        x.tenantId === tenantId &&
        x.templateVersionId === req.templateVersionId &&
        x.variableCode === req.variableCode &&
        !x.deletedAt
    );
    if (duplicate)
      throw new ConflictException({
        code: 'template_variable_code_taken',
        message: 'Variable code already exists'
      });
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
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_variable_created',
      entityType: 'documents.template_variable',
      entityId: entity.id,
      newValues: entity as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return entity;
  }
  getTemplateVariable(tenantId: string, id: string) {
    return this.must(
      this.state.variables.filter((x) => !x.deletedAt),
      tenantId,
      id
    );
  }
  updateTemplateVariable(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: UpdateTemplateVariableRequest,
    ctx: RequestContext
  ) {
    const row = this.getTemplateVariable(tenantId, id);
    const oldValues = { ...row };
    if (req.categoryCode !== undefined) {
      assertVariableCategoryCode(req.categoryCode);
    }
    Object.assign(row, req);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_variable_updated',
      entityType: 'documents.template_variable',
      entityId: id,
      oldValues: oldValues as unknown as Record<string, unknown>,
      newValues: row as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return row;
  }
  deleteTemplateVariable(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const row = this.getTemplateVariable(tenantId, id);
    row.deletedAt = this.now();
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_variable_deleted',
      entityType: 'documents.template_variable',
      entityId: id,
      newValues: { deletedAt: row.deletedAt },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return { deleted: true };
  }

  listTemplateBindings(tenantId: string, query: BaseFilter) {
    return this.page(
      this.state.bindings.filter((x) => x.tenantId === tenantId),
      query
    );
  }
  createTemplateBinding(
    tenantId: string,
    actorId: string | undefined,
    req: CreateTemplateBindingRequest,
    ctx: RequestContext
  ) {
    const template = this.getTemplate(tenantId, req.templateId);
    this.validateBindingPayload(req.bindType, req.directionId, req.courseId, req.groupId);
    if (req.kindCode) {
      assertDocumentKindFitsTemplate(req.kindCode, template.templateType, template.name);
    }
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
      createdAt: this.now(),
      ...(req.kindCode ? { kindCode: req.kindCode } : {})
    };
    this.state.bindings.push(entity);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_binding_created',
      entityType: 'documents.template_binding',
      entityId: entity.id,
      newValues: entity as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return entity;
  }
  getTemplateBinding(tenantId: string, id: string) {
    return this.must(this.state.bindings, tenantId, id);
  }
  updateTemplateBinding(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: UpdateTemplateBindingRequest,
    ctx: RequestContext
  ) {
    const row = this.getTemplateBinding(tenantId, id);
    const oldValues = { ...row };
    Object.assign(row, req);
    this.validateBindingPayload(row.bindType, row.directionId, row.courseId, row.groupId);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_binding_updated',
      entityType: 'documents.template_binding',
      entityId: id,
      oldValues: oldValues as unknown as Record<string, unknown>,
      newValues: row as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return row;
  }
  deleteTemplateBinding(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ) {
    const row = this.getTemplateBinding(tenantId, id);
    this.state.bindings = this.state.bindings.filter(
      (x) => !(x.tenantId === tenantId && x.id === id)
    );
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_binding_deleted',
      entityType: 'documents.template_binding',
      entityId: id,
      oldValues: row as unknown as Record<string, unknown>,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
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
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Retry allowed only for failed tasks'
      });
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
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Cancel allowed only for queued or running tasks'
      });
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

  /**
   * ФТ-G1 — скачивание документа с записью в журнал действий.
   *
   * Зачем отдельный метод, а не запись в контроллере. Скачанный документ — это удостоверение
   * или протокол с фамилией, СНИЛСом и датой рождения слушателя. Если файл уйдёт наружу,
   * учебный центр обязан ответить, кто и когда его выгружал — перед слушателем и перед
   * проверкой по 152-ФЗ. Раньше в журнале был только выпуск документа: видно, что бумагу
   * создали, и не видно, кто её потом скачивал.
   *
   * Запись делается ПОСЛЕ проверки принадлежности центру: чужой документ не должен ни
   * отдаваться, ни оставлять следа в чужом журнале.
   */
  getDocumentForDownload(
    tenantId: string,
    id: string,
    actorId: string | undefined,
    ctx?: RequestContext
  ) {
    const document = this.must(this.state.generatedDocuments, tenantId, id);
    // Ревизия 2026-08-26 (порция 21): без файла скачивать нечего — отказ ДО записи
    // в журнал, иначе журнал фиксирует «выгрузку», которая не могла состояться.
    if (!document.fileId) {
      throw new NotFoundException({
        code: 'document_file_missing',
        message: 'Document has no file yet'
      });
    }
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.downloaded',
      entityType: 'documents.generated_document',
      entityId: document.id,
      metadata: {
        /*
         * Что кладём и почему именно это. Прямого поля «слушатель» у документа нет: он
         * привязан к тому, на основании чего выдан (`sourceEntityType` + `sourceEntityId`,
         * обычно зачисление). Поэтому в записи — номер и название бумаги, чтобы человек
         * опознал её без похода в базу, вид документа и ссылка на основание, по которой
         * при разбирательстве находится слушатель.
         */
        documentNumber: document.documentNumber,
        documentName: document.name,
        documentType: document.documentType,
        sourceEntityType: document.sourceEntityType,
        sourceEntityId: document.sourceEntityId
      },
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent
    });
    return document;
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
    // Durable dedup: if a source entity is specified, check the persisted task set for an
    // existing non-terminal-failure task for the same (tenantId, templateId, sourceEntityType,
    // sourceEntityId, taskType='generate'). This survives the 24h TTL cache expiry and
    // prevents duplicate certificates when ENROLLMENT_COMPLETED_EVENT is re-emitted.
    // Only queued/running/completed count as "already issued": a failed OR cancelled prior
    // task must NOT block a fresh issuance (after a renderer error or an admin cancel of a
    // stuck task, the next re-emit should produce a new task).
    // templateVersionId is intentionally NOT part of the match — a template version upgrade
    // is not a distinct issuance, so a re-emit with a different version still dedups here.
    // NOTE: state.tasks.find(...) is an O(n) scan, acceptable for the in-memory MVP backend;
    // replace with an indexed query at the Postgres-backend port (cf. the idem-cache note).
    if (req.sourceEntityType && req.sourceEntityId) {
      const durable = this.state.tasks.find(
        (t) =>
          t.tenantId === tenantId &&
          t.templateId === req.templateId &&
          t.sourceEntityType === req.sourceEntityType &&
          t.sourceEntityId === req.sourceEntityId &&
          t.taskType === 'generate' &&
          t.status !== 'failed' &&
          t.status !== 'cancelled'
      );
      if (durable) {
        // Repopulate the TTL cache so subsequent in-window calls stay on the fast path.
        this.state.idem.set(idemKey, {
          taskId: durable.id,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000
        });
        return this.getDocumentTask(tenantId, durable.id);
      }
    }
    const template = this.getTemplate(tenantId, req.templateId);
    if (template.status === 'archived')
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Cannot generate documents from archived template'
      });
    const versionId = req.templateVersionId ?? template.currentVersionId;
    if (!versionId)
      throw new BadRequestException({
        code: 'validation_error',
        message: 'No template version selected'
      });
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
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      outboxPayload: {
        request_id: ctx?.requestId,
        correlation_id: ctx?.correlationId,
        enqueued_at: this.now()
      },
      ...(req.validUntil ? { validUntil: req.validUntil } : {}),
      ...(req.groupId ? { groupId: req.groupId } : {}),
      ...(req.kindCode ? { kindCode: req.kindCode } : {})
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
            // Idempotency: derived from caller-provided key + sourceEntityId.
            // Retry того же batch с теми же sourceEntityIds → те же per-item keys.
            idempotencyKey: `${req.idempotencyKey}:${sourceEntityId}:${index}`
          },
          ctx
        )
      )
    };
  }

  /**
   * @param artifacts ФТ-A1.3/A1.4 — PDF-двойник и снапшот подстановки. Опциональны и идут
   * пятым аргументом, чтобы не ломать существующие вызовы (позиционный `generatedBy`).
   */
  completeTask(
    tenantId: string,
    taskId: string,
    fileId: string,
    generatedBy?: string,
    artifacts?: { pdfFileId?: string; variablesSnapshot?: Record<string, unknown> }
  ) {
    const existing = this.getDocumentTask(tenantId, taskId);
    // Idempotent redelivery: an already-completed task returns its document instead of
    // erroring (startTask would throw 'Terminal task cannot be started' first) (audit tail f).
    if (existing.status === 'completed')
      return this.getDocument(tenantId, existing.generatedDocumentId!);
    this.startTask(tenantId, taskId);
    const task = this.getDocumentTask(tenantId, taskId);
    if (task.status !== 'running')
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Task state is not processable'
      });
    const reserved = task.numberReservationId
      ? this.getReservation(tenantId, task.numberReservationId)
      : this.reserveNumber(tenantId, task.documentType, task.kindCode);
    task.numberReservationId = reserved.id;
    const generated: GeneratedDocumentEntity = {
      id: this.id('gdoc'),
      tenantId,
      templateId: task.templateId,
      templateVersionId: task.templateVersionId!,
      documentType: task.documentType,
      ...(task.kindCode ? { kindCode: task.kindCode } : {}),
      name: `Document ${reserved.reservedNumber}`,
      sourceEntityType: task.sourceEntityType,
      sourceEntityId: task.sourceEntityId,
      fileId,
      ...(artifacts?.pdfFileId ? { pdfFileId: artifacts.pdfFileId } : {}),
      ...(artifacts?.variablesSnapshot ? { variablesSnapshot: artifacts.variablesSnapshot } : {}),
      // ФТ-A6.1: инициалы считаем здесь, пока снапшот под рукой. На публичном
      // пути он вырезается вместе с полными ПДн, и восстановить ФИО будет нечем.
      ...(() => {
        const masked = maskFullName(
          typeof artifacts?.variablesSnapshot?.['learner.full_name'] === 'string'
            ? (artifacts.variablesSnapshot['learner.full_name'] as string)
            : undefined
        );
        return masked ? { learnerNamePublic: masked } : {};
      })(),
      // Программа и объём — по той же причине и в том же месте: на публичном пути снимок
      // вырезается, а без этих двух полей страница проверки не отвечает на главный вопрос
      // инспектора — «по какой программе и на сколько часов» (журнал 322). ПДн здесь нет,
      // поэтому берём как есть, но ТОЛЬКО эти два ключа — остальное из снимка наружу не идёт.
      ...(() => {
        const snapshot = artifacts?.variablesSnapshot;
        const title = snapshot?.['course.title'];
        const hours = snapshot?.['program.academic_hours'];
        return {
          ...(typeof title === 'string' && title ? { programTitlePublic: title } : {}),
          ...(typeof hours === 'number' && Number.isFinite(hours)
            ? { academicHoursPublic: hours }
            : {})
        };
      })(),
      status: 'generated',
      documentNumber: reserved.reservedNumber,
      documentDate: todayIn(this.state.tenantTimezone, new Date(this.now())),
      isFinal: false,
      generatedBy,
      generatedAt: this.now(),
      qrToken: this.generateQrToken(),
      ...(task.validUntil ? { validUntil: task.validUntil } : {})
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
  /** Номер, зарезервированный под задачу (для рендера и ответа internal-worker). */
  getTaskReservedNumber(tenantId: string, taskId: string): string | undefined {
    const task = this.getDocumentTask(tenantId, taskId);
    if (!task.numberReservationId) return undefined;
    return this.getReservation(tenantId, task.numberReservationId).reservedNumber;
  }

  /** `facts` — данные группы для номера (МГ-F3.1), их собирает вызывающий вне блокировки. */
  startTask(tenantId: string, id: string, facts: NumberingFacts = {}) {
    const task = this.getDocumentTask(tenantId, id);
    if (task.status === 'completed' || task.status === 'failed')
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Terminal task cannot be started'
      });
    if (task.status === 'running') return task;
    task.status = 'running';
    this.publishTaskEvent(task);
    task.startedAt = task.startedAt ?? this.now();
    this.metrics?.observeQueueLag(Date.now() - Date.parse(task.requestedAt), {
      queue: 'documents_generation'
    });
    if (!task.numberReservationId) {
      task.numberReservationId = this.reserveNumber(tenantId, task.documentType, task.kindCode, {
        groupId: task.groupId,
        ...facts
      }).id;
    }
    this.writeTaskAudit(task, 'documents.task.started');
    return task;
  }
  failTask(tenantId: string, id: string, message: string) {
    const task = this.getDocumentTask(tenantId, id);
    if (task.status === 'completed')
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Completed task cannot be failed'
      });
    task.status = 'failed';
    this.publishTaskEvent(task);
    task.errorMessage = message;
    task.finishedAt = this.now();
    if (task.numberReservationId) {
      const reservation = this.getReservation(tenantId, task.numberReservationId);
      if (reservation.status === 'reserved') {
        // ФТ-A4.2: номер возвращается в оборот (его подберёт следующий reserveNumber),
        // а не сгорает — иначе упавший рендер оставляет дыру в регулируемом реестре.
        // Освобождение фиксируется отдельной записью аудита: у номера должна быть
        // прослеживаемая судьба, а не молчаливое исчезновение.
        reservation.status = 'released';
        this.auditService.write({
          tenantId,
          actorId: task.requestedBy,
          action: 'documents.number.released',
          entityType: 'number_reservation',
          entityId: reservation.id,
          metadata: {
            reservedNumber: reservation.reservedNumber,
            taskId: task.id,
            reason: message
          },
          requestId: task.requestId,
          correlationId: task.correlationId,
          ip: task.ip,
          userAgent: task.userAgent
        });
      }
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
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Archived document cannot be finalized'
      });
    // A revoked document must never be resurrected. The isFinal short-circuit below does NOT
    // cover this: a document revoked while still `generated` keeps isFinal=false, so finalize
    // would otherwise flip it to status='final' + isFinal=true + signed — silently un-revoking a
    // legally annulled document (reachable via esign tryCompleteProcess → finalizeDocument).
    // Mirrors the same guard in signDocument.
    if (doc.status === 'revoked')
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Revoked document cannot be finalized'
      });
    // Idempotent: finalizing an already-final document is a no-op. Two signing
    // processes completing on the same generatedDocumentId would otherwise each
    // call finalizeDocument → re-run applySignature (double signature) and re-emit
    // documents.finalized / documents.signed critical-audit entries. (Re-signing a
    // finalized doc on demand goes through signDocument.)
    if (doc.isFinal) return doc;
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
    await this.applySignature(doc, actorId, ctx);
    return doc;
  }

  /** Phase 6 — ручное/повторное подписание уже выпущенного документа (напр. после включения флага). */
  async signDocument(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ): Promise<GeneratedDocumentEntity> {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived')
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Archived document cannot be signed'
      });
    if (doc.status === 'revoked')
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Revoked document cannot be signed'
      });
    if (!doc.isFinal)
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Only finalized documents can be signed'
      });
    await this.applySignature(doc, actorId, ctx);
    return doc;
  }

  /**
   * Phase 6 — подписывает документ через активный провайдер и проставляет метаданные.
   * Провайдер отсутствует (старые call-sites/тесты) или Noop → документ остаётся unsigned.
   * Сбой провайдера НЕ откатывает финализацию: ставим status='failed' и продолжаем
   * (повторить можно через signDocument). Это зеркалит fail-soft AV-gate.
   */
  private async applySignature(
    doc: GeneratedDocumentEntity,
    actorId: string | undefined,
    ctx: RequestContext
  ): Promise<void> {
    if (!this.signatureProvider || this.signatureProvider.id === 'noop') return;
    const previous = {
      signatureStatus: doc.signatureStatus,
      signatureProvider: doc.signatureProvider
    };
    let result: SignatureResult;
    try {
      result = await this.signatureProvider.sign({
        tenantId: doc.tenantId,
        documentId: doc.id,
        fileId: doc.pdfFileId ?? doc.fileId
      });
    } catch (err) {
      result = { status: 'failed', detail: String(err) };
    }
    doc.signatureStatus = result.status;
    doc.signatureProvider = this.signatureProvider.id;
    if (result.status === 'signed') {
      doc.signedAt = this.now();
      doc.signedBy = actorId ?? 'system';
      if (result.signatureRef) doc.signatureRef = result.signatureRef;
      if (result.certificateSubject) doc.signatureCertificateSubject = result.certificateSubject;
    }
    await this.auditService.writeCritical({
      tenantId: doc.tenantId,
      actorId,
      action: 'documents.signed',
      entityType: 'documents.generated',
      entityId: doc.id,
      oldValues: previous,
      newValues: {
        signatureStatus: doc.signatureStatus,
        signatureProvider: doc.signatureProvider
      },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
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
  /**
   * Одна «область» правила — тип документа плюс вид (МГ-F3.1): новое или включённое правило
   * вида выключает только прежнее правило того же вида, правило типа — только правило типа.
   */
  private sameNumberingScope(
    rule: NumberingRuleEntity,
    tenantId: string,
    documentType: string,
    kindCode: string | undefined
  ) {
    return (
      rule.tenantId === tenantId &&
      rule.documentType === documentType &&
      (rule.kindCode ?? '') === (kindCode ?? '')
    );
  }

  /** Правила нумерации — регулируемый реестр: каждое изменение видно в журнале действий. */
  private writeNumberingRuleAudit(
    action: string,
    rule: NumberingRuleEntity,
    oldValues: Record<string, unknown> | undefined,
    actorId: string | undefined,
    ctx: RequestContext | undefined
  ) {
    this.auditService.write({
      tenantId: rule.tenantId,
      actorId,
      action,
      entityType: 'documents.numbering_rule',
      entityId: rule.id,
      oldValues,
      newValues: {
        documentType: rule.documentType,
        kindCode: rule.kindCode,
        prefix: rule.prefix,
        suffix: rule.suffix,
        pattern: rule.pattern,
        resetPeriod: rule.resetPeriod,
        currentCounter: rule.currentCounter,
        series: rule.series,
        parts: rule.parts
      },
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent
    });
  }

  createNumberingRule(
    tenantId: string,
    req: CreateNumberingRuleRequest,
    actorId?: string,
    ctx?: RequestContext
  ) {
    if (req.kindCode) assertDocumentKindFitsType(req.kindCode, req.documentType);
    this.state.numberingRules
      .filter((x) => this.sameNumberingScope(x, tenantId, req.documentType, req.kindCode))
      .forEach((x) => {
        x.isActive = false;
        x.updatedAt = this.now();
      });
    const entity: NumberingRuleEntity = {
      id: this.id('nrule'),
      tenantId,
      documentType: req.documentType,
      ...(req.kindCode ? { kindCode: req.kindCode } : {}),
      ...(req.series ? { series: req.series } : {}),
      ...(req.parts?.length ? { parts: req.parts } : {}),
      prefix: req.prefix ?? '',
      suffix: req.suffix ?? '',
      pattern: req.pattern ?? this.defaultNumberingPattern(req.resetPeriod ?? 'none'),
      // ФТ-A4.1: startCounter — номер, который выдастся первым; во внутреннем счётчике
      // держим «последний выданный», поэтому минус один.
      currentCounter: req.startCounter !== undefined ? req.startCounter - 1 : 0,
      resetPeriod: req.resetPeriod ?? 'none',
      isActive: true,
      updatedAt: this.now()
    };
    this.state.numberingRules.push(entity);
    this.writeNumberingRuleAudit(
      'documents.numbering_rule_created',
      entity,
      undefined,
      actorId,
      ctx
    );
    return entity;
  }
  getNumberingRule(tenantId: string, id: string) {
    return this.must(this.state.numberingRules, tenantId, id);
  }
  updateNumberingRule(
    tenantId: string,
    id: string,
    req: UpdateNumberingRuleRequest,
    actorId?: string,
    ctx?: RequestContext
  ) {
    const row = this.getNumberingRule(tenantId, id);
    const before = {
      prefix: row.prefix,
      suffix: row.suffix,
      pattern: row.pattern,
      resetPeriod: row.resetPeriod,
      currentCounter: row.currentCounter,
      series: row.series,
      parts: row.parts
    };
    // ФТ-A4.1: startCounter — это «следующий выдаваемый номер», а во внутреннем
    // счётчике хранится «последний выданный». Поле служебное: в сущность правила
    // оно попасть не должно (иначе Object.assign протащит его в персистенцию).
    const { startCounter, ...rest } = req;
    Object.assign(row, rest, { updatedAt: this.now() });
    if (startCounter !== undefined) {
      const nextCounter = startCounter - 1;
      if (nextCounter < row.currentCounter) {
        // Откат назад повторно выдал бы уже использованные номера — в регулируемом
        // реестре это дубли, которые нечем развести.
        throw new BadRequestException({
          code: 'domain_rule_violation',
          message: `Numbering cannot go backwards: already issued up to ${row.currentCounter}`
        });
      }
      row.currentCounter = nextCounter;
    }
    this.writeNumberingRuleAudit('documents.numbering_rule_updated', row, before, actorId, ctx);
    return row;
  }
  /**
   * МГ-F3.1 (срез 19.3): «сбросить счётчик» как в CDOPROF — только администратор центра, с вводом
   * подтверждения и записью в журнал действий. В отличие от правки (`updateNumberingRule`),
   * сброс может вести счётчик НАЗАД (новый год, переход с бумаги). Дубля это не создаёт: номер,
   * совпавший с уже выданным, отклоняется при выдаче (`document_number_taken`, заявка 0088).
   *
   * Подтверждение — число уже выданных номеров, а не слово-заклинание (`CMP-005`): человек
   * переписывает то, что видит в строке, и сброс по устаревшему экрану (кто-то успел выпустить
   * документ) не проходит.
   */
  resetNumberingRule(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: { confirmation: string; startCounter: number },
    ctx: RequestContext
  ) {
    const row = this.getNumberingRule(tenantId, id);
    if (req.confirmation.trim() !== String(row.currentCounter)) {
      throw new BadRequestException({
        code: 'numbering_reset_confirmation_mismatch',
        message: `Для сброса введите число уже выданных номеров — ${row.currentCounter}.`
      });
    }
    const before = { currentCounter: row.currentCounter, periodKey: row.periodKey };
    row.currentCounter = req.startCounter - 1;
    row.updatedAt = this.now();
    this.writeNumberingRuleAudit('documents.numbering_rule_reset', row, before, actorId, ctx);
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
      .filter((x) => this.sameNumberingScope(x, tenantId, row.documentType, row.kindCode))
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

  /**
   * МГ-F3.1 (срез 19.1): у документа с видом сначала ищется правило вида, затем — правило типа
   * (общий счётчик, РМ124). Документ без вида правилом вида не нумеруется никогда.
   */
  private findActiveNumberingRule(tenantId: string, documentType: string, kindCode?: string) {
    return (
      (kindCode
        ? this.state.numberingRules.find(
            (x) => x.tenantId === tenantId && x.kindCode === kindCode && x.isActive
          )
        : undefined) ??
      this.state.numberingRules.find(
        (x) =>
          x.tenantId === tenantId && x.documentType === documentType && !x.kindCode && x.isActive
      )
    );
  }

  /**
   * МГ-F3.1 (срез 19.2): нужны ли номеру задачи данные группы — код, порядок слушателя. Их
   * собирают вне блокировки документов (они в MVP-состоянии), поэтому спрашивают заранее.
   */
  numberingNeedsFacts(tenantId: string, task: DocumentGenerationTaskEntity): boolean {
    if (task.numberReservationId) return false;
    const rule = this.findActiveNumberingRule(tenantId, task.documentType, task.kindCode);
    return rule ? factTokensOf(rule.pattern).length > 0 : false;
  }

  /**
   * Номер протокола группы для «номер удостоверения = номер протокола + порядок» (МГ-F3.1).
   *
   * Протокол — задача выпуска типа «протокол» этой группы (самая поздняя живая). Номер у неё
   * есть — берём его. Номера ещё нет (удостоверение пошло в работу раньше протокола) — при
   * `reserve` номер выдаётся протоколу сейчас же: удостоверение не падает из-за очереди, а
   * протокол потом получит ровно этот номер. Предпросмотр ничего не выдаёт (`reserve: false`).
   */
  private protocolNumberOfGroup(
    tenantId: string,
    groupId: string | undefined,
    groupCode: string | undefined,
    reserve: boolean
  ): string | undefined {
    if (!groupId) return undefined;
    const protocolTask = this.state.tasks
      .filter(
        (t) =>
          t.tenantId === tenantId &&
          t.documentType === 'protocol' &&
          t.status !== 'cancelled' &&
          t.status !== 'failed' &&
          (t.groupId === groupId ||
            (t.sourceEntityType === 'group' && t.sourceEntityId === groupId))
      )
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
    if (!protocolTask) return undefined;
    if (protocolTask.numberReservationId) {
      return this.state.reservations.find(
        (r) => r.tenantId === tenantId && r.id === protocolTask.numberReservationId
      )?.reservedNumber;
    }
    if (!reserve) return undefined;
    // Правило протокола, само ссылающееся на номер протокола, — ошибка настройки, а не повод
    // зациклиться: номера нет, выпуск получит понятный отказ.
    const protocolRule = this.findActiveNumberingRule(tenantId, 'protocol', protocolTask.kindCode);
    if (protocolRule?.pattern.includes('{protocol.number}')) return undefined;
    const reserved = this.reserveNumber(tenantId, 'protocol', protocolTask.kindCode, {
      groupId,
      groupCode
    });
    protocolTask.numberReservationId = reserved.id;
    return reserved.reservedNumber;
  }

  /** Шаблон с периодом: при сбросе по году/месяцу номер без периода повторился бы. */
  private patternWithPeriod(rule: NumberingRuleEntity): string {
    if (rule.resetPeriod === 'none' || rule.pattern.includes('{period}')) return rule.pattern;
    const running = ['{counter}', '{seq.year}', '{parts}'].find((t) => rule.pattern.includes(t));
    return running ? rule.pattern.replace(running, `{period}-${running}`) : rule.pattern;
  }

  private assertNumberingFacts(rule: NumberingRuleEntity, facts: NumberingFacts) {
    const missing = missingFacts(rule.pattern, facts);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'numbering_context_missing',
        message: `Для номера не хватает: ${missing.join(', ')}. Номер этого вида собирается из данных группы — выпустите документ из учебной группы.`
      });
    }
  }

  reserveNumber(
    tenantId: string,
    documentType: string,
    kindCode?: string,
    facts: NumberingFacts = {}
  ) {
    let rule = this.findActiveNumberingRule(tenantId, documentType, kindCode);
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
    const activeRule = rule;
    const usesFacts = factTokensOf(activeRule.pattern).length > 0;
    const fullFacts: NumberingFacts = activeRule.pattern.includes('{protocol.number}')
      ? {
          ...facts,
          protocolNumber:
            facts.protocolNumber ??
            this.protocolNumberOfGroup(tenantId, facts.groupId, facts.groupCode, true)
        }
      : facts;
    if (usesFacts) this.assertNumberingFacts(activeRule, fullFacts);
    const periodKey = this.periodKey(activeRule.resetPeriod);
    // ФТ-A4.2: номер, освобождённый упавшей задачей, возвращается в оборот раньше,
    // чем счётчик выдаст следующий — иначе в реестре остаётся дыра, а дыра в
    // регулируемой нумерации у проверяющего равносильна утраченному документу.
    // Границу периода не пересекаем: маска содержит период (см. periodKey).
    // Номер из данных группы (МГ-F3.1) переиспользуется только ТОТ ЖЕ — ниже, после сборки.
    const reusable = usesFacts
      ? undefined
      : this.state.reservations.find(
          (x) =>
            x.tenantId === tenantId &&
            x.ruleId === activeRule.id &&
            x.status === 'released' &&
            (activeRule.resetPeriod === 'none' || x.periodKey === periodKey)
        );
    if (reusable) return this.reuseReservation(reusable);
    // Period rollover (new year/month) restarts the sequence at 1. Compute the
    // next value WITHOUT committing it yet — a failed reservation below must not
    // burn a counter value and leave a gap in a regulated register.
    const rolledOver = activeRule.periodKey !== undefined && activeRule.periodKey !== periodKey;
    const nextCounter = rolledOver ? 1 : activeRule.currentCounter + 1;
    // {period} keeps reset numbers globally unique: after a rollover the counter
    // resets, so without the period the new period's #1 collides with the prior
    // period's #1 (the silent-failure источник). Legacy rules that reset by period
    // but omit {period} from their pattern are qualified here so issuance never
    // silently fails on rollover.
    const periodToken = activeRule.resetPeriod === 'none' ? '' : periodKey;
    const formatted = formatRuleNumber(
      { ...activeRule, pattern: this.patternWithPeriod(activeRule) },
      nextCounter,
      periodToken,
      fullFacts
    );
    // РМ125: номер уникален в пределах вида правила — «номер приказа = код группы» и
    // «номер протокола = код группы» не мешают друг другу, дубль внутри вида запрещён.
    const numberScope = activeRule.kindCode ?? '';
    const sameNumber = (x: NumberReservationEntity) =>
      x.tenantId === tenantId &&
      x.reservedNumber === formatted &&
      (x.kindCode ?? '') === numberScope;
    if (usesFacts) {
      const released = this.state.reservations.find(
        (x) =>
          x.tenantId === tenantId &&
          sameNumber(x) &&
          x.ruleId === activeRule.id &&
          x.status === 'released'
      );
      if (released) return this.reuseReservation(released);
    }
    if (this.state.reservations.some((x) => x.tenantId === tenantId && sameNumber(x))) {
      throw new ConflictException({
        code: 'document_number_taken',
        message: `Номер ${formatted} уже выдан документу этого вида.`
      });
    }
    // Commit the sequence advance only after the uniqueness check passed. Номер только из
    // данных группы счётчик не расходует — «выдано» на экране нумерации не врёт.
    if (!isDerivedPattern(activeRule.pattern)) activeRule.currentCounter = nextCounter;
    activeRule.periodKey = periodKey;
    const reservation: NumberReservationEntity = {
      id: this.id('nres'),
      tenantId,
      ruleId: activeRule.id,
      reservedNumber: formatted,
      reservedAt: this.now(),
      status: 'reserved',
      periodKey,
      ...(activeRule.kindCode ? { kindCode: activeRule.kindCode } : {})
    };
    this.state.reservations.push(reservation);
    return reservation;
  }

  private reuseReservation(reservation: NumberReservationEntity) {
    reservation.status = 'reserved';
    reservation.reservedAt = this.now();
    delete reservation.documentId;
    delete reservation.usedAt;
    return reservation;
  }

  /**
   * МГ-F3.1 (срез 19.2): «следующий номер будет …» — тем же кодом, что выпуск, но без выдачи:
   * счётчик не двигается, протоколу номер не выдаётся. Нет данных для токена — вместо номера
   * список того, чего не хватает; порядок слушателя в предпросмотре — первый.
   */
  previewNumber(
    tenantId: string,
    documentType: string,
    kindCode: string | undefined,
    facts: NumberingFacts
  ): { next: string | null; missing: string[]; ruleId?: string } {
    const rule = this.findActiveNumberingRule(tenantId, documentType, kindCode);
    if (!rule) {
      return { next: `${documentType.toUpperCase()}-000001`, missing: [] };
    }
    const previewFacts: NumberingFacts = {
      ...facts,
      seqGroup: facts.seqGroup ?? 1,
      protocolNumber:
        facts.protocolNumber ??
        this.protocolNumberOfGroup(tenantId, facts.groupId, facts.groupCode, false)
    };
    const missing = missingFacts(rule.pattern, previewFacts);
    if (missing.length > 0) return { next: null, missing, ruleId: rule.id };
    const periodKey = this.periodKey(rule.resetPeriod);
    // Выпуск сначала возвращает в оборот освобождённый номер (ФТ-A4.2) — предпросмотр тоже.
    if (factTokensOf(rule.pattern).length === 0) {
      const released = this.state.reservations.find(
        (x) =>
          x.tenantId === tenantId &&
          x.ruleId === rule.id &&
          x.status === 'released' &&
          (rule.resetPeriod === 'none' || x.periodKey === periodKey)
      );
      if (released) return { next: released.reservedNumber, missing: [], ruleId: rule.id };
    }
    const rolledOver = rule.periodKey !== undefined && rule.periodKey !== periodKey;
    const nextCounter = rolledOver ? 1 : rule.currentCounter + 1;
    const periodToken = rule.resetPeriod === 'none' ? '' : periodKey;
    return {
      next: formatRuleNumber(
        { ...rule, pattern: this.patternWithPeriod(rule) },
        nextCounter,
        periodToken,
        previewFacts
      ),
      missing: [],
      ruleId: rule.id
    };
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
      throw new BadRequestException({
        code: 'validation_error',
        message: `Required variables are missing: ${[...missing].join(', ')}`
      });
    }

    return {
      ...resolved,
      __snapshot: {
        templateVersionId,
        resolvedAt: this.now()
      }
    };
  }

  /**
   * Default номер-паттерн. Period-reset правила встраивают {period}, чтобы
   * сброшенный каждый год/месяц счётчик оставался глобально уникальным
   * (CERT-2026-000001) — иначе #1 нового периода коллидирует с #1 прошлого.
   */
  private defaultNumberingPattern(reset: 'none' | 'year' | 'month'): string {
    return reset === 'none' ? '{prefix}{counter}{suffix}' : '{prefix}{period}-{counter}{suffix}';
  }

  /**
   * Период номера — в часовом поясе ЦЕНТРА (журнал 300). По UTC удостоверение, выпущенное
   * 1 января в 06:00 в Новосибирске, попадало в серию ПРОШЛОГО года.
   */
  private periodKey(reset: 'none' | 'year' | 'month') {
    return periodKeyIn(this.state.tenantTimezone, reset, new Date(this.now()));
  }
  private page<T>(rows: T[], query: BaseFilter) {
    // Ревизия 2026-08-27 (порция 24): HTTP-параметры приходят строками — без разбора
    // `from + pageSize` склеивал строки (slice до миллиона). Потолка здесь НЕТ намеренно:
    // внутренние вызовы законно просят огромные страницы (скоупинг портала фильтрует ДО
    // пагинации); потолок HTTP-границы документов — отдельная запись журнала (283).
    const rawPage = Number(query.page ?? 1);
    const rawSize = Number(query.pageSize ?? 20);
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.trunc(rawPage) : 1;
    const pageSize = Number.isFinite(rawSize) && rawSize >= 1 ? Math.trunc(rawSize) : 20;
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
    if (!row) throw new NotFoundException({ code: 'not_found', message: `Entity ${id} not found` });
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
      correlationId: task.correlationId,
      ip: task.ip,
      userAgent: task.userAgent
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
      throw new BadRequestException({
        code: 'validation_error',
        message: 'directionId is required for direction binding'
      });
    if (bindType === 'course' && !courseId)
      throw new BadRequestException({
        code: 'validation_error',
        message: 'courseId is required for course binding'
      });
    if (bindType === 'group' && !groupId)
      throw new BadRequestException({
        code: 'validation_error',
        message: 'groupId is required for group binding'
      });
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
    this.events?.emit(DOCUMENT_REVOKED_EVENT, {
      tenantId,
      documentId,
      sourceEntityType: doc.sourceEntityType,
      sourceEntityId: doc.sourceEntityId,
      reason: doc.revocationReason,
      actorId,
      revokedAt: doc.revokedAt,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId
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
    const newNumber = this.reserveNumber(
      tenantId,
      original.documentType,
      original.kindCode
    ).reservedNumber;
    const replacement: GeneratedDocumentEntity = {
      id: this.id('gdoc'),
      tenantId,
      templateId: original.templateId,
      templateVersionId: original.templateVersionId,
      documentType: original.documentType,
      // Журнал 657: перевыпуск терял вид документа (срез 18.1) — книга выдачи и пакет группы
      // не узнавали замену.
      ...(original.kindCode ? { kindCode: original.kindCode } : {}),
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
    return doc ? buildPublicVerifyResult(doc) : { status: 'not_found' };
  }

  // ==========================================================================
  // ФТ-A5 «закрыть группу» (Фаза 1 Task 7a).
  // ==========================================================================

  /**
   * Одной операцией ставит на рендер протокол по группе и удостоверение каждому
   * сдавшему. В отличие от `issueGroupOrder` (Pillar A: пишет записи документов
   * напрямую, с пустым `fileId`) здесь заводятся именно ЗАДАЧИ — файлы рождаются
   * штатным конвейером «очередь → worker → S3».
   *
   * Идемпотентность держится на детерминированных ключах `close-group:<group>:…`,
   * поэтому повторный вызов ничего не дублирует. Упавшие задачи он возвращает в
   * очередь (ФТ-A5.3: «упал 1 из 25 — перезапустить только его»), а готовые не
   * трогает: перевыпуск сжёг бы номер и подменил уже выданный документ.
   */
  closeGroup(
    tenantId: string,
    actorId: string | undefined,
    req: CloseGroupRequest,
    ctx: RequestContext
  ): CloseGroupResult {
    const enrollmentIds = req.enrollmentIds.map((id) => id.trim()).filter(Boolean);
    if (enrollmentIds.length === 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Group closure requires at least one enrollment'
      });
    }
    this.assertTemplateOfType(tenantId, req.protocolTemplateId, 'protocol');
    this.assertTemplateOfType(tenantId, req.certificateTemplateId, 'certificate');

    const before = this.state.tasks.length;
    let retried = 0;
    // Задача, уже стоящая в очереди или готовая, возвращается как есть; упавшая —
    // возвращается в очередь. Так повторное нажатие «Закрыть группу» становится
    // безопасным для оператора: оно добивает хвост, а не выпускает второй комплект.
    const ensure = (
      templateId: string,
      documentType: string,
      sourceEntityType: string,
      sourceEntityId: string,
      idempotencyKey: string
    ) => {
      const task = this.generateDocument(
        tenantId,
        actorId,
        {
          idempotencyKey,
          templateId,
          sourceEntityType,
          sourceEntityId,
          documentType,
          groupId: req.groupId
        },
        ctx
      );
      if (task.status === 'failed') {
        retried += 1;
        return this.retryTask(tenantId, task.id);
      }
      return task;
    };

    const protocol = ensure(
      req.protocolTemplateId,
      'protocol',
      'group',
      req.groupId,
      `close-group:${req.groupId}:protocol`
    );
    const certificates = enrollmentIds.map((enrollmentId) =>
      ensure(
        req.certificateTemplateId,
        'certificate',
        'enrollment',
        enrollmentId,
        `close-group:${req.groupId}:certificate:${enrollmentId}`
      )
    );

    const created = this.state.tasks.length - before;
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.group_closed',
      entityType: 'learning.group',
      entityId: req.groupId,
      metadata: { learners: enrollmentIds.length, created, retried },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return { protocol, certificates, created, retried };
  }

  /**
   * Сводка по закрытию группы (ФТ-A5.3) — считается по задачам, помеченным
   * `groupId`. Идемпотентный кэш для этого не подходит: он живёт сутки и
   * чистится, а сводка обязана переживать перезапуск.
   */
  getGroupClosureStatus(tenantId: string, groupId: string): GroupClosureStatus {
    const tasks = this.state.tasks.filter((t) => t.tenantId === tenantId && t.groupId === groupId);
    const count = (status: TaskStatus) => tasks.filter((t) => t.status === status).length;
    const completed = count('completed');
    const failed = count('failed');
    return {
      groupId,
      total: tasks.length,
      queued: count('queued'),
      running: count('running'),
      completed,
      failed,
      isComplete: tasks.length > 0 && completed === tasks.length
    };
  }

  /**
   * Документы, выпущенные при закрытии группы (ФТ-A5.2) — по завершённым задачам
   * с этим `groupId`. Идём через задачи, а не через `sourceEntityId`: у
   * удостоверения источник — запись слушателя, и связи с группой у самого
   * документа нет.
   */
  listGroupDocuments(tenantId: string, groupId: string): GeneratedDocumentEntity[] {
    const documentIds = this.state.tasks
      .filter(
        (t) =>
          t.tenantId === tenantId &&
          t.groupId === groupId &&
          t.status === 'completed' &&
          t.generatedDocumentId
      )
      .map((t) => t.generatedDocumentId!);
    return this.state.generatedDocuments.filter(
      (d) => d.tenantId === tenantId && documentIds.includes(d.id) && d.status !== 'archived'
    );
  }

  /**
   * Выданные документы центра в том объёме, в каком их считает панель руководителя (ТЗ 8.3).
   *
   * Отдаётся срез, а не сами документы: панели нужно «сколько и по какому зачислению», а в
   * документе лежит словарь подстановок с ПДн. Отдавать его наружу ради счётчика незачем.
   */
  issuedDocumentRefs(tenantId: string): Array<{
    sourceEntityType: string;
    sourceEntityId: string;
    isFinal: boolean;
    status: string;
  }> {
    return this.state.generatedDocuments
      .filter((d) => d.tenantId === tenantId)
      .map((d) => ({
        sourceEntityType: d.sourceEntityType,
        sourceEntityId: d.sourceEntityId,
        isFinal: d.isFinal,
        status: d.status
      }));
  }

  private assertTemplateOfType(tenantId: string, templateId: string, expected: TemplateType) {
    const tpl = this.state.templates.find((t) => t.tenantId === tenantId && t.id === templateId);
    if (!tpl)
      throw new NotFoundException({
        code: 'template_not_found',
        message: `Template ${templateId} not found`
      });
    if (tpl.templateType !== expected) {
      throw new BadRequestException({
        code: 'invalid_template_type',
        message: `Expected template_type='${expected}' (got '${tpl.templateType}')`
      });
    }
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
      throw new NotFoundException({
        code: 'template_not_found',
        message: `Template ${req.templateId} not found`
      });
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
      const certificates = await this.ensureOrderCertificates(
        tenantId,
        actorId,
        existing,
        req,
        ctx
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

    const certificates = await this.ensureOrderCertificates(tenantId, actorId, order, req, ctx);
    return { order, certificates, alreadyExisted: false };
  }

  /**
   * Гарантирует, что для каждого `enrollmentId` в `req` существует удостоверение,
   * привязанное к `order`. Пропускает уже выпущенные (идемпотентность внутри приказа).
   * Вызывается как на новом приказе, так и при повторном вызове `issueGroupOrder`
   * (self-healing: до-выпускает удостоверения, пропущенные в предыдущем прерванном запросе).
   */
  private async ensureOrderCertificates(
    tenantId: string,
    actorId: string | undefined,
    order: GeneratedDocumentEntity,
    req: IssueGroupOrderRequest,
    ctx: RequestContext
  ): Promise<GeneratedDocumentEntity[]> {
    if (!req.certificateTemplateId || req.enrollmentIds.length === 0) {
      return this.state.generatedDocuments.filter(
        (d) => d.tenantId === tenantId && d.groupOrderDocumentId === order.id
      );
    }
    const certTpl = this.state.templates.find(
      (t) => t.tenantId === tenantId && t.id === req.certificateTemplateId
    );
    if (!certTpl) {
      throw new NotFoundException({
        code: 'template_not_found',
        message: `Template ${req.certificateTemplateId} not found`
      });
    }
    const certVersionId =
      certTpl.currentVersionId ??
      this.state.versions.find(
        (v) => v.tenantId === tenantId && v.templateId === req.certificateTemplateId && v.isActive
      )?.id ??
      '';
    const now = this.now();
    for (const enrId of req.enrollmentIds) {
      // Within-order idempotency: тот же enrollment не выпускается дважды этим же
      // приказом (любой статус — приказ уже отработал по нему, в т.ч. при ре-вызове
      // alreadyExisted-ветки).
      const dup = this.state.generatedDocuments.find(
        (d) =>
          d.tenantId === tenantId &&
          d.sourceEntityType === 'enrollment' &&
          d.sourceEntityId === enrId &&
          d.templateId === req.certificateTemplateId &&
          d.groupOrderDocumentId === order.id
      );
      if (dup) {
        continue;
      }
      // Cross-flow dedup: у слушателя уже может быть ДЕЙСТВУЮЩЕЕ удостоверение по
      // этому (enrollment, шаблону), выпущенное другим потоком — авто-выдача при
      // завершении обучения (generateDocument→completeTask, без groupOrderDocumentId)
      // или другой приказ. Второй валидный номер недопустим: §17 «перевыпуск» — это
      // контролируемая операция (reissueDocument: revoke оригинала + новый номер со
      // связкой replaces/replaced_by), а не молчаливый дубль. Аннулированное (revoked)
      // удостоверение НЕ блокирует — у слушателя нет действующего, приказ выпускает заново.
      const existingValid = this.state.generatedDocuments.find(
        (d) =>
          d.tenantId === tenantId &&
          d.sourceEntityType === 'enrollment' &&
          d.sourceEntityId === enrId &&
          d.templateId === req.certificateTemplateId &&
          d.status !== 'revoked'
      );
      if (existingValid) {
        // Переиспользуем существующее удостоверение: если оно ещё не привязано ни к
        // какому приказу — back-link на текущий приказ, чтобы приказ ссылался на тот же
        // номер (трассировка через groupOrderDocumentId), а не плодил дубликат.
        if (!existingValid.groupOrderDocumentId) {
          existingValid.groupOrderDocumentId = order.id;
          await this.auditService.writeCritical({
            tenantId,
            actorId,
            action: 'documents.certificate_reused_in_order',
            entityType: 'documents.generated',
            entityId: existingValid.id,
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
      await this.auditService.writeCritical({
        tenantId,
        actorId,
        action: 'documents.certificate_issued_via_order',
        entityType: 'documents.generated',
        entityId: cert.id,
        newValues: { enrollmentId: enrId, orderId: order.id } as unknown as Record<string, unknown>,
        requestId: ctx.requestId,
        correlationId: ctx.correlationId,
        ip: ctx.ip,
        userAgent: ctx.userAgent
      });
    }
    return this.state.generatedDocuments.filter(
      (d) => d.tenantId === tenantId && d.groupOrderDocumentId === order.id
    );
  }
}

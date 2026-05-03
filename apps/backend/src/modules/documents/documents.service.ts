import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';

import { DOCUMENTS_STATE } from './documents-state.token.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

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

@Injectable()
export class DocumentsService {
  private static readonly variableCategories = new Set([
    'tenant',
    'group',
    'learner',
    'counterparty',
    'course',
    'commission',
    'document'
  ]);

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
  setCurrentVersion(tenantId: string, id: string, versionId: string) {
    const tpl = this.getTemplate(tenantId, id);
    const version = this.must(this.state.versions, tenantId, versionId);
    if (version.templateId !== id) throw new BadRequestException('Template version mismatch');
    tpl.currentVersionId = version.id;
    tpl.updatedAt = this.now();
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
  activateTemplateVersion(tenantId: string, id: string) {
    const version = this.getTemplateVersion(tenantId, id);
    this.state.versions
      .filter((x) => x.tenantId === tenantId && x.templateId === version.templateId)
      .forEach((x) => {
        x.isActive = x.id === id;
      });
    this.setCurrentVersion(tenantId, version.templateId, id);
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
    if (!DocumentsService.variableCategories.has(req.categoryCode)) {
      throw new BadRequestException(`Unsupported variable category ${req.categoryCode}`);
    }
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
    if (req.categoryCode && !DocumentsService.variableCategories.has(req.categoryCode)) {
      throw new BadRequestException(`Unsupported variable category ${req.categoryCode}`);
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
    req: GenerateDocumentsBatchRequest
  ) {
    const sourceIds = req.sourceEntityIds.map((item) => item.trim()).filter(Boolean);
    return {
      items: sourceIds.map((sourceEntityId) =>
        this.generateDocument(tenantId, actorId, {
          templateId: req.templateId,
          templateVersionId: req.templateVersionId,
          sourceEntityType: req.sourceEntityType,
          sourceEntityId,
          documentType: req.documentType,
          idempotencyKey: `${sourceEntityId}-${Date.now()}`
        })
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
      generatedAt: this.now()
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
  finalizeDocument(tenantId: string, id: string) {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived')
      throw new BadRequestException('Archived document cannot be finalized');
    doc.status = 'final';
    doc.isFinal = true;
    return doc;
  }
  archiveDocument(tenantId: string, id: string) {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived') return doc;
    doc.status = 'archived';
    doc.archivedAt = this.now();
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
  activateNumberingRule(tenantId: string, id: string) {
    const row = this.getNumberingRule(tenantId, id);
    this.state.numberingRules
      .filter((x) => x.tenantId === tenantId && x.documentType === row.documentType)
      .forEach((x) => {
        x.isActive = x.id === id;
        x.updatedAt = this.now();
      });
    return row;
  }
  deactivateNumberingRule(tenantId: string, id: string) {
    const row = this.getNumberingRule(tenantId, id);
    row.isActive = false;
    row.updatedAt = this.now();
    return row;
  }

  reserveNumber(tenantId: string, documentType: string) {
    let rule = this.state.numberingRules.find(
      (x) => x.tenantId === tenantId && x.documentType === documentType && x.isActive
    );
    if (!rule) {
      rule = {
        id: this.id('nrule'),
        tenantId,
        documentType,
        prefix: '',
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
      requestId: task.requestId
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
}

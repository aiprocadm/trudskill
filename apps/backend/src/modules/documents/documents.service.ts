import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../../common/context/request-context.js';
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

@Injectable()
export class DocumentsService {
  private templates: TemplateEntity[] = [];
  private versions: TemplateVersionEntity[] = [];
  private variables: TemplateVariableEntity[] = [];
  private bindings: TemplateBindingEntity[] = [];
  private tasks: DocumentGenerationTaskEntity[] = [];
  private generatedDocuments: GeneratedDocumentEntity[] = [];
  private numberingRules: NumberingRuleEntity[] = [];
  private reservations: NumberReservationEntity[] = [];
  private idem = new Map<string, string>();

  constructor(private readonly auditService: AuditService) {}

  listTemplates(tenantId: string, query: BaseFilter) { return this.page(this.templates.filter((x) => x.tenantId === tenantId), query); }
  createTemplate(tenantId: string, actorId: string | undefined, req: CreateTemplateRequest, ctx: RequestContext) {
    const now = this.now();
    const entity: TemplateEntity = { id: this.id('tpl'), tenantId, name: req.name, templateType: req.templateType, description: req.description, status: 'active', createdBy: actorId, createdAt: now, updatedAt: now };
    this.templates.push(entity);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.template_created',
      entityType: 'documents.template',
      entityId: entity.id,
      newValues: entity,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return entity;
  }
  getTemplate(tenantId: string, id: string) { return this.must(this.templates, tenantId, id); }
  updateTemplate(tenantId: string, actorId: string | undefined, id: string, req: UpdateTemplateRequest, ctx: RequestContext) {
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
      newValues: current,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return current;
  }
  archiveTemplate(tenantId: string, actorId: string | undefined, id: string, ctx: RequestContext) { return this.updateTemplate(tenantId, actorId, id, { status: 'archived' }, ctx); }
  unarchiveTemplate(tenantId: string, actorId: string | undefined, id: string, ctx: RequestContext) { return this.updateTemplate(tenantId, actorId, id, { status: 'active' }, ctx); }
  setCurrentVersion(tenantId: string, id: string, versionId: string) {
    const tpl = this.getTemplate(tenantId, id);
    const version = this.must(this.versions, tenantId, versionId);
    if (version.templateId !== id) throw new BadRequestException('Template version mismatch');
    tpl.currentVersionId = version.id;
    tpl.updatedAt = this.now();
    return tpl;
  }

  listTemplateVersions(tenantId: string, query: BaseFilter) {
    const rows = this.versions.filter((x) => x.tenantId === tenantId && (!query.templateId || query.templateId === x.templateId));
    return this.page(rows, query);
  }
  createTemplateVersion(tenantId: string, actorId: string | undefined, req: CreateTemplateVersionRequest) {
    this.getTemplate(tenantId, req.templateId);
    const entity: TemplateVersionEntity = {
      id: this.id('tplv'), tenantId, templateId: req.templateId, versionNo: this.versions.filter((x) => x.templateId === req.templateId).length + 1,
      fileId: req.fileId, variablesSchema: req.variablesSchema ?? {}, isActive: false, createdBy: actorId, createdAt: this.now()
    };
    this.versions.push(entity);
    return entity;
  }
  getTemplateVersion(tenantId: string, id: string) { return this.must(this.versions, tenantId, id); }
  updateTemplateVersion(tenantId: string, id: string, req: UpdateTemplateVersionRequest) {
    const v = this.getTemplateVersion(tenantId, id);
    if (req.variablesSchema) v.variablesSchema = req.variablesSchema;
    if (typeof req.isActive === 'boolean') v.isActive = req.isActive;
    return v;
  }
  activateTemplateVersion(tenantId: string, id: string) {
    const version = this.getTemplateVersion(tenantId, id);
    this.versions.filter((x) => x.tenantId === tenantId && x.templateId === version.templateId).forEach((x) => { x.isActive = x.id === id; });
    this.setCurrentVersion(tenantId, version.templateId, id);
    return version;
  }

  listTemplateVariables(tenantId: string, query: BaseFilter) {
    const rows = this.variables.filter((x) => x.tenantId === tenantId && !x.deletedAt && (!query.templateVersionId || query.templateVersionId === x.templateVersionId));
    return this.page(rows, query);
  }
  createTemplateVariable(tenantId: string, req: CreateTemplateVariableRequest) {
    this.getTemplateVersion(tenantId, req.templateVersionId);
    const duplicate = this.variables.find((x) => x.tenantId === tenantId && x.templateVersionId === req.templateVersionId && x.variableCode === req.variableCode && !x.deletedAt);
    if (duplicate) throw new ConflictException('Variable code already exists');
    const entity: TemplateVariableEntity = { id: this.id('tplvar'), tenantId, templateVersionId: req.templateVersionId, variableCode: req.variableCode, displayName: req.displayName, categoryCode: req.categoryCode, dataType: req.dataType, isRequired: req.isRequired ?? false, description: req.description };
    this.variables.push(entity);
    return entity;
  }
  getTemplateVariable(tenantId: string, id: string) { return this.must(this.variables.filter((x) => !x.deletedAt), tenantId, id); }
  updateTemplateVariable(tenantId: string, id: string, req: UpdateTemplateVariableRequest) {
    const row = this.getTemplateVariable(tenantId, id);
    Object.assign(row, req);
    return row;
  }
  deleteTemplateVariable(tenantId: string, id: string) {
    const row = this.getTemplateVariable(tenantId, id);
    row.deletedAt = this.now();
    return { deleted: true };
  }

  listTemplateBindings(tenantId: string, query: BaseFilter) { return this.page(this.bindings.filter((x) => x.tenantId === tenantId), query); }
  createTemplateBinding(tenantId: string, req: CreateTemplateBindingRequest) {
    this.getTemplate(tenantId, req.templateId);
    this.validateBindingPayload(req.bindType, req.directionId, req.courseId, req.groupId);
    const entity: TemplateBindingEntity = { id: this.id('tplbind'), tenantId, templateId: req.templateId, bindType: req.bindType, directionId: req.directionId, courseId: req.courseId, groupId: req.groupId, attachMode: req.attachMode ?? 'strict', inheritToChildren: req.inheritToChildren ?? false, priority: req.priority ?? 100, createdAt: this.now() };
    this.bindings.push(entity);
    return entity;
  }
  getTemplateBinding(tenantId: string, id: string) { return this.must(this.bindings, tenantId, id); }
  updateTemplateBinding(tenantId: string, id: string, req: UpdateTemplateBindingRequest) {
    const row = this.getTemplateBinding(tenantId, id);
    Object.assign(row, req);
    this.validateBindingPayload(row.bindType, row.directionId, row.courseId, row.groupId);
    return row;
  }
  deleteTemplateBinding(tenantId: string, id: string) { this.getTemplateBinding(tenantId, id); this.bindings = this.bindings.filter((x) => !(x.tenantId === tenantId && x.id === id)); return { deleted: true }; }

  listDocumentTasks(tenantId: string, query: BaseFilter) { return this.page(this.tasks.filter((x) => x.tenantId === tenantId), query); }
  getDocumentTask(tenantId: string, id: string) { return this.must(this.tasks, tenantId, id); }
  retryTask(tenantId: string, id: string) {
    const task = this.getDocumentTask(tenantId, id);
    if (task.status !== 'failed') throw new BadRequestException('Retry allowed only for failed tasks');
    task.status = 'queued';
    task.errorMessage = undefined;
    task.startedAt = undefined;
    task.finishedAt = undefined;
    return task;
  }

  listDocuments(tenantId: string, query: BaseFilter) {
    const rows = this.generatedDocuments.filter((x) => x.tenantId === tenantId && (!query.documentType || x.documentType === query.documentType));
    return this.page(rows, query);
  }
  getDocument(tenantId: string, id: string) { return this.must(this.generatedDocuments, tenantId, id); }
  generateDocument(tenantId: string, actorId: string | undefined, req: GenerateDocumentRequest) {
    const idemKey = `${tenantId}:${req.idempotencyKey}`;
    const existingId = this.idem.get(idemKey);
    if (existingId) return this.getDocumentTask(tenantId, existingId);
    const template = this.getTemplate(tenantId, req.templateId);
    if (template.status === 'archived') throw new BadRequestException('Cannot generate documents from archived template');
    const versionId = req.templateVersionId ?? template.currentVersionId;
    if (!versionId) throw new BadRequestException('No template version selected');
    this.getTemplateVersion(tenantId, versionId);
    const task: DocumentGenerationTaskEntity = {
      id: this.id('dtask'), tenantId, templateId: template.id, templateVersionId: versionId, taskType: 'generate', sourceEntityType: req.sourceEntityType, sourceEntityId: req.sourceEntityId, status: 'queued', requestedBy: actorId, requestedAt: this.now()
    };
    this.tasks.push(task);
    this.idem.set(idemKey, task.id);
    return task;
  }

  completeTask(tenantId: string, taskId: string, fileId: string, generatedBy?: string) {
    const task = this.getDocumentTask(tenantId, taskId);
    if (task.status === 'completed') return this.getDocument(tenantId, task.generatedDocumentId!);
    if (task.status !== 'queued' && task.status !== 'running') throw new BadRequestException('Task state is not processable');
    task.status = 'running';
    task.startedAt = task.startedAt ?? this.now();
    const reserved = this.reserveNumber(tenantId, 'default');
    const generated: GeneratedDocumentEntity = {
      id: this.id('gdoc'), tenantId, templateId: task.templateId, templateVersionId: task.templateVersionId!, documentType: 'default', name: `Document ${reserved.reservedNumber}`,
      sourceEntityType: task.sourceEntityType, sourceEntityId: task.sourceEntityId, fileId, status: 'generated', documentNumber: reserved.reservedNumber, documentDate: this.now().slice(0, 10), isFinal: false, generatedBy, generatedAt: this.now()
    };
    this.generatedDocuments.push(generated);
    task.status = 'completed';
    task.finishedAt = this.now();
    task.generatedDocumentId = generated.id;
    reserved.status = 'used';
    reserved.documentId = generated.id;
    reserved.usedAt = this.now();
    return generated;
  }
  failTask(tenantId: string, id: string, message: string) {
    const task = this.getDocumentTask(tenantId, id);
    if (task.status === 'completed') throw new BadRequestException('Completed task cannot be failed');
    task.status = 'failed';
    task.errorMessage = message;
    task.finishedAt = this.now();
    return task;
  }
  finalizeDocument(tenantId: string, id: string) {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived') throw new BadRequestException('Archived document cannot be finalized');
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

  listNumberingRules(tenantId: string, query: BaseFilter) { return this.page(this.numberingRules.filter((x) => x.tenantId === tenantId), query); }
  createNumberingRule(tenantId: string, req: CreateNumberingRuleRequest) {
    this.numberingRules
      .filter((x) => x.tenantId === tenantId && x.documentType === req.documentType)
      .forEach((x) => {
        x.isActive = false;
        x.updatedAt = this.now();
      });
    const entity: NumberingRuleEntity = { id: this.id('nrule'), tenantId, documentType: req.documentType, prefix: req.prefix ?? '', suffix: req.suffix ?? '', pattern: req.pattern ?? '{prefix}{counter}{suffix}', currentCounter: 0, resetPeriod: req.resetPeriod ?? 'none', isActive: true, updatedAt: this.now() };
    this.numberingRules.push(entity);
    return entity;
  }
  getNumberingRule(tenantId: string, id: string) { return this.must(this.numberingRules, tenantId, id); }
  updateNumberingRule(tenantId: string, id: string, req: UpdateNumberingRuleRequest) { const row = this.getNumberingRule(tenantId, id); Object.assign(row, req, { updatedAt: this.now() }); return row; }
  activateNumberingRule(tenantId: string, id: string) {
    const row = this.getNumberingRule(tenantId, id);
    this.numberingRules
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
    const rule = this.numberingRules.find((x) => x.tenantId === tenantId && x.documentType === documentType && x.isActive);
    if (!rule) throw new NotFoundException(`No numbering rule for ${documentType}`);
    const periodKey = this.periodKey(rule.resetPeriod);
    if (rule.periodKey && rule.periodKey !== periodKey) rule.currentCounter = 0;
    rule.periodKey = periodKey;
    rule.currentCounter += 1;
    const counter = `${rule.currentCounter}`.padStart(6, '0');
    const formatted = rule.pattern.replace('{prefix}', rule.prefix).replace('{suffix}', rule.suffix).replace('{counter}', counter);
    if (this.reservations.some((x) => x.tenantId === tenantId && x.reservedNumber === formatted)) {
      throw new ConflictException(`Reservation number ${formatted} already exists`);
    }
    const reservation: NumberReservationEntity = { id: this.id('nres'), tenantId, ruleId: rule.id, reservedNumber: formatted, reservedAt: this.now(), status: 'reserved' };
    this.reservations.push(reservation);
    return reservation;
  }

  private periodKey(reset: 'none' | 'year' | 'month') {
    const d = new Date();
    if (reset === 'year') return `${d.getUTCFullYear()}`;
    if (reset === 'month') return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, '0')}`;
    return 'all';
  }
  private page<T extends { name?: string }>(rows: T[], query: BaseFilter) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.toLowerCase();
    const filtered = search ? rows.filter((x) => JSON.stringify(x).toLowerCase().includes(search)) : rows;
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: filtered.length };
  }
  private must<T extends { tenantId: string; id: string }>(arr: T[], tenantId: string, id: string) {
    const row = arr.find((x) => x.tenantId === tenantId && x.id === id);
    if (!row) throw new NotFoundException(`Entity ${id} not found`);
    return row;
  }
  private id(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }
  private now() { return new Date().toISOString(); }
  private validateBindingPayload(bindType: 'direction' | 'course' | 'group', directionId?: string, courseId?: string, groupId?: string) {
    if (bindType === 'direction' && !directionId) throw new BadRequestException('directionId is required for direction binding');
    if (bindType === 'course' && !courseId) throw new BadRequestException('courseId is required for course binding');
    if (bindType === 'group' && !groupId) throw new BadRequestException('groupId is required for group binding');
  }
}

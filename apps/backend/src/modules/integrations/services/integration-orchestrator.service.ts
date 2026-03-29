import { Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { RealtimeEventsService } from '../../core/realtime-events.service.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { CreateCredentialDto, CreateExportTaskDto, CreateProviderDto, RotateSecretDto, UpdateCredentialDto, UpdateProviderDto } from '../dto/integrations.dto.js';
import type { Credential, ExportItem, ExportTask, Provider, SyncLog } from '../integrations.types.js';
import { IdempotencyService } from './idempotency.service.js';
import { IntegrationCryptoService } from './integration-crypto.service.js';
import { ProviderRegistry } from './provider-registry.service.js';

interface ListQuery {
  q?: string;
  status?: string;
  created_from?: string;
  created_to?: string;
  sort?: string;
  page?: string;
  page_size?: string;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class IntegrationOrchestratorService {
  private providers: Provider[] = [];
  private credentials: Credential[] = [];
  private tasks: ExportTask[] = [];
  private items: ExportItem[] = [];
  private logs: SyncLog[] = [];

  constructor(
    private readonly crypto: IntegrationCryptoService,
    private readonly idempotency: IdempotencyService,
    private readonly registry: ProviderRegistry,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeEventsService
  ) {}

  listProviders(query?: ListQuery) {
    const sorted = this.sortItems(
      this.providers.filter((item) => this.matchesText(item, query?.q)),
      query?.sort
    );
    return this.paginate(
      sorted,
      query
    );
  }
  getProvider(id: string) { return this.providers.find((item) => item.id === id) ?? null; }
  createProvider(dto: CreateProviderDto): Provider {
    const row: Provider = { id: this.id('prov'), code: dto.code, name: dto.name, providerType: dto.providerType, isActive: dto.isActive ?? true };
    this.providers.push(row);
    return row;
  }
  patchProvider(id: string, dto: UpdateProviderDto): Provider {
    const row = this.requireProvider(id);
    Object.assign(row, dto);
    return row;
  }

  listCredentials(tenantId: string, query?: ListQuery) {
    const rows = this.credentials
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => this.matchesText(item, query?.q))
      .filter((item) => (query?.status ? item.status === query.status : true))
      .map((item) => this.maskCredential(item));

    return this.paginate(this.sortItems(rows, query?.sort), query);
  }
  getCredential(tenantId: string, id: string) { return this.maskCredential(this.requireCredential(tenantId, id)); }
  createCredential(tenantId: string, dto: CreateCredentialDto, ctx: RequestContext) {
    const row: Credential = {
      id: this.id('cred'), tenantId, providerId: dto.providerId, name: dto.name, settingsJsonb: dto.settingsJsonb,
      secretEncrypted: this.crypto.encrypt(dto.secret), status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), secretVersion: 1
    };
    this.credentials.push(row);
    this.audit.write({ tenantId, actorUserId: ctx.userId ?? 'system', action: 'integration.credentials.created', targetType: 'integration_credential', targetId: row.id, metadata: { providerId: row.providerId } });
    return this.maskCredential(row);
  }
  patchCredential(tenantId: string, id: string, dto: UpdateCredentialDto) {
    const row = this.requireCredential(tenantId, id);
    Object.assign(row, dto, { updatedAt: new Date().toISOString() });
    return this.maskCredential(row);
  }
  rotateSecret(tenantId: string, id: string, dto: RotateSecretDto, ctx: RequestContext) {
    const row = this.requireCredential(tenantId, id);
    row.secretEncrypted = this.crypto.encrypt(dto.secret);
    row.secretVersion += 1;
    row.updatedAt = new Date().toISOString();
    this.audit.write({ tenantId, actorUserId: ctx.userId ?? 'system', action: 'integration.credentials.secret_rotated', targetType: 'integration_credential', targetId: row.id, metadata: { secretVersion: row.secretVersion } });
    return this.maskCredential(row);
  }
  setCredentialStatus(tenantId: string, id: string, status: 'active' | 'inactive') { const row = this.requireCredential(tenantId, id); row.status = status; row.updatedAt = new Date().toISOString(); return this.maskCredential(row); }

  async testConnection(tenantId: string, id: string) {
    const credential = this.requireCredential(tenantId, id);
    const provider = this.requireProvider(credential.providerId);
    const adapter = this.registry.resolve(provider.code);
    return adapter.testConnection({ credentials: credential.settingsJsonb });
  }

  listTasks(tenantId: string, query?: ListQuery) {
    const rows = this.tasks
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => this.matchesText(item, query?.q))
      .filter((item) => (query?.status ? item.status === query.status : true))
      .filter((item) => this.inDateRange(item.requestedAt, query));
    return this.paginate(this.sortItems(rows, query?.sort), query);
  }
  getTask(tenantId: string, id: string) { return this.requireTask(tenantId, id); }
  getTaskItems(tenantId: string, taskId: string) { this.requireTask(tenantId, taskId); return this.items.filter((item) => item.tenantId === tenantId && item.taskId === taskId); }
  getItem(tenantId: string, id: string) { const row = this.items.find((it) => it.id === id && it.tenantId === tenantId); if (!row) throw new NotFoundException({ code: 'not_found', message: 'Export item not found' }); return row; }

  async createExportTask(tenantId: string, requestedBy: string, dto: CreateExportTaskDto, idempotencyKey?: string) {
    const key = idempotencyKey ? `${tenantId}:export:${idempotencyKey}` : undefined;
    if (key) {
      const existing = this.idempotency.get<ExportTask>(key);
      if (existing) return existing;
    }
    const adapter = this.registry.resolve(dto.providerCode);
    const task: ExportTask = { id: this.id('exp'), tenantId, providerCode: dto.providerCode, exportType: dto.exportType, sourceFilterJsonb: dto.sourceFilterJsonb, status: 'queued', requestedBy, requestedAt: new Date().toISOString(), idempotencyKey };
    this.tasks.push(task);
    if (key) this.idempotency.remember(key, task);
    this.realtime.publish({ event_name: 'integration.export.requested', version: 'v1', tenant_id: tenantId, occurred_at: new Date().toISOString(), payload: { task_id: task.id, provider_code: task.providerCode } });

    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.realtime.publish({ event_name: 'integration.export.started', version: 'v1', tenant_id: tenantId, occurred_at: new Date().toISOString(), payload: { task_id: task.id } });
    const payload = await adapter.prepareExportPayload({ exportType: dto.exportType, sourceFilter: dto.sourceFilterJsonb });
    const sent = await adapter.sendExportBatch({ payload });

    const item: ExportItem = { id: this.id('item'), tenantId, taskId: task.id, entityType: 'export_entity', entityId: `${dto.exportType}:${task.id}`, status: sent.status };
    this.items.push(item);
    task.status = sent.status;
    task.finishedAt = new Date().toISOString();
    task.resultFileId = sent.status === 'completed' ? `file_${task.id}` : undefined;
    task.responsePayloadJsonb = { externalBatchId: sent.externalBatchId };
    this.logs.push({ id: this.id('log'), tenantId, providerCode: dto.providerCode, entityType: 'export_task', entityId: task.id, requestPayloadJsonb: payload, responsePayloadJsonb: task.responsePayloadJsonb, statusCode: 200, status: 'success', createdAt: new Date().toISOString(), taskId: task.id });
    this.realtime.publish({ event_name: `integration.export.${task.status === 'failed' ? 'failed' : 'completed'}`, version: 'v1', tenant_id: tenantId, occurred_at: new Date().toISOString(), payload: { task_id: task.id, status: task.status } });
    return task;
  }

  retryTask(tenantId: string, id: string) {
    const task = this.requireTask(tenantId, id);
    if (!['failed', 'cancelled', 'partial_success'].includes(task.status)) throw new PreconditionFailedException({ code: 'precondition_failed', message: 'Task cannot be retried' });
    task.status = 'queued'; task.startedAt = undefined; task.finishedAt = undefined; return task;
  }
  cancelTask(tenantId: string, id: string) {
    const task = this.requireTask(tenantId, id);
    if (!['queued', 'running'].includes(task.status)) throw new PreconditionFailedException({ code: 'precondition_failed', message: 'Task cannot be cancelled' });
    task.status = 'cancelled'; task.finishedAt = new Date().toISOString(); return task;
  }

  listSyncLogs(tenantId: string, query?: ListQuery) {
    const rows = this.logs
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => this.matchesText(item, query?.q))
      .filter((item) => (query?.status ? item.status === query.status : true))
      .filter((item) => this.inDateRange(item.createdAt, query));
    return this.paginate(this.sortItems(rows, query?.sort), query);
  }
  getSyncLog(tenantId: string, id: string) { const row = this.logs.find((it) => it.id === id && it.tenantId === tenantId); if (!row) throw new NotFoundException({ code: 'not_found', message: 'Sync log not found' }); return row; }
  byEntity(tenantId: string, entityType: string, entityId: string) { return this.logs.filter((it) => it.tenantId === tenantId && it.entityType === entityType && it.entityId === entityId); }
  byProvider(tenantId: string, providerCode: string) { return this.logs.filter((it) => it.tenantId === tenantId && it.providerCode === providerCode); }

  appendWebhookLog(tenantId: string, row: Omit<SyncLog, 'id' | 'tenantId' | 'createdAt'>) {
    const log: SyncLog = { ...row, id: this.id('log'), tenantId, createdAt: new Date().toISOString() };
    this.logs.push(log);
    return log;
  }

  publishIntegrationEvent(tenantId: string, eventName: string, payload: Record<string, unknown>) {
    this.realtime.publish({
      event_name: eventName,
      version: 'v1',
      tenant_id: tenantId,
      occurred_at: new Date().toISOString(),
      payload
    });
  }

  private requireProvider(id: string) { const row = this.getProvider(id); if (!row) throw new NotFoundException({ code: 'not_found', message: 'Provider not found' }); return row; }
  private requireCredential(tenantId: string, id: string) { const row = this.credentials.find((item) => item.id === id && item.tenantId === tenantId); if (!row) throw new NotFoundException({ code: 'not_found', message: 'Credential not found' }); return row; }
  private requireTask(tenantId: string, id: string) { const row = this.tasks.find((item) => item.id === id && item.tenantId === tenantId); if (!row) throw new NotFoundException({ code: 'not_found', message: 'Export task not found' }); return row; }
  private maskCredential(item: Credential) {
    return { ...item, secretMasked: this.crypto.maskSecret(this.crypto.decrypt(item.secretEncrypted)), secretEncrypted: undefined };
  }
  private id(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 11)}`; }
  private matchesText(item: Record<string, unknown>, query?: string) {
    if (!query) return true;
    const serialized = JSON.stringify(item).toLowerCase();
    return serialized.includes(query.toLowerCase());
  }
  private inDateRange(isoDate: string, query?: ListQuery) {
    if (!query?.created_from && !query?.created_to) return true;
    const date = new Date(isoDate).getTime();
    const from = query.created_from ? new Date(query.created_from).getTime() : Number.NEGATIVE_INFINITY;
    const to = query.created_to ? new Date(query.created_to).getTime() : Number.POSITIVE_INFINITY;
    return date >= from && date <= to;
  }
  private paginate<T>(items: T[], query?: ListQuery): PaginatedResult<T> {
    const page = Math.max(1, Number(query?.page ?? 1));
    const pageSize = Math.max(1, Number(query?.page_size ?? 20));
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
  }

  private sortItems<T extends Record<string, unknown>>(items: T[], sort?: string): T[] {
    if (!sort) return items;
    const direction = sort.startsWith('-') ? -1 : 1;
    const key = sort.replace(/^-/, '');

    return [...items].sort((left, right) => {
      const a = left[key];
      const b = right[key];
      if (a === b) return 0;
      if (a === undefined || a === null) return 1;
      if (b === undefined || b === null) return -1;
      return String(a).localeCompare(String(b)) * direction;
    });
  }
}

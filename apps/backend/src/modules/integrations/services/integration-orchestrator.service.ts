import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  PreconditionFailedException
} from '@nestjs/common';

import { AdapterResolver } from './adapter-resolver.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { IntegrationCryptoService } from './integration-crypto.service.js';
import { MetricsService } from '../../../common/metrics/metrics.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { RealtimeEventsService } from '../../core/realtime-events.service.js';
import { IntegrationExportRealtimeEvents } from '../domain/integration-realtime-events.js';
import { InMemoryIntegrationOrchestratorState } from '../infrastructure/in-memory-integration-orchestrator.state.js';
import { INTEGRATION_ORCHESTRATOR_STATE } from '../infrastructure/integration-orchestrator-state.token.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type {
  CreateCredentialDto,
  CreateExportTaskDto,
  CreateProviderDto,
  RotateSecretDto,
  UpdateCredentialDto,
  UpdateProviderDto
} from '../dto/integrations.dto.js';
import type {
  Credential,
  DeadLetterEntry,
  ExportItem,
  ExportTask,
  Provider,
  SyncLog
} from '../integrations.types.js';

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
  constructor(
    @Inject(INTEGRATION_ORCHESTRATOR_STATE)
    private readonly state: InMemoryIntegrationOrchestratorState,
    @Inject(IntegrationCryptoService) private readonly crypto: IntegrationCryptoService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(AdapterResolver) private readonly adapterResolver: AdapterResolver,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimeEventsService) private readonly realtime: RealtimeEventsService,
    @Inject(MetricsService) @Optional() private readonly metrics?: MetricsService
  ) {}

  listProviders(query?: ListQuery) {
    const sorted = this.sortItems(
      this.state.providers.filter((item) => this.matchesText(item, query?.q)),
      query?.sort
    );
    return this.paginate(sorted, query);
  }
  getProvider(id: string) {
    return this.state.providers.find((item) => item.id === id) ?? null;
  }
  createProvider(dto: CreateProviderDto): Provider {
    const row: Provider = {
      id: this.id('prov'),
      code: dto.code,
      name: dto.name,
      providerType: dto.providerType,
      isActive: dto.isActive ?? true
    };
    this.state.providers.push(row);
    return row;
  }
  patchProvider(id: string, dto: UpdateProviderDto): Provider {
    const row = this.requireProvider(id);
    Object.assign(row, dto);
    return row;
  }

  listCredentials(tenantId: string, query?: ListQuery) {
    const rows = this.state.credentials
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => this.matchesText(item, query?.q))
      .filter((item) => (query?.status ? item.status === query.status : true))
      .map((item) => this.maskCredential(item));

    return this.paginate(this.sortItems(rows, query?.sort), query);
  }
  getCredential(tenantId: string, id: string) {
    return this.maskCredential(this.requireCredential(tenantId, id));
  }
  createCredential(tenantId: string, dto: CreateCredentialDto, ctx: RequestContext) {
    const row: Credential = {
      id: this.id('cred'),
      tenantId,
      providerId: dto.providerId,
      name: dto.name,
      settingsJsonb: dto.settingsJsonb,
      secretEncrypted: this.crypto.encrypt(dto.secret),
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      secretVersion: 1
    };
    this.state.credentials.push(row);
    this.audit.write({
      tenantId,
      actorId: ctx.userId ?? 'system',
      action: 'integration.credentials.created',
      entityType: 'integration_credential',
      entityId: row.id,
      newValues: { providerId: row.providerId }
    });
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
    this.audit.write({
      tenantId,
      actorId: ctx.userId ?? 'system',
      action: 'integration.credentials.secret_rotated',
      entityType: 'integration_credential',
      entityId: row.id,
      newValues: { secretVersion: row.secretVersion }
    });
    return this.maskCredential(row);
  }
  setCredentialStatus(tenantId: string, id: string, status: 'active' | 'inactive') {
    const row = this.requireCredential(tenantId, id);
    row.status = status;
    row.updatedAt = new Date().toISOString();
    return this.maskCredential(row);
  }

  async testConnection(tenantId: string, id: string) {
    const credential = this.requireCredential(tenantId, id);
    const provider = this.requireProvider(credential.providerId);
    const adapter = this.adapterResolver.resolve(provider.code);
    return adapter.testConnection({ credentials: credential.settingsJsonb });
  }

  diagnostics(tenantId: string) {
    return this.state.providers.map((provider) => {
      const providerCredentials = this.state.credentials.filter(
        (item) => item.tenantId === tenantId && item.providerId === provider.id
      );
      const lastLog = this.state.logs
        .filter((item) => item.tenantId === tenantId && item.providerCode === provider.code)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return {
        providerId: provider.id,
        providerCode: provider.code,
        providerType: provider.providerType,
        providerActive: provider.isActive,
        credentialsCount: providerCredentials.length,
        activeCredentials: providerCredentials.filter((item) => item.status === 'active').length,
        lastSyncStatus: lastLog?.status ?? 'no_data',
        lastSyncAt: lastLog?.createdAt ?? null
      };
    });
  }

  listTasks(tenantId: string, query?: ListQuery) {
    const rows = this.state.tasks
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => this.matchesText(item, query?.q))
      .filter((item) => (query?.status ? item.status === query.status : true))
      .filter((item) => this.inDateRange(item.requestedAt, query));
    return this.paginate(this.sortItems(rows, query?.sort), query);
  }
  getTask(tenantId: string, id: string) {
    return this.requireTask(tenantId, id);
  }
  getTaskItems(tenantId: string, taskId: string) {
    this.requireTask(tenantId, taskId);
    return this.state.items.filter((item) => item.tenantId === tenantId && item.taskId === taskId);
  }
  getItem(tenantId: string, id: string) {
    const row = this.state.items.find((it) => it.id === id && it.tenantId === tenantId);
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'Export item not found' });
    return row;
  }

  async createExportTask(
    tenantId: string,
    requestedBy: string,
    dto: CreateExportTaskDto,
    idempotencyKey?: string
  ) {
    const key = idempotencyKey ? `${tenantId}:export:${idempotencyKey}` : undefined;
    if (key) {
      if (this.state.idempotencyInFlight.has(key)) {
        return this.waitForIdempotentResult(key);
      }
      const existing = this.idempotency.get<ExportTask>(key);
      if (existing) return existing;
      this.state.idempotencyInFlight.add(key);
    }
    try {
      const adapter = this.adapterResolver.resolve(dto.providerCode);
      const task: ExportTask = {
        id: this.id('exp'),
        tenantId,
        providerCode: dto.providerCode,
        exportType: dto.exportType,
        sourceFilterJsonb: dto.sourceFilterJsonb,
        status: 'queued',
        requestedBy,
        requestedAt: new Date().toISOString(),
        idempotencyKey
      };
      this.state.tasks.push(task);
      if (key) this.idempotency.remember(key, task);
      this.realtime.publish({
        event_name: IntegrationExportRealtimeEvents.requested,
        version: 'v1',
        tenant_id: tenantId,
        occurred_at: new Date().toISOString(),
        payload: { task_id: task.id, provider_code: task.providerCode }
      });

      try {
        this.transitionTask(task, 'queued', 'running');
        task.startedAt = new Date().toISOString();
        this.realtime.publish({
          event_name: IntegrationExportRealtimeEvents.started,
          version: 'v1',
          tenant_id: tenantId,
          occurred_at: new Date().toISOString(),
          payload: { task_id: task.id }
        });
        const payload = await adapter.prepareExportPayload({
          exportType: dto.exportType,
          sourceFilter: dto.sourceFilterJsonb
        });
        const sent = await adapter.sendExportBatch({ payload });

        const item: ExportItem = {
          id: this.id('item'),
          tenantId,
          taskId: task.id,
          entityType: 'export_entity',
          entityId: `${dto.exportType}:${task.id}`,
          status: sent.status
        };
        this.state.items.push(item);
        if (sent.status === 'completed') {
          this.transitionTask(task, 'running', 'completed');
        } else if (sent.status === 'partial_success') {
          this.transitionTask(task, 'running', 'partial_success');
        } else {
          this.transitionTask(task, 'running', 'failed');
        }
        task.finishedAt = new Date().toISOString();
        task.resultFileId = sent.status === 'completed' ? `file_${task.id}` : undefined;
        task.responsePayloadJsonb = { externalBatchId: sent.externalBatchId };
        this.state.logs.push({
          id: this.id('log'),
          tenantId,
          providerCode: dto.providerCode,
          entityType: 'export_task',
          entityId: task.id,
          requestPayloadJsonb: payload,
          responsePayloadJsonb: task.responsePayloadJsonb,
          statusCode: 200,
          status: 'success',
          createdAt: new Date().toISOString(),
          taskId: task.id
        });
        this.realtime.publish({
          event_name:
            task.status === 'failed'
              ? IntegrationExportRealtimeEvents.failed
              : IntegrationExportRealtimeEvents.completed,
          version: 'v1',
          tenant_id: tenantId,
          occurred_at: new Date().toISOString(),
          payload: { task_id: task.id, status: task.status }
        });
      } catch (error) {
        task.status = 'failed';
        task.finishedAt = new Date().toISOString();
        const reason = error instanceof Error ? error.message : 'Unknown export error';
        const deadLetter: DeadLetterEntry = {
          id: this.id('dlq'),
          tenantId,
          taskId: task.id,
          providerCode: dto.providerCode,
          reason,
          payload: dto.sourceFilterJsonb,
          createdAt: new Date().toISOString()
        };
        this.state.deadLetters.push(deadLetter);
        this.metrics?.setDlqSize(
          this.state.deadLetters.filter((entry) => entry.tenantId === tenantId).length,
          { queue: 'integrations_export', tenant_id: tenantId }
        );
        this.state.logs.push({
          id: this.id('log'),
          tenantId,
          providerCode: dto.providerCode,
          entityType: 'export_task',
          entityId: task.id,
          requestPayloadJsonb: dto.sourceFilterJsonb,
          responsePayloadJsonb: { reason, deadLetterId: deadLetter.id },
          statusCode: 500,
          status: 'error',
          createdAt: new Date().toISOString(),
          taskId: task.id
        });
        this.realtime.publish({
          event_name: IntegrationExportRealtimeEvents.failed,
          version: 'v1',
          tenant_id: tenantId,
          occurred_at: new Date().toISOString(),
          payload: { task_id: task.id, status: task.status, reason }
        });
      }
      return task;
    } finally {
      if (key) this.state.idempotencyInFlight.delete(key);
    }
  }

  retryTask(tenantId: string, id: string) {
    const task = this.requireTask(tenantId, id);
    if (!['failed', 'cancelled', 'partial_success'].includes(task.status))
      throw new PreconditionFailedException({
        code: 'precondition_failed',
        message: 'Task cannot be retried'
      });
    task.status = 'queued';
    task.startedAt = undefined;
    task.finishedAt = undefined;
    return task;
  }
  cancelTask(tenantId: string, id: string) {
    const task = this.requireTask(tenantId, id);
    if (!['queued', 'running'].includes(task.status))
      throw new PreconditionFailedException({
        code: 'precondition_failed',
        message: 'Task cannot be cancelled'
      });
    task.status = 'cancelled';
    task.finishedAt = new Date().toISOString();
    return task;
  }

  listSyncLogs(tenantId: string, query?: ListQuery) {
    const rows = this.state.logs
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => this.matchesText(item, query?.q))
      .filter((item) => (query?.status ? item.status === query.status : true))
      .filter((item) => this.inDateRange(item.createdAt, query));
    return this.paginate(this.sortItems(rows, query?.sort), query);
  }
  getSyncLog(tenantId: string, id: string) {
    const row = this.state.logs.find((it) => it.id === id && it.tenantId === tenantId);
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'Sync log not found' });
    return row;
  }
  byEntity(tenantId: string, entityType: string, entityId: string) {
    return this.state.logs.filter(
      (it) => it.tenantId === tenantId && it.entityType === entityType && it.entityId === entityId
    );
  }
  byProvider(tenantId: string, providerCode: string) {
    return this.state.logs.filter(
      (it) => it.tenantId === tenantId && it.providerCode === providerCode
    );
  }
  listDeadLetters(tenantId: string) {
    return this.state.deadLetters.filter((item) => item.tenantId === tenantId);
  }

  listFailedWebhookLogs(tenantId: string, providerCode?: string) {
    return this.state.logs.filter(
      (log) =>
        log.tenantId === tenantId &&
        log.entityType === 'webhook' &&
        log.status === 'error' &&
        (providerCode ? log.providerCode === providerCode : true)
    );
  }
  appendWebhookLog(tenantId: string, row: Omit<SyncLog, 'id' | 'tenantId' | 'createdAt'>) {
    const log: SyncLog = {
      ...row,
      id: this.id('log'),
      tenantId,
      createdAt: new Date().toISOString()
    };
    this.state.logs.push(log);
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

  private requireProvider(id: string) {
    const row = this.getProvider(id);
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'Provider not found' });
    return row;
  }
  private requireCredential(tenantId: string, id: string) {
    const row = this.state.credentials.find((item) => item.id === id && item.tenantId === tenantId);
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'Credential not found' });
    return row;
  }
  private requireTask(tenantId: string, id: string) {
    const row = this.state.tasks.find((item) => item.id === id && item.tenantId === tenantId);
    if (!row) throw new NotFoundException({ code: 'not_found', message: 'Export task not found' });
    return row;
  }
  private maskCredential(item: Credential) {
    return {
      ...item,
      secretMasked: this.crypto.maskEncryptedSecret(item.secretEncrypted),
      secretEncrypted: undefined
    };
  }
  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
  }
  private matchesText(item: unknown, query?: string) {
    if (!query) return true;
    const serialized = JSON.stringify(item).toLowerCase();
    return serialized.includes(query.toLowerCase());
  }
  private inDateRange(isoDate: string, query?: ListQuery) {
    if (!query?.created_from && !query?.created_to) return true;
    const date = new Date(isoDate).getTime();
    const from = query.created_from
      ? new Date(query.created_from).getTime()
      : Number.NEGATIVE_INFINITY;
    const to = query.created_to ? new Date(query.created_to).getTime() : Number.POSITIVE_INFINITY;
    return date >= from && date <= to;
  }
  private paginate<T>(items: T[], query?: ListQuery): PaginatedResult<T> {
    const page = Math.max(1, Number(query?.page ?? 1));
    const pageSize = Math.max(1, Number(query?.page_size ?? 20));
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
  }

  private sortItems<T>(items: T[], sort?: string): T[] {
    if (!sort) return items;
    const direction = sort.startsWith('-') ? -1 : 1;
    const key = sort.replace(/^-/, '');

    return [...items].sort((left, right) => {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      const a = leftRecord[key];
      const b = rightRecord[key];
      if (a === b) return 0;
      if (a === undefined || a === null) return 1;
      if (b === undefined || b === null) return -1;
      return String(a).localeCompare(String(b)) * direction;
    });
  }

  private transitionTask(task: ExportTask, from: ExportTask['status'], to: ExportTask['status']) {
    if (task.status !== from) {
      throw new PreconditionFailedException({
        code: 'precondition_failed',
        message: `Invalid transition ${task.status} -> ${to}`
      });
    }
    task.status = to;
  }

  private async waitForIdempotentResult(key: string) {
    const attempts = 30;
    for (let i = 0; i < attempts; i += 1) {
      const existing = this.idempotency.get<ExportTask>(key);
      if (existing) return existing;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new PreconditionFailedException({
      code: 'precondition_failed',
      message: 'Idempotent operation timeout'
    });
  }
}

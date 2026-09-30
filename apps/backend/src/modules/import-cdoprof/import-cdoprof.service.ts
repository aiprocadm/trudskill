import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { CDOPROF_SOURCE } from './cdoprof-source.js';
import { ImportLiveExecutor } from './import-live.executor.js';
import { planImport, planRows } from './import-planner.js';
import { ImportRunsStore } from './import-runs.store.js';
import { summarizeRows } from './import.types.js';
import { AuditService } from '../audit/audit.service.js';
import { BackgroundTasksService } from '../background-tasks/background-tasks.service.js';
import { MvpService } from '../mvp/mvp.service.js';

import type { CdoprofSourceFactory } from './cdoprof-source.js';
import type { RowsPage } from './import-runs.store.js';
import type { ImportRowsQuery, StartImportRunRequest } from './import.request-dto.js';
import type { ImportRowPlan, ImportRun } from './import.types.js';
import type { CdoprofApiClient } from './sources/cdoprof-api-client.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Импорт из CDOPROF (МГ-K3.1/K3.2/K2.1; Фаза 4, срезы 23.1–23.2): контрагенты и слушатели.
 *
 * Сухой прогон читает источник и снимок центра, сопоставляет и пишет ТОЛЬКО запуск и строки
 * отчёта — ни одного слушателя и контрагента он не создаёт и не меняет (РМ132). Боевой прогон
 * уходит фоновой задачей (`ImportLiveExecutor`): человек сразу получает запуск и видит его в
 * «Фоновых задачах», а перенос идёт частями, не держа центр под замком целиком.
 */
@Injectable()
export class ImportCdoprofService {
  constructor(
    @Inject(ImportRunsStore) private readonly store: ImportRunsStore,
    @Inject(CDOPROF_SOURCE) private readonly source: CdoprofSourceFactory,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ImportLiveExecutor) private readonly executor: ImportLiveExecutor,
    @Inject(BackgroundTasksService) private readonly tasks: BackgroundTasksService
  ) {}

  private readonly logger = new Logger(ImportCdoprofService.name);

  async startRun(
    tenantId: string,
    actorId: string,
    request: StartImportRunRequest,
    context: RequestContext,
    today: Date = new Date()
  ): Promise<ImportRun> {
    const client = await this.readySource(tenantId);
    if (!request.dryRun) {
      return this.startLive({ tenantId, actorId, domain: request.domain, client, context, today });
    }

    const run = await this.store.createRun({
      tenantId,
      source: request.source,
      domain: request.domain,
      dryRun: true,
      startedBy: actorId
    });
    this.audit.write({
      tenantId,
      actorId,
      action: 'import.run_started',
      entityType: 'import.run',
      entityId: run.id,
      newValues: { source: run.source, domain: run.domain, dryRun: run.dryRun },
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });

    let rows: ImportRowPlan[];
    try {
      rows = await this.plan(tenantId, request.domain, client, today);
    } catch (error) {
      /* Источник не ответил или ответил не тем: запуск остаётся в истории с причиной словами. */
      const errorText = `Прежняя система не отдала данные: ${error instanceof Error ? error.message : String(error)}`;
      const stats = summarizeRows([]);
      await this.store.finishRun(tenantId, run.id, { status: 'failed', stats, errorText });
      return { ...run, status: 'failed', stats, errorText };
    }

    await this.store.addRows(tenantId, run.id, rows);
    const stats = summarizeRows(rows);
    const status = stats.failed > 0 ? 'partial' : 'succeeded';
    await this.store.finishRun(tenantId, run.id, { status, stats });
    return { ...run, status, stats };
  }

  /**
   * «Повторить только ошибки» (ТЗ §16): новый боевой запуск по тем записям, которые в прошлый
   * раз не перенеслись. Уже перенесённое повтор всё равно нашёл бы по метке источника — отбор
   * нужен, чтобы не гонять тысячи записей ради десятка исправленных.
   */
  async retryFailed(
    tenantId: string,
    actorId: string,
    runId: string,
    context: RequestContext,
    today: Date = new Date()
  ): Promise<ImportRun> {
    const previous = await this.getRun(tenantId, runId);
    if (previous.dryRun) {
      throw new ConflictException({
        code: 'import_retry_dry_run',
        message: 'Сухой прогон ничего не переносил — повторять нечего. Запустите перенос.'
      });
    }
    const failed = await this.store.listRows(tenantId, runId, {
      action: 'failed',
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0
    });
    if (failed.total === 0) {
      throw new ConflictException({
        code: 'import_nothing_to_retry',
        message: 'В этом переносе нет строк с ошибками — повторять нечего.'
      });
    }
    const client = await this.readySource(tenantId);
    return this.startLive({
      tenantId,
      actorId,
      domain: previous.domain,
      client,
      context,
      today,
      only: new Set(failed.items.map((row) => `${row.domain}:${row.sourceId}`)),
      retryOf: runId
    });
  }

  /** Источник подключён и другой перенос не идёт — иначе отказ словами (409). */
  private async readySource(tenantId: string): Promise<CdoprofApiClient> {
    const client = this.source.clientFor(tenantId);
    if (!client) {
      throw new ConflictException({
        code: 'import_source_not_configured',
        message:
          'Перенос данных для этого центра не подключён: нужен ключ доступа к прежней системе обучения, его вносит владелец платформы.'
      });
    }
    if (await this.store.hasRunning(tenantId)) {
      throw new ConflictException({
        code: 'import_already_running',
        message: 'Перенос уже идёт — дождитесь его окончания, затем запустите новый.'
      });
    }
    return client;
  }

  private async startLive(input: {
    tenantId: string;
    actorId: string;
    domain: StartImportRunRequest['domain'];
    client: CdoprofApiClient;
    context: RequestContext;
    today: Date;
    only?: ReadonlySet<string>;
    retryOf?: string;
  }): Promise<ImportRun> {
    const task = await this.tasks.start({
      tenantId: input.tenantId,
      kind: 'data_import',
      title: input.retryOf
        ? 'Перенос данных из прежней системы: повтор строк с ошибками'
        : 'Перенос данных из прежней системы',
      createdBy: input.actorId
    });
    const run = await this.store.createRun({
      tenantId: input.tenantId,
      source: 'api',
      domain: input.domain,
      dryRun: false,
      startedBy: input.actorId,
      backgroundTaskId: task.id,
      ...(input.retryOf ? { stats: { retryOf: input.retryOf } } : {})
    });
    this.audit.write({
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'import.run_started',
      entityType: 'import.run',
      entityId: run.id,
      newValues: {
        source: run.source,
        domain: run.domain,
        dryRun: false,
        ...(input.retryOf ? { retryOf: input.retryOf } : {})
      },
      requestId: input.context.requestId,
      correlationId: input.context.correlationId,
      ip: input.context.ip,
      userAgent: input.context.userAgent
    });
    /* Ответ не ждёт переноса: 13 755 слушателей не укладываются во время запроса. */
    this.executor
      .execute({
        tenantId: input.tenantId,
        actorId: input.actorId,
        runId: run.id,
        backgroundTaskId: task.id,
        domain: input.domain,
        client: input.client,
        context: input.context,
        today: input.today,
        ...(input.only ? { only: input.only } : {}),
        ...(input.retryOf ? { retryOf: input.retryOf } : {})
      })
      .catch((error: unknown) => {
        /* execute сам закрывает запуск с причиной; сюда попадает, только если отказала и запись итога. */
        this.logger.error(`Импорт ${run.id}: не удалось записать итог — ${String(error)}`);
      });
    return run;
  }

  private async plan(
    tenantId: string,
    domain: StartImportRunRequest['domain'],
    client: CdoprofApiClient,
    today: Date
  ): Promise<ImportRowPlan[]> {
    const snapshot = this.mvp.importMatchSnapshot(tenantId);
    return planRows(await planImport({ tenantId, domain, client, snapshot, today }));
  }

  listRuns(tenantId: string): Promise<ImportRun[]> {
    return this.store.listRuns(tenantId, 50);
  }

  async getRun(tenantId: string, runId: string): Promise<ImportRun> {
    const run = await this.store.getRun(tenantId, runId);
    if (!run) {
      throw new NotFoundException({
        code: 'import_run_not_found',
        message: 'Запуск импорта не найден — возможно, он из другого центра.'
      });
    }
    return run;
  }

  async listRows(tenantId: string, runId: string, query: ImportRowsQuery): Promise<RowsPage> {
    await this.getRun(tenantId, runId);
    return this.store.listRows(tenantId, runId, {
      ...(query.action ? { action: query.action } : {}),
      ...(query.errorCode ? { errorCode: query.errorCode } : {}),
      limit: query.limit ?? 100,
      offset: query.offset ?? 0
    });
  }
}

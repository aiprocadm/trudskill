import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { CDOPROF_SOURCE } from './cdoprof-source.js';
import { CDOPROF_SOURCE_SYSTEM, planCounterparties, planLearners } from './dedup.js';
import { ImportRunsStore } from './import-runs.store.js';
import { summarizeRows } from './import.types.js';
import { mapContragent, mapStudent } from './mappers.js';
import { AuditService } from '../audit/audit.service.js';
import { MvpService } from '../mvp/mvp.service.js';

import type { CdoprofSourceFactory } from './cdoprof-source.js';
import type { RowsPage } from './import-runs.store.js';
import type { ImportRowsQuery, StartImportRunRequest } from './import.request-dto.js';
import type { ImportRowPlan, ImportRun } from './import.types.js';
import type { CdoprofApiClient } from './sources/cdoprof-api-client.js';
import type { RequestContext } from '../../common/context/request-context.js';

const collect = async <T>(source: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
};

/**
 * Импорт из CDOPROF (МГ-K3.1/K3.2; Фаза 4, срез 23.1): сухой прогон контрагентов и слушателей.
 *
 * Сухой прогон читает источник и снимок центра, сопоставляет и пишет ТОЛЬКО запуск и строки
 * отчёта — ни одного слушателя и контрагента он не создаёт и не меняет (РМ132). Боевой прогон —
 * срез 23.2.
 */
@Injectable()
export class ImportCdoprofService {
  constructor(
    @Inject(ImportRunsStore) private readonly store: ImportRunsStore,
    @Inject(CDOPROF_SOURCE) private readonly source: CdoprofSourceFactory,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async startRun(
    tenantId: string,
    actorId: string,
    request: StartImportRunRequest,
    context: RequestContext,
    today: Date = new Date()
  ): Promise<ImportRun> {
    if (!request.dryRun) {
      throw new ConflictException({
        code: 'import_live_run_not_ready',
        message:
          'Перенос с записью данных ещё не включён — пока доступен только сухой прогон: он показывает, что будет перенесено, ничего не меняя.'
      });
    }
    const client = this.source.clientFor(tenantId);
    if (!client) {
      throw new ConflictException({
        code: 'import_source_not_configured',
        message:
          'Источник CDOPROF для этого центра не подключён: нужен ключ API CDOPROF, его вносит владелец платформы.'
      });
    }
    if (await this.store.hasRunning(tenantId)) {
      throw new ConflictException({
        code: 'import_already_running',
        message: 'Импорт уже идёт — дождитесь его окончания, затем запустите новый.'
      });
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
      const errorText = `CDOPROF не отдал данные: ${error instanceof Error ? error.message : String(error)}`;
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

  private async plan(
    tenantId: string,
    domain: StartImportRunRequest['domain'],
    client: CdoprofApiClient,
    today: Date
  ): Promise<ImportRowPlan[]> {
    const snapshot = this.mvp.importMatchSnapshot(tenantId);
    const rows: ImportRowPlan[] = [];
    const knownCounterparties = new Set(
      snapshot.counterparties
        .filter((item) => item.sourceSystem === CDOPROF_SOURCE_SYSTEM && item.externalId)
        .map((item) => item.externalId!)
    );

    if (domain === 'counterparties' || domain === 'all') {
      const contragents = await collect(client.iterateContragents());
      const planned = planCounterparties(
        contragents.map((record) => ({
          sourceId: String(record.id),
          mapped: mapContragent(record)
        })),
        snapshot,
        tenantId
      );
      /* Компания, которую этот запуск перенесёт или сопоставит, для слушателей — известна. */
      planned
        .filter((row) => row.action === 'created' || row.action === 'updated')
        .forEach((row) => knownCounterparties.add(row.sourceId));
      rows.push(...planned);
    }
    if (domain === 'learners' || domain === 'all') {
      const students = await collect(client.iterateStudents());
      rows.push(
        ...planLearners(
          students.map((record) => ({
            sourceId: String(record.id),
            mapped: mapStudent(record, today)
          })),
          snapshot,
          tenantId,
          knownCounterparties
        )
      );
    }
    return rows;
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

import { HttpException, Inject, Injectable } from '@nestjs/common';

import { CDOPROF_SOURCE_SYSTEM, planCounterparties, planLearners } from './dedup.js';
import { ImportRunsStore } from './import-runs.store.js';
import { UNCHANGED, summarizeRows } from './import.types.js';
import { mapContragent, mapStudent } from './mappers.js';
import { BackgroundTasksService } from '../background-tasks/background-tasks.service.js';
import { MvpStateWriter } from '../mvp/mvp-state-writer.service.js';

import type { ImportRowPlan, ImportRunDomain } from './import.types.js';
import type { CounterpartyDraft, LearnerDraft } from './mappers.js';
import type { CdoprofApiClient } from './sources/cdoprof-api-client.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { MvpService } from '../mvp/mvp.service.js';

/** Сколько записей обрабатывать под одним замком центра: между частями центр отвечает людям. */
export const IMPORT_CHUNK_SIZE = 500;

export interface LiveRunInput {
  tenantId: string;
  actorId: string;
  runId: string;
  backgroundTaskId?: string;
  domain: ImportRunDomain;
  client: CdoprofApiClient;
  /** «Повторить только ошибки»: ключи `домен:id источника`; нет — все записи. */
  only?: ReadonlySet<string>;
  /** Запуск, чьи ошибки повторяются, — для истории. */
  retryOf?: string;
  context: RequestContext;
  today: Date;
}

const collect = async <T>(source: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
};

const chunksOf = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size)
    chunks.push(items.slice(start, start + size));
  return chunks;
};

/** Отказ службы центра — строкой отчёта: код и слова, без стека. */
const failedBy = (row: ImportRowPlan, error: unknown): ImportRowPlan => {
  const response =
    error instanceof HttpException
      ? (error.getResponse() as { code?: string; message?: string })
      : undefined;
  return {
    ...row,
    action: 'failed',
    errorCode: response?.code ?? 'import_write_failed',
    errorText: response?.message ?? (error instanceof Error ? error.message : String(error))
  };
};

const unchanged = (row: ImportRowPlan): ImportRowPlan => ({
  ...row,
  action: 'skipped',
  errorCode: UNCHANGED,
  errorText: 'Уже перенесено — изменений нет.'
});

const filledText = (fields: string[]) => `Дописаны пустые поля: ${fields.length}.`;

/**
 * Боевой прогон импорта (МГ-K3.1/K2.1, срез 23.2) — вне HTTP-запроса, частями под замком центра.
 *
 * План строится тем же ходом, что и сухой прогон, затем каждая строка применяется:
 * «создать» — заводит запись с меткой источника; «сопоставлено» — дописывает только пустые поля
 * (РМ135); пропуски и отказы остаются как есть. Повтор находит всё по метке источника и отвечает
 * «изменений нет» — 0 новых записей. Одна строка с отказом не останавливает остальные.
 */
@Injectable()
export class ImportLiveExecutor {
  constructor(
    @Inject(ImportRunsStore) private readonly store: ImportRunsStore,
    @Inject(MvpStateWriter) private readonly writer: MvpStateWriter,
    @Inject(BackgroundTasksService) private readonly tasks: BackgroundTasksService
  ) {}

  /** Никогда не бросает: итог — запуск в истории и фоновая задача с причиной словами. */
  async execute(input: LiveRunInput, chunkSize = IMPORT_CHUNK_SIZE): Promise<void> {
    const rows: ImportRowPlan[] = [];
    try {
      const wants = (domain: string, sourceId: string) =>
        !input.only || input.only.has(`${domain}:${sourceId}`);
      const counterpartyIds = new Map<string, string>();
      const snapshot = await this.writer.run(input.tenantId, (mvp) =>
        mvp.importMatchSnapshot(input.tenantId)
      );
      for (const item of snapshot.counterparties) {
        if (item.sourceSystem === CDOPROF_SOURCE_SYSTEM && item.externalId)
          counterpartyIds.set(item.externalId, item.id);
      }

      if (input.domain === 'counterparties' || input.domain === 'all') {
        const records = (await collect(input.client.iterateContragents()))
          .filter((record) => wants('counterparties', String(record.id)))
          .map((record) => ({ sourceId: String(record.id), mapped: mapContragent(record) }));
        const drafts = new Map(
          records.flatMap((r) => (r.mapped.draft ? [[r.sourceId, r.mapped.draft] as const] : []))
        );
        const planned = planCounterparties(records, snapshot, input.tenantId);
        for (const chunk of chunksOf(planned, chunkSize)) {
          const applied = await this.writer.run(input.tenantId, (mvp) =>
            chunk.map((row) => this.applyCounterparty(mvp, input, row, drafts.get(row.sourceId)))
          );
          for (const row of applied) {
            if (row.targetId && row.action !== 'failed' && row.errorCode !== 'merge_candidate') {
              counterpartyIds.set(row.sourceId, row.targetId);
            }
          }
          rows.push(...applied);
          await this.store.touchRun(input.tenantId, input.runId);
        }
      }

      if (input.domain === 'learners' || input.domain === 'all') {
        const records = (await collect(input.client.iterateStudents()))
          .filter((record) => wants('learners', String(record.id)))
          .map((record) => ({
            sourceId: String(record.id),
            mapped: mapStudent(record, input.today)
          }));
        const drafts = new Map(
          records.flatMap((r) => (r.mapped.draft ? [[r.sourceId, r.mapped.draft] as const] : []))
        );
        const planned = planLearners(
          records,
          snapshot,
          input.tenantId,
          new Set(counterpartyIds.keys())
        );
        for (const chunk of chunksOf(planned, chunkSize)) {
          const applied = await this.writer.run(input.tenantId, (mvp) =>
            chunk.map((row) =>
              this.applyLearner(mvp, input, row, drafts.get(row.sourceId), counterpartyIds)
            )
          );
          rows.push(...applied);
          await this.store.touchRun(input.tenantId, input.runId);
        }
      }

      await this.store.addRows(input.tenantId, input.runId, rows);
      await this.store.saveLegacyIds(input.tenantId, rows);
      const stats = {
        ...summarizeRows(rows),
        ...(input.retryOf ? { retryOf: input.retryOf } : {})
      };
      const status = stats.failed > 0 ? 'partial' : 'succeeded';
      await this.store.finishRun(input.tenantId, input.runId, { status, stats });
      if (input.backgroundTaskId) {
        await this.tasks.finish(input.tenantId, input.backgroundTaskId, {
          status: 'succeeded',
          doneCount: stats.created + stats.updated,
          ...(stats.failed > 0
            ? { errorText: `Не перенесено строк: ${stats.failed} — причины в отчёте переноса.` }
            : {})
        });
      }
    } catch (error) {
      /* Источник или база отказали посреди переноса: сделанное остаётся в отчёте, причина — словами. */
      const errorText = `Перенос прервался: ${error instanceof Error ? error.message : String(error)}`;
      await this.store.addRows(input.tenantId, input.runId, rows);
      await this.store.saveLegacyIds(input.tenantId, rows);
      await this.store.finishRun(input.tenantId, input.runId, {
        status: 'failed',
        stats: summarizeRows(rows),
        errorText
      });
      if (input.backgroundTaskId) {
        await this.tasks.finish(input.tenantId, input.backgroundTaskId, {
          status: 'failed',
          errorText
        });
      }
    }
  }

  private applyCounterparty(
    mvp: MvpService,
    input: LiveRunInput,
    row: ImportRowPlan,
    draft: CounterpartyDraft | undefined
  ): ImportRowPlan {
    if (!draft || (row.action !== 'created' && row.action !== 'updated')) return row;
    try {
      const fields = {
        ...(draft.legalName ? { legalName: draft.legalName } : {}),
        ...(draft.inn ? { inn: draft.inn } : {}),
        ...(draft.kpp ? { kpp: draft.kpp } : {}),
        ...(draft.email ? { contactEmail: draft.email } : {})
      };
      if (row.action === 'updated' && row.targetId) {
        const filled = mvp.fillImportedCounterparty(
          input.tenantId,
          input.actorId,
          row.targetId,
          { ...fields, externalId: draft.sourceId, sourceSystem: CDOPROF_SOURCE_SYSTEM },
          input.context
        );
        return filled.length === 0
          ? unchanged(row)
          : { ...row, errorText: row.errorText ?? filledText(filled) };
      }
      const created = mvp.createCounterpartyExtended(
        input.tenantId,
        input.actorId,
        {
          code: `ИМП-${draft.sourceId}`,
          name: draft.name,
          ...fields,
          externalId: draft.sourceId,
          sourceSystem: CDOPROF_SOURCE_SYSTEM
        },
        input.context
      );
      return { ...row, targetId: created.id };
    } catch (error) {
      /* Частичный успех: отказ одной записи — строка отчёта с причиной, остальные идут дальше. */
      return failedBy(row, error);
    }
  }

  private applyLearner(
    mvp: MvpService,
    input: LiveRunInput,
    row: ImportRowPlan,
    draft: LearnerDraft | undefined,
    counterpartyIds: ReadonlyMap<string, string>
  ): ImportRowPlan {
    if (!draft || (row.action !== 'created' && row.action !== 'updated')) return row;
    try {
      const counterpartyId = draft.counterpartySourceId
        ? counterpartyIds.get(draft.counterpartySourceId)
        : undefined;
      const fields = {
        ...(draft.middleName ? { middleName: draft.middleName } : {}),
        ...(draft.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}),
        ...(draft.email ? { email: draft.email } : {}),
        ...(draft.phone ? { phone: draft.phone } : {}),
        ...(draft.position ? { position: draft.position } : {}),
        ...(counterpartyId ? { counterpartyId } : {})
      };
      if (row.action === 'updated' && row.targetId) {
        const filled = mvp.fillImportedLearner(
          input.tenantId,
          input.actorId,
          row.targetId,
          { ...fields, externalId: draft.sourceId, sourceSystem: CDOPROF_SOURCE_SYSTEM },
          input.context
        );
        return filled.length === 0
          ? unchanged(row)
          : { ...row, errorText: row.errorText ?? filledText(filled) };
      }
      const created = mvp.createLearnerExtended(
        input.tenantId,
        input.actorId,
        {
          firstName: draft.firstName,
          lastName: draft.lastName,
          ...fields,
          ...(draft.snils ? { snils: draft.snils } : {}),
          externalId: draft.sourceId,
          sourceSystem: CDOPROF_SOURCE_SYSTEM
        },
        input.context
      );
      return { ...row, targetId: created.id };
    } catch (error) {
      /* Частичный успех: отказ одной записи — строка отчёта с причиной, остальные идут дальше. */
      return failedBy(row, error);
    }
  }
}

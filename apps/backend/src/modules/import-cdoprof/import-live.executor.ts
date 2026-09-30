import { HttpException, Inject, Injectable } from '@nestjs/common';

import { CDOPROF_SOURCE_SYSTEM } from './dedup.js';
import { domainsOf, planImport } from './import-planner.js';
import { ImportRunsStore } from './import-runs.store.js';
import { MERGE_CANDIDATE, UNCHANGED, summarizeRows } from './import.types.js';
import { BackgroundTasksService } from '../background-tasks/background-tasks.service.js';
import { MvpStateWriter } from '../mvp/mvp-state-writer.service.js';

import type { ImportDrafts } from './import-planner.js';
import type { ImportDomain, ImportRowPlan, ImportRunDomain } from './import.types.js';
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

/** Соответствия «id источника → id центра» по доменам — собираются по ходу переноса. */
type Links = Record<ImportDomain, Map<string, string>>;

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

const moment = (day: string) => `${day}T00:00:00.000Z`;

/** Строка, у которой есть адресат в центре, — адресат для ссылок следующих доменов. */
const linkable = (row: ImportRowPlan) =>
  Boolean(row.targetId) && row.action !== 'failed' && row.errorCode !== MERGE_CANDIDATE;

/**
 * Боевой прогон импорта (МГ-K3.1/K2.1, срезы 23.2–23.3a) — вне HTTP-запроса, частями под
 * замком центра.
 *
 * План строится той же функцией, что и сухой прогон (`planImport`), затем строки применяются по
 * доменам в порядке ТЗ: «создать» — заводит запись с меткой источника; «сопоставлено» —
 * дописывает только пустые поля (РМ135); пропуски и отказы остаются как есть. Повтор находит
 * всё по метке источника или коду и отвечает «изменений нет» — 0 новых записей. Одна строка с
 * отказом не останавливает остальные.
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
      const snapshot = await this.writer.run(input.tenantId, (mvp) =>
        mvp.importMatchSnapshot(input.tenantId)
      );
      const plan = await planImport({
        tenantId: input.tenantId,
        domain: input.domain,
        client: input.client,
        snapshot,
        today: input.today,
        ...(input.only ? { only: input.only } : {})
      });
      const bySourceMark = <T extends { id: string; externalId?: string; sourceSystem?: string }>(
        items: readonly T[]
      ) =>
        new Map(
          items
            .filter((item) => item.sourceSystem === CDOPROF_SOURCE_SYSTEM && item.externalId)
            .map((item) => [item.externalId!, item.id])
        );
      const links: Links = {
        counterparties: bySourceMark(snapshot.counterparties),
        directions: new Map(),
        courses: new Map(),
        learners: bySourceMark(snapshot.learners),
        groups: bySourceMark(snapshot.groups ?? []),
        group_courses: new Map(),
        enrollments: new Map()
      };

      /* Запуск только курсов групп: группы и курсы, перенесённые раньше, нашёл план. */
      plan.sides.groups.forEach((id, sourceId) => links.groups.set(sourceId, id));
      plan.sides.courses.forEach((id, sourceId) => links.courses.set(sourceId, id));
      plan.sides.learners.forEach((id, sourceId) => links.learners.set(sourceId, id));

      for (const domain of domainsOf(input.domain)) {
        const planned = plan.byDomain[domain] ?? [];
        /* Сопоставленное планом (по коду, по номеру) — адресат для следующих доменов. */
        planned.filter(linkable).forEach((row) => links[domain].set(row.sourceId, row.targetId!));
        for (const chunk of chunksOf(planned, chunkSize)) {
          const applied = await this.writer.run(input.tenantId, (mvp) => {
            const current =
              domain === 'group_courses' || domain === 'enrollments'
                ? mvp.importMatchSnapshot(input.tenantId)
                : undefined;
            const existingPairs =
              domain === 'group_courses'
                ? new Set(
                    (current?.groupCourses ?? []).map((item) => `${item.groupId}|${item.courseId}`)
                  )
                : domain === 'enrollments'
                  ? new Set(
                      (current?.enrollments ?? []).map(
                        (item) => `${item.groupId}|${item.learnerId}`
                      )
                    )
                  : undefined;
            return chunk.map((row) => {
              if (row.action !== 'created' && row.action !== 'updated') return row;
              try {
                return this.apply(mvp, input, domain, row, plan.drafts, links, existingPairs);
              } catch (error) {
                /* Частичный успех: отказ одной записи — строка отчёта с причиной, остальные идут дальше. */
                return failedBy(row, error);
              }
            });
          });
          applied.filter(linkable).forEach((row) => links[domain].set(row.sourceId, row.targetId!));
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

  private apply(
    mvp: MvpService,
    input: LiveRunInput,
    domain: ImportDomain,
    row: ImportRowPlan,
    drafts: ImportDrafts,
    links: Links,
    existingPairs: Set<string> | undefined
  ): ImportRowPlan {
    const { tenantId, actorId, context } = input;
    const settle = (filled: string[]) =>
      filled.length === 0
        ? unchanged(row)
        : { ...row, errorText: row.errorText ?? filledText(filled) };
    const source = { externalId: row.sourceId, sourceSystem: CDOPROF_SOURCE_SYSTEM };

    switch (domain) {
      case 'counterparties': {
        const draft = drafts.counterparties.get(row.sourceId);
        if (!draft) return row;
        const fields = {
          ...(draft.legalName ? { legalName: draft.legalName } : {}),
          ...(draft.inn ? { inn: draft.inn } : {}),
          ...(draft.kpp ? { kpp: draft.kpp } : {}),
          ...(draft.email ? { contactEmail: draft.email } : {})
        };
        if (row.action === 'updated' && row.targetId) {
          return settle(
            mvp.fillImportedCounterparty(
              tenantId,
              actorId,
              row.targetId,
              { ...fields, ...source },
              context
            )
          );
        }
        const created = mvp.createCounterpartyExtended(
          tenantId,
          actorId,
          { code: `ИМП-${draft.sourceId}`, name: draft.name, ...fields, ...source },
          context
        );
        return { ...row, targetId: created.id };
      }
      case 'directions': {
        const draft = drafts.directions.get(row.sourceId);
        if (!draft) return row;
        const created = mvp.createDirection(
          tenantId,
          actorId,
          { code: draft.code, name: draft.name },
          context
        );
        return { ...row, targetId: created.id };
      }
      case 'courses': {
        const draft = drafts.courses.get(row.sourceId);
        if (!draft) return row;
        const directionId = draft.directionSourceId
          ? links.directions.get(draft.directionSourceId)
          : undefined;
        const fields = {
          ...(directionId ? { directionId } : {}),
          ...(draft.price !== undefined ? { price: draft.price } : {}),
          ...(draft.note ? { note: draft.note } : {})
        };
        if (row.action === 'updated' && row.targetId) {
          return settle(mvp.fillImportedCourse(tenantId, actorId, row.targetId, fields, context));
        }
        const created = mvp.createCourse(
          tenantId,
          actorId,
          { code: draft.code, title: draft.title, ...fields },
          context
        );
        return { ...row, targetId: created.id };
      }
      case 'learners': {
        const draft = drafts.learners.get(row.sourceId);
        if (!draft) return row;
        const counterpartyId = draft.counterpartySourceId
          ? links.counterparties.get(draft.counterpartySourceId)
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
          return settle(
            mvp.fillImportedLearner(
              tenantId,
              actorId,
              row.targetId,
              { ...fields, ...source },
              context
            )
          );
        }
        const created = mvp.createLearnerExtended(
          tenantId,
          actorId,
          {
            firstName: draft.firstName,
            lastName: draft.lastName,
            ...fields,
            ...(draft.snils ? { snils: draft.snils } : {}),
            ...source
          },
          context
        );
        return { ...row, targetId: created.id };
      }
      case 'groups': {
        const draft = drafts.groups.get(row.sourceId);
        if (!draft) return row;
        const dates = {
          ...(draft.startDate ? { startDate: draft.startDate } : {}),
          ...(draft.endDate ? { endDate: draft.endDate } : {}),
          ...(draft.examDate ? { examDate: draft.examDate } : {}),
          ...(draft.materialsAccessUntil
            ? { materialsAccessUntil: draft.materialsAccessUntil }
            : {}),
          ...(draft.practiceFrom && draft.practiceTo
            ? { practiceFrom: draft.practiceFrom, practiceTo: draft.practiceTo }
            : {})
        };
        const legacy = draft.legacyNumber ? { legacyNumber: draft.legacyNumber } : {};
        if (row.action === 'updated' && row.targetId) {
          return settle(
            mvp.fillImportedGroup(
              tenantId,
              actorId,
              row.targetId,
              { ...dates, ...legacy, ...source },
              context
            )
          );
        }
        const created = mvp.createGroup(
          tenantId,
          actorId,
          {
            code: draft.code,
            name: draft.name,
            status: draft.status,
            ...dates,
            ...legacy,
            ...source
          },
          context
        );
        /* Статус при создании не ставит моменты закрытия и архива — дописываем их из дат источника. */
        if (draft.status === 'closed' || draft.status === 'archived') {
          mvp.fillImportedGroup(
            tenantId,
            actorId,
            created.id,
            {
              ...(draft.endDate ? { closedAt: moment(draft.endDate) } : {}),
              ...(draft.status === 'archived' ? { archivedAt: new Date().toISOString() } : {})
            },
            context
          );
        }
        return { ...row, targetId: created.id };
      }
      case 'group_courses': {
        const draft = drafts.group_courses.get(row.sourceId);
        if (!draft) return row;
        const groupId = links.groups.get(draft.groupSourceId);
        const courseId = links.courses.get(draft.courseSourceId);
        if (!groupId || !courseId) {
          return {
            ...row,
            action: 'failed',
            errorCode: 'group_course_side_missing',
            errorText: groupId
              ? 'Курс из прежней системы не перенесён — курс группе не назначен. Перенесите курсы, затем повторите.'
              : 'Группа из прежней системы не перенесена — курс группе не назначен. Перенесите группы, затем повторите.'
          };
        }
        if (existingPairs?.has(`${groupId}|${courseId}`)) return unchanged(row);
        const created = mvp.createGroupCourse(tenantId, { groupId, courseId }, actorId, context);
        existingPairs?.add(`${groupId}|${courseId}`);
        return { ...row, targetId: created.id };
      }
      case 'enrollments': {
        const draft = drafts.enrollments.get(row.sourceId);
        if (!draft) return row;
        const learnerId = links.learners.get(draft.learnerSourceId);
        const groupId = links.groups.get(draft.groupSourceId);
        if (!learnerId || !groupId) {
          return {
            ...row,
            action: 'failed',
            errorCode: 'enrollment_side_missing',
            errorText: learnerId
              ? 'Группа из прежней системы не перенесена — зачисление не создано. Перенесите группы, затем повторите.'
              : 'Слушатель из прежней системы не перенесён — зачисление не создано. Перенесите слушателей, затем повторите.'
          };
        }
        if (existingPairs?.has(`${groupId}|${learnerId}`)) return unchanged(row);
        /* Без событий и писем: история не выпускает документы и не приглашает людей. */
        const created = mvp.importEnrollment(
          tenantId,
          actorId,
          {
            groupId,
            learnerId,
            status: draft.status,
            ...(draft.resultCode ? { resultCode: draft.resultCode } : {}),
            ...(draft.enrolledOn ? { enrolledAt: moment(draft.enrolledOn) } : {}),
            ...(draft.completedOn ? { completedAt: moment(draft.completedOn) } : {}),
            ...source
          },
          context
        );
        existingPairs?.add(`${groupId}|${learnerId}`);
        return { ...row, targetId: created.id };
      }
    }
  }
}

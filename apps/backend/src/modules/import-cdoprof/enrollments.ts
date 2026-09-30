/**
 * Зачисления из прохождений CDOPROF (МГ-K3.1; Фаза 4, срез 23.3b).
 *
 * Прохождение CDOPROF — «слушатель × курс × группа × итог»; зачисление центра — «слушатель ×
 * группа». Ключ — пара «группа + слушатель» (ТЗ §13.2). Итог (ТЗ §13.2, РМ137):
 * «сдал» → «завершено» + `passed`; «не сдал» → «отменено» + `failed`; «неявка» → «отменено» +
 * `absent`; итога нет, группа идёт — «учится»; итога нет, группа закончилась — «учится» с
 * замечанием: придумывать итог импорт не вправе.
 */
import { UNCHANGED } from './import.types.js';

import type { GroupDraft } from './catalog.js';
import type { MatchSnapshot } from './dedup.js';
import type { ImportRowNote, ImportRowPlan } from './import.types.js';
import type { MappedRecord } from './mappers.js';
import type { CdoprofTrainingsResponse } from './sources/cdoprof-api.schemas.js';
import type { EnrollmentResultCode, EnrollmentStatus } from '../mvp/mvp.types.js';

export interface EnrollmentDraft {
  /** `слушатель:группа` — id источника. */
  sourceId: string;
  learnerSourceId: string;
  groupSourceId: string;
  status: EnrollmentStatus;
  resultCode?: EnrollmentResultCode;
  /** `YYYY-MM-DD`: зачислен — начало группы, завершил — её окончание (протокола API не отдаёт). */
  enrolledOn?: string;
  completedOn?: string;
}

type CdoprofResult =
  | { code?: number | null; result?: string | null; result_rus?: string | null }
  | null
  | undefined;

/** Итог прохождения словами источника → код центра; не распознан — `undefined`. */
export const resultCodeOf = (
  result: CdoprofResult
): EnrollmentResultCode | 'unknown' | undefined => {
  if (!result) return undefined;
  const word = `${result.result ?? ''} ${result.result_rus ?? ''}`.toLowerCase();
  if (result.code === 1 || /passed|сдал/.test(word.replace(/не сдал/g, ''))) return 'passed';
  if (result.code === 2 || /absent|неявк/.test(word)) return 'absent';
  if (result.code === 0 || /failed|не сдал/.test(word)) return 'failed';
  return 'unknown';
};

/** Какой итог сильнее, если в одной группе у слушателя несколько курсов: не сдал хоть один — не сдал. */
const RANK: Record<EnrollmentResultCode, number> = { passed: 0, failed: 1, absent: 2 };

export const enrollmentsFromTrainings = (
  responses: readonly CdoprofTrainingsResponse[],
  groupOf: (groupSourceId: string) => GroupDraft | undefined
): Array<{ sourceId: string; mapped: MappedRecord<EnrollmentDraft> }> => {
  const pairs = new Map<
    string,
    {
      learner: string;
      group: string;
      codes: Array<EnrollmentResultCode | 'unknown' | undefined>;
      name?: string;
    }
  >();
  for (const response of responses) {
    for (const item of response.items) {
      const learner = item.student?.id;
      if (!learner) continue;
      for (const training of item.trainings) {
        const group = training.group?.id;
        if (!group) continue;
        const key = `${learner}:${group}`;
        const pair = pairs.get(key) ?? {
          learner: String(learner),
          group: String(group),
          codes: []
        };
        pair.codes.push(resultCodeOf(training.result));
        pairs.set(key, pair);
      }
    }
  }

  return [...pairs.entries()].map(([sourceId, pair]) => {
    const notes: ImportRowNote[] = [];
    const group = groupOf(pair.group);
    const known = pair.codes.filter(
      (code): code is EnrollmentResultCode => code !== undefined && code !== 'unknown'
    );
    if (pair.codes.includes('unknown')) {
      notes.push({
        code: 'enrollment_result_unknown',
        text: 'Итог прохождения в прежней системе не распознан — проставьте вручную.'
      });
    }
    if (new Set(known).size > 1) {
      notes.push({
        code: 'enrollment_results_merged',
        text: 'В группе несколько курсов с разными итогами — взят худший.'
      });
    }
    const resultCode = known.sort((a, b) => RANK[b] - RANK[a])[0];
    const groupEnded = group?.status === 'closed' || group?.status === 'archived';
    let status: EnrollmentStatus;
    if (resultCode === 'passed') status = 'completed';
    else if (resultCode) status = 'cancelled';
    else {
      status = 'active';
      if (groupEnded) {
        notes.push({
          code: 'enrollment_result_missing',
          text: 'Группа закончилась, а итога в прежней системе нет — проставьте вручную.'
        });
      }
    }
    return {
      sourceId,
      mapped: {
        draft: {
          sourceId,
          learnerSourceId: pair.learner,
          groupSourceId: pair.group,
          status,
          ...(resultCode ? { resultCode } : {}),
          ...(group?.startDate ? { enrolledOn: group.startDate } : {}),
          ...(status === 'completed' && group?.endDate ? { completedOn: group.endDate } : {})
        },
        notes,
        raw: {
          learner: pair.learner,
          group: pair.group,
          ...(resultCode ? { result: resultCode } : {})
        }
      }
    };
  });
};

/** Пара «группа + слушатель» уже есть — «без изменений»; стороны ищутся по соответствиям. */
export const planEnrollments = (
  records: ReadonlyArray<{ sourceId: string; mapped: MappedRecord<EnrollmentDraft> }>,
  snapshot: MatchSnapshot,
  tenantId: string,
  learnerIdOf: (sourceId: string) => string | undefined,
  groupIdOf: (sourceId: string) => string | undefined
): ImportRowPlan[] => {
  const existing = new Map(
    (snapshot.enrollments ?? [])
      .filter((item) => item.tenantId === tenantId)
      .map((item) => [`${item.groupId}|${item.learnerId}`, item])
  );
  return records.map(({ sourceId, mapped }) => {
    const draft = mapped.draft!;
    const learnerId = learnerIdOf(draft.learnerSourceId);
    const groupId = groupIdOf(draft.groupSourceId);
    const known = learnerId && groupId ? existing.get(`${groupId}|${learnerId}`) : undefined;
    const notes =
      mapped.notes.length > 0
        ? {
            errorCode: mapped.notes[0]!.code,
            errorText: mapped.notes.map((note) => note.text).join(' ')
          }
        : {};
    return known
      ? {
          domain: 'enrollments',
          sourceId,
          action: 'skipped',
          targetId: known.id,
          errorCode: UNCHANGED,
          errorText: 'Слушатель уже зачислен в эту группу.',
          raw: mapped.raw
        }
      : { domain: 'enrollments', sourceId, action: 'created', ...notes, raw: mapped.raw };
  });
};

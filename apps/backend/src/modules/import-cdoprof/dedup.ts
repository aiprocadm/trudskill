/**
 * Сопоставление записей CDOPROF с уже заведёнными (МГ-K3.2, срез 23.1).
 *
 * Порядок ключей — из ТЗ §13.4: контрагент — внешний ID → ИНН+КПП; слушатель — внешний ID →
 * СНИЛС → ФИО+дата рождения. Первые ключи однозначны и сопоставляют автоматически. ФИО+дата
 * рождения — нет: у тёзок бывает одна дата, поэтому такое совпадение — «кандидат на слияние»,
 * решает человек (ТЗ §18: «автослияние — ошибка»; РМ133).
 */
import { MERGE_CANDIDATE } from './import.types.js';
import { normalizeSnils } from '../mvp/snils.util.js';

import type { ImportRowPlan } from './import.types.js';
import type { CounterpartyDraft, LearnerDraft, MappedRecord } from './mappers.js';
import type {
  Counterparty,
  Course,
  Direction,
  Enrollment,
  GroupCourse,
  GroupEntity,
  Learner
} from '../mvp/mvp.types.js';

/** Так CDOPROF записан в `source_system` (0102). */
export const CDOPROF_SOURCE_SYSTEM = 'cdoprof';

/** Что уже есть в центре — всё, с чем сопоставлять. */
export interface MatchSnapshot {
  learners: readonly Learner[];
  counterparties: readonly Counterparty[];
  /* Срез 23.3a: каталог и группы; нет — ничего такого в центре ещё нет. */
  directions?: readonly Direction[];
  courses?: readonly Course[];
  groups?: readonly GroupEntity[];
  groupCourses?: readonly GroupCourse[];
  enrollments?: readonly Enrollment[];
}

/** ФИО для сравнения: регистр, «ё/е» и лишние пробелы не отличают людей. */
export const foldPersonName = (value: string): string =>
  value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

export const personKey = (
  names: { lastName: string; firstName: string; middleName?: string | undefined },
  dateOfBirth: string | undefined
): string | undefined => {
  if (!dateOfBirth) return undefined;
  const fio = foldPersonName([names.lastName, names.firstName, names.middleName ?? ''].join(' '));
  return `${fio}|${dateOfBirth}`;
};

export const requisitesKey = (
  inn: string | undefined,
  kpp: string | undefined
): string | undefined => (inn ? `${inn}|${kpp ?? ''}` : undefined);

const notesOf = (record: MappedRecord<unknown>) =>
  record.notes.length > 0
    ? {
        errorCode: record.notes[0]!.code,
        errorText: record.notes.map((note) => note.text).join(' ')
      }
    : {};

const failedRow = (
  domain: ImportRowPlan['domain'],
  sourceId: string,
  record: MappedRecord<unknown>
): ImportRowPlan => ({
  domain,
  sourceId,
  action: 'failed',
  errorCode: record.error!.code,
  errorText: record.error!.text,
  raw: record.raw
});

export const planCounterparties = (
  records: ReadonlyArray<{ sourceId: string; mapped: MappedRecord<CounterpartyDraft> }>,
  snapshot: MatchSnapshot,
  tenantId: string
): ImportRowPlan[] => {
  const byExternal = new Map<string, Counterparty>();
  const byRequisites = new Map<string, Counterparty>();
  for (const item of snapshot.counterparties) {
    if (item.tenantId !== tenantId) continue;
    if (item.sourceSystem === CDOPROF_SOURCE_SYSTEM && item.externalId) {
      byExternal.set(item.externalId, item);
    }
    const key = requisitesKey(item.inn?.trim(), item.kpp?.trim());
    if (key && !byRequisites.has(key)) byRequisites.set(key, item);
  }
  /* Дубли внутри самого источника: второй с теми же ИНН+КПП — кандидат к первому. */
  const seenInSource = new Map<string, string>();

  return records.map(({ sourceId, mapped }) => {
    if (!mapped.draft) return failedRow('counterparties', sourceId, mapped);
    const draft = mapped.draft;
    const known = byExternal.get(draft.sourceId);
    if (known) {
      return {
        domain: 'counterparties',
        sourceId,
        action: 'updated',
        targetId: known.id,
        ...notesOf(mapped),
        raw: mapped.raw
      };
    }
    const key = requisitesKey(draft.inn, draft.kpp);
    const twin = key ? seenInSource.get(key) : undefined;
    if (twin) {
      return {
        domain: 'counterparties',
        sourceId,
        action: 'skipped',
        errorCode: MERGE_CANDIDATE,
        errorText: `В CDOPROF уже есть компания с теми же ИНН и КПП (№ ${twin}) — какую оставить, решите вручную.`,
        raw: mapped.raw
      };
    }
    if (key) seenInSource.set(key, sourceId);
    const sameRequisites = key ? byRequisites.get(key) : undefined;
    if (sameRequisites) {
      /* ИНН+КПП однозначно называют юрлицо (или его обособленное подразделение). */
      return {
        domain: 'counterparties',
        sourceId,
        action: 'updated',
        targetId: sameRequisites.id,
        ...notesOf(mapped),
        raw: mapped.raw
      };
    }
    return {
      domain: 'counterparties',
      sourceId,
      action: 'created',
      ...notesOf(mapped),
      raw: mapped.raw
    };
  });
};

export const planLearners = (
  records: ReadonlyArray<{ sourceId: string; mapped: MappedRecord<LearnerDraft> }>,
  snapshot: MatchSnapshot,
  tenantId: string,
  /** id источника компаний, которые уже в центре или едут этим же запуском. */
  knownCounterpartySourceIds: ReadonlySet<string>
): ImportRowPlan[] => {
  const byExternal = new Map<string, Learner>();
  const bySnils = new Map<string, Learner>();
  const byPerson = new Map<string, Learner>();
  for (const learner of snapshot.learners) {
    if (learner.tenantId !== tenantId) continue;
    if (learner.sourceSystem === CDOPROF_SOURCE_SYSTEM && learner.externalId) {
      byExternal.set(learner.externalId, learner);
    }
    const snils = learner.snils ? normalizeSnils(learner.snils) : '';
    if (snils && !bySnils.has(snils)) bySnils.set(snils, learner);
    const key = personKey(learner, learner.dateOfBirth);
    if (key && !byPerson.has(key)) byPerson.set(key, learner);
  }
  const seenInSource = new Map<string, string>();

  return records.map(({ sourceId, mapped }) => {
    if (!mapped.draft) return failedRow('learners', sourceId, mapped);
    const draft = mapped.draft;
    const notes = [...mapped.notes];
    if (draft.counterpartySourceId && !knownCounterpartySourceIds.has(draft.counterpartySourceId)) {
      /* РМ101: слушатель переносится, связь с компанией — после её переноса. */
      notes.push({
        code: 'learner_counterparty_not_imported',
        text: `Компания CDOPROF № ${draft.counterpartySourceId} ещё не перенесена — слушатель будет без компании, пока её не импортируют.`
      });
    }
    const withNotes = { ...mapped, notes };

    const known = byExternal.get(draft.sourceId);
    if (known) {
      return {
        domain: 'learners',
        sourceId,
        action: 'updated',
        targetId: known.id,
        ...notesOf(withNotes),
        raw: mapped.raw
      };
    }
    /* API CDOPROF СНИЛС не отдаёт; ключ нужен выгрузкам XLSX (срез 23.4). */
    const snilsTwin = draft.snils ? bySnils.get(normalizeSnils(draft.snils)) : undefined;
    if (snilsTwin) {
      return {
        domain: 'learners',
        sourceId,
        action: 'updated',
        targetId: snilsTwin.id,
        ...notesOf(withNotes),
        raw: mapped.raw
      };
    }
    const key = personKey(draft, draft.dateOfBirth);
    const twin = key ? seenInSource.get(key) : undefined;
    if (twin) {
      return {
        domain: 'learners',
        sourceId,
        action: 'skipped',
        errorCode: MERGE_CANDIDATE,
        errorText: `В CDOPROF уже есть слушатель с тем же ФИО и датой рождения (№ ${twin}) — один это человек или тёзки, решите вручную.`,
        raw: mapped.raw
      };
    }
    if (key) seenInSource.set(key, sourceId);
    const personTwin = key ? byPerson.get(key) : undefined;
    if (personTwin) {
      return {
        domain: 'learners',
        sourceId,
        action: 'skipped',
        targetId: personTwin.id,
        errorCode: MERGE_CANDIDATE,
        errorText:
          'В центре уже есть слушатель с тем же ФИО и датой рождения — один это человек или тёзки, решите вручную.',
        raw: mapped.raw
      };
    }
    return {
      domain: 'learners',
      sourceId,
      action: 'created',
      ...notesOf(withNotes),
      raw: mapped.raw
    };
  });
};

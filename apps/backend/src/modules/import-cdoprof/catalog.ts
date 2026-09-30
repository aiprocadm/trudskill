/**
 * Направления, курсы, группы и курсы групп из CDOPROF (МГ-K3.1/K3.2; Фаза 4, срез 23.3a).
 *
 * Ключи сопоставления — ТЗ §13.4: направления и курсы — по коду, группы — внешний ID → номер,
 * курс группы — пара «группа + курс». Номер группы и код курса переносятся как есть (РМ5);
 * повтор номера в самом источнике даёт код `номер-id` (ТЗ §13.2). Статус группы — по датам:
 * закончилась более 12 месяцев назад — «в архиве» (РМ3), закончилась — «закрыта», идёт —
 * «учатся», не началась — «набор», без дат — «черновик» (РМ136: закрытую группу нельзя
 * поправить, а без дат её только и нужно поправить).
 */
import { CDOPROF_SOURCE_SYSTEM } from './dedup.js';
import { UNCHANGED } from './import.types.js';
import { parseImportDate } from '../mvp/learner-import-fields.js';

import type { MatchSnapshot } from './dedup.js';
import type { ImportRowNote, ImportRowPlan } from './import.types.js';
import type { MappedRecord } from './mappers.js';
import type {
  CdoprofCourse,
  CdoprofGroup,
  CdoprofParentCourse,
  CdoprofTrainingsResponse
} from './sources/cdoprof-api.schemas.js';

export interface DirectionDraft {
  sourceId: string;
  code: string;
  name: string;
}

export interface CourseDraft {
  sourceId: string;
  code: string;
  title: string;
  directionSourceId?: string;
  price?: number;
  note?: string;
}

export interface GroupDraft {
  sourceId: string;
  code: string;
  name: string;
  /** Номер группы в прежней системе как был — для поиска людьми (`legacyNumber`). */
  legacyNumber?: string;
  startDate?: string;
  endDate?: string;
  examDate?: string;
  materialsAccessUntil?: string;
  practiceFrom?: string;
  practiceTo?: string;
  status: 'draft' | 'recruiting' | 'in_progress' | 'closed' | 'archived';
}

export interface GroupCourseDraft {
  /** `группа:курс` — id источника. */
  sourceId: string;
  groupSourceId: string;
  courseSourceId: string;
}

/** Через сколько месяцев после окончания группа переносится в архив (РМ3); умолчание, не закон. */
export interface GroupArchivePolicy {
  archiveAfterMonths: number;
}

export const DEFAULT_GROUP_ARCHIVE_POLICY: GroupArchivePolicy = { archiveAfterMonths: 12 };

const clean = (value: string | null | undefined): string | undefined => {
  const text = (value ?? '').trim();
  if (!text || text === 'undefined' || text === 'null') return undefined;
  return text;
};

/** Дата источника (`2024-01-15` или `2024-01-15 10:00:00`) → `YYYY-MM-DD`; мусор — `undefined`. */
const dayOf = (value: string | null | undefined): string | undefined => {
  const text = clean(value);
  if (!text) return undefined;
  const parsed = parseImportDate(text.slice(0, 10));
  return parsed || undefined;
};

const addDays = (day: string, days: number): string => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const monthsBefore = (today: Date, months: number): string => {
  const date = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate())
  );
  return date.toISOString().slice(0, 10);
};

export const mapParentCourse = (record: CdoprofParentCourse): MappedRecord<DirectionDraft> => {
  const sourceId = String(record.id);
  const name = clean(record.name_course);
  const raw = { name: name ?? '—' };
  if (!name) {
    return {
      error: { code: 'direction_name_missing', text: 'У направления в CDOPROF нет названия.' },
      notes: [],
      raw
    };
  }
  /* «R13 1. Охрана труда …» — код направления в начале названия; нет — код по id источника. */
  const code = /^(R\d+)\b/.exec(name)?.[1] ?? `ИМП-Н${sourceId}`;
  return { draft: { sourceId, code, name }, notes: [], raw: { ...raw, code } };
};

export const mapCourse = (record: CdoprofCourse): MappedRecord<CourseDraft> => {
  const sourceId = String(record.id);
  const title = clean(record.name_course);
  const cod = clean(record.cod);
  const raw = { title: title ?? '—', ...(cod ? { code: cod } : {}) };
  const notes: ImportRowNote[] = [];
  if (!title) {
    return {
      error: { code: 'course_title_missing', text: 'У курса в CDOPROF нет названия.' },
      notes,
      raw
    };
  }
  if (!cod) {
    notes.push({
      code: 'course_code_missing',
      text: `У курса нет кода — присвоен «ИМП-${sourceId}», поправьте при необходимости.`
    });
  }
  const hours = [
    record.count_hour ? `${record.count_hour} ч` : undefined,
    record.hours_theory || record.hours_practice
      ? `теория ${record.hours_theory ?? 0}, практика ${record.hours_practice ?? 0}`
      : undefined,
    record.period_obuch ? `срок ${record.period_obuch} мес.` : undefined
  ].filter(Boolean);
  const sourceNote = clean(record.note);
  const note = [
    hours.length > 0 ? `Из прежней системы: ${hours.join('; ')}.` : undefined,
    sourceNote
  ]
    .filter(Boolean)
    .join(' ');
  return {
    draft: {
      sourceId,
      code: cod ?? `ИМП-${sourceId}`,
      title,
      ...(record.id_parent_course ? { directionSourceId: String(record.id_parent_course) } : {}),
      ...(typeof record.price === 'number' && record.price > 0 ? { price: record.price } : {}),
      ...(note ? { note } : {})
    },
    notes,
    raw
  };
};

export const mapGroup = (
  record: CdoprofGroup,
  today: Date,
  policy: GroupArchivePolicy = DEFAULT_GROUP_ARCHIVE_POLICY
): MappedRecord<GroupDraft> => {
  const sourceId = String(record.id);
  const number = clean(record.name_group);
  const notes: ImportRowNote[] = [];
  const raw = { number: number ?? '—' };
  const startDate = dayOf(record.date_on);
  let endDate = dayOf(record.date_off);
  if (startDate && endDate && endDate < startDate) {
    notes.push({
      code: 'group_end_before_start',
      text: `Дата окончания «${endDate}» раньше начала — не перенесена, заполните вручную.`
    });
    endDate = undefined;
  }
  /* Экзамен вне [начало; окончание + 30 дней] служба групп не примет — лучше без него, чем без группы. */
  const exam = dayOf(record.date_exam_end) ?? dayOf(record.date_exam_start);
  const examFits =
    exam && (!startDate || exam >= startDate) && (!endDate || exam <= addDays(endDate, 30));
  if (exam && !examFits) {
    notes.push({
      code: 'group_exam_dropped',
      text: `Дата экзамена «${exam}» вне сроков группы — не перенесена.`
    });
  }
  const practiceFrom = dayOf(record.date_practice_on);
  const practiceTo = dayOf(record.date_practice_off);
  const materialsAccessUntil = dayOf(record.access_material);

  const todayDay = today.toISOString().slice(0, 10);
  let status: GroupDraft['status'];
  if (!startDate && !endDate) {
    status = 'draft';
    notes.push({
      code: 'group_dates_missing',
      text: 'У группы нет дат — перенесена черновиком, чтобы даты можно было дописать.'
    });
  } else if (endDate && endDate < monthsBefore(today, policy.archiveAfterMonths)) {
    status = 'archived';
  } else if (endDate && endDate < todayDay) {
    status = 'closed';
  } else if (startDate && startDate > todayDay) {
    status = 'recruiting';
  } else {
    status = 'in_progress';
  }

  return {
    draft: {
      sourceId,
      code: number ?? `ИМП-Г${sourceId}`,
      name: number ?? `Группа ${sourceId} из прежней системы`,
      ...(number ? { legacyNumber: number } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(exam && examFits ? { examDate: exam } : {}),
      ...(materialsAccessUntil ? { materialsAccessUntil } : {}),
      ...(practiceFrom && practiceTo && practiceFrom <= practiceTo
        ? { practiceFrom, practiceTo }
        : {}),
      status
    },
    notes: number
      ? notes
      : [
          ...notes,
          {
            code: 'group_number_missing',
            text: `У группы нет номера — присвоен «ИМП-Г${sourceId}».`
          }
        ],
    raw
  };
};

/**
 * Повтор кода в самом источнике (номер группы 2024-002 у двух групп): второй получает
 * `код-id` с замечанием — обе группы переносятся, ни одна не теряется (ТЗ §13.2).
 */
export const withUniqueCodes = <T extends { code: string; sourceId: string }>(
  records: ReadonlyArray<{ sourceId: string; mapped: MappedRecord<T> }>,
  what: string
): Array<{ sourceId: string; mapped: MappedRecord<T> }> => {
  const seen = new Set<string>();
  return records.map((record) => {
    const draft = record.mapped.draft;
    if (!draft) return record;
    if (!seen.has(draft.code)) {
      seen.add(draft.code);
      return record;
    }
    const code = `${draft.code}-${draft.sourceId}`;
    seen.add(code);
    return {
      sourceId: record.sourceId,
      mapped: {
        ...record.mapped,
        draft: { ...draft, code },
        notes: [
          ...record.mapped.notes,
          {
            code: 'code_duplicated_in_source',
            text: `${what} «${draft.code}» в CDOPROF повторяется — перенесено как «${code}».`
          }
        ],
        raw: { ...record.mapped.raw, code }
      }
    };
  });
};

/** Курсы групп — из прохождений слушателей: пара «группа + курс» без повторов. */
export const groupCoursePairs = (
  responses: readonly CdoprofTrainingsResponse[]
): Array<{ sourceId: string; mapped: MappedRecord<GroupCourseDraft> }> => {
  const pairs = new Map<string, GroupCourseDraft>();
  for (const response of responses) {
    for (const item of response.items) {
      for (const training of item.trainings) {
        const groupId = training.group?.id;
        const courseId = training.course?.id;
        if (!groupId || !courseId) continue;
        const sourceId = `${groupId}:${courseId}`;
        if (!pairs.has(sourceId)) {
          pairs.set(sourceId, {
            sourceId,
            groupSourceId: String(groupId),
            courseSourceId: String(courseId)
          });
        }
      }
    }
  }
  return [...pairs.values()].map((draft) => ({
    sourceId: draft.sourceId,
    mapped: { draft, notes: [], raw: { group: draft.groupSourceId, course: draft.courseSourceId } }
  }));
};

const notesOf = (record: MappedRecord<unknown>) =>
  record.notes.length > 0
    ? {
        errorCode: record.notes[0]!.code,
        errorText: record.notes.map((note) => note.text).join(' ')
      }
    : {};

const failed = (
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

/** Направление — по коду. Совпало — «уже есть»: чужое направление импорт не правит. */
export const planDirections = (
  records: ReadonlyArray<{ sourceId: string; mapped: MappedRecord<DirectionDraft> }>,
  snapshot: MatchSnapshot,
  tenantId: string
): ImportRowPlan[] => {
  const byCode = new Map(
    (snapshot.directions ?? [])
      .filter((item) => item.tenantId === tenantId)
      .map((item) => [item.code, item])
  );
  return withUniqueCodes(records, 'Код направления').map(({ sourceId, mapped }) => {
    if (!mapped.draft) return failed('directions', sourceId, mapped);
    const known = byCode.get(mapped.draft.code);
    return known
      ? {
          domain: 'directions',
          sourceId,
          action: 'skipped',
          targetId: known.id,
          errorCode: UNCHANGED,
          errorText: 'Направление с этим кодом уже есть.',
          raw: mapped.raw
        }
      : { domain: 'directions', sourceId, action: 'created', ...notesOf(mapped), raw: mapped.raw };
  });
};

/** Курс — по коду (ТЗ §13.4); совпал — «сопоставлено», дописываются пустые поля. */
export const planCourses = (
  records: ReadonlyArray<{ sourceId: string; mapped: MappedRecord<CourseDraft> }>,
  snapshot: MatchSnapshot,
  tenantId: string
): ImportRowPlan[] => {
  const byCode = new Map(
    (snapshot.courses ?? [])
      .filter((item) => item.tenantId === tenantId)
      .map((item) => [item.code, item])
  );
  return withUniqueCodes(records, 'Код курса').map(({ sourceId, mapped }) => {
    if (!mapped.draft) return failed('courses', sourceId, mapped);
    const known = byCode.get(mapped.draft.code);
    return known
      ? {
          domain: 'courses',
          sourceId,
          action: 'updated',
          targetId: known.id,
          ...notesOf(mapped),
          raw: mapped.raw
        }
      : { domain: 'courses', sourceId, action: 'created', ...notesOf(mapped), raw: mapped.raw };
  });
};

/** Группа — внешний ID → номер (ТЗ §13.4). */
export const planGroups = (
  records: ReadonlyArray<{ sourceId: string; mapped: MappedRecord<GroupDraft> }>,
  snapshot: MatchSnapshot,
  tenantId: string
): ImportRowPlan[] => {
  const groups = (snapshot.groups ?? []).filter((item) => item.tenantId === tenantId);
  const byExternal = new Map(
    groups
      .filter((item) => item.sourceSystem === CDOPROF_SOURCE_SYSTEM && item.externalId)
      .map((item) => [item.externalId!, item])
  );
  const byCode = new Map(groups.map((item) => [item.code, item]));
  return withUniqueCodes(records, 'Номер группы').map(({ sourceId, mapped }) => {
    if (!mapped.draft) return failed('groups', sourceId, mapped);
    const known = byExternal.get(mapped.draft.sourceId) ?? byCode.get(mapped.draft.code);
    return known
      ? {
          domain: 'groups',
          sourceId,
          action: 'updated',
          targetId: known.id,
          ...notesOf(mapped),
          raw: mapped.raw
        }
      : { domain: 'groups', sourceId, action: 'created', ...notesOf(mapped), raw: mapped.raw };
  });
};

/**
 * Курс группы — пара «группа + курс». Обе стороны ищутся по уже известным соответствиям
 * (`groupIdOf`, `courseIdOf`); пара уже есть — «без изменений».
 */
export const planGroupCourses = (
  records: ReadonlyArray<{ sourceId: string; mapped: MappedRecord<GroupCourseDraft> }>,
  snapshot: MatchSnapshot,
  tenantId: string,
  groupIdOf: (sourceId: string) => string | undefined,
  courseIdOf: (sourceId: string) => string | undefined
): ImportRowPlan[] => {
  const existing = new Map(
    (snapshot.groupCourses ?? [])
      .filter((item) => item.tenantId === tenantId)
      .map((item) => [`${item.groupId}|${item.courseId}`, item])
  );
  return records.map(({ sourceId, mapped }) => {
    const draft = mapped.draft!;
    const groupId = groupIdOf(draft.groupSourceId);
    const courseId = courseIdOf(draft.courseSourceId);
    const known = groupId && courseId ? existing.get(`${groupId}|${courseId}`) : undefined;
    return known
      ? {
          domain: 'group_courses',
          sourceId,
          action: 'skipped',
          targetId: known.id,
          errorCode: UNCHANGED,
          errorText: 'Курс уже назначен группе.',
          raw: mapped.raw
        }
      : { domain: 'group_courses', sourceId, action: 'created', raw: mapped.raw };
  });
};

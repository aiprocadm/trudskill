/**
 * План импорта из CDOPROF — одна функция и для сухого, и для боевого прогона (срезы 23.1–23.3a):
 * что покажет сухой прогон, ровно то и сделает боевой.
 *
 * Порядок доменов — ТЗ §13.4: контрагенты → направления → курсы → слушатели → группы → курсы
 * групп → зачисления. Каждый следующий домен ссылается на предыдущие через
 * соответствия «id источника → id центра», которые план собирает по ходу.
 */
import {
  groupCoursePairs,
  mapCourse,
  mapGroup,
  mapParentCourse,
  planCourses,
  planDirections,
  planGroupCourses,
  planGroups,
  withUniqueCodes
} from './catalog.js';
import { CDOPROF_SOURCE_SYSTEM, planCounterparties, planLearners } from './dedup.js';
import { enrollmentsFromTrainings, planEnrollments } from './enrollments.js';
import { mapContragent, mapStudent } from './mappers.js';

import type { CourseDraft, DirectionDraft, GroupCourseDraft, GroupDraft } from './catalog.js';
import type { MatchSnapshot } from './dedup.js';
import type { EnrollmentDraft } from './enrollments.js';
import type { ImportDomain, ImportRowPlan, ImportRunDomain } from './import.types.js';
import type { CounterpartyDraft, LearnerDraft, MappedRecord } from './mappers.js';
import type { CdoprofApiClient } from './sources/cdoprof-api-client.js';
import type { CdoprofContragent, CdoprofTrainingsResponse } from './sources/cdoprof-api.schemas.js';

export const DOMAIN_ORDER: readonly ImportDomain[] = [
  'counterparties',
  'directions',
  'courses',
  'learners',
  'groups',
  'group_courses',
  'enrollments'
];

export const domainsOf = (domain: ImportRunDomain): readonly ImportDomain[] =>
  domain === 'all' ? DOMAIN_ORDER : [domain];

export interface ImportDrafts {
  counterparties: Map<string, CounterpartyDraft>;
  directions: Map<string, DirectionDraft>;
  courses: Map<string, CourseDraft>;
  learners: Map<string, LearnerDraft>;
  groups: Map<string, GroupDraft>;
  group_courses: Map<string, GroupCourseDraft>;
  enrollments: Map<string, EnrollmentDraft>;
}

export interface ImportPlan {
  byDomain: Partial<Record<ImportDomain, ImportRowPlan[]>>;
  drafts: ImportDrafts;
  /** Стороны курсов групп и зачислений, найденные планом: что уже есть в центре. */
  sides: {
    groups: Map<string, string>;
    courses: Map<string, string>;
    learners: Map<string, string>;
  };
}

export interface PlanInput {
  tenantId: string;
  domain: ImportRunDomain;
  client: CdoprofApiClient;
  snapshot: MatchSnapshot;
  today: Date;
  /** «Повторить только ошибки»: ключи `домен:id источника`. */
  only?: ReadonlySet<string>;
}

const collect = async <T>(source: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
};

const draftsOf = <T>(records: ReadonlyArray<{ sourceId: string; mapped: MappedRecord<T> }>) =>
  new Map(records.flatMap((r) => (r.mapped.draft ? [[r.sourceId, r.mapped.draft] as const] : [])));

/** Кому уже есть адресат в центре: сопоставленные и неизменные строки плана. */
const targetsOf = (rows: readonly ImportRowPlan[] | undefined) =>
  new Map(
    (rows ?? [])
      .filter((row) => row.targetId && row.action !== 'failed')
      .map((row) => [row.sourceId, row.targetId!])
  );

export const planImport = async (input: PlanInput): Promise<ImportPlan> => {
  const domains = new Set(domainsOf(input.domain));
  const wants = (domain: ImportDomain, sourceId: string) =>
    !input.only || input.only.has(`${domain}:${sourceId}`);
  const pick = <T extends { sourceId: string }>(domain: ImportDomain, records: T[]) =>
    records.filter((record) => wants(domain, record.sourceId));
  const { snapshot, tenantId } = input;
  const byDomain: ImportPlan['byDomain'] = {};
  const sides: ImportPlan['sides'] = { groups: new Map(), courses: new Map(), learners: new Map() };
  const drafts: ImportDrafts = {
    counterparties: new Map(),
    directions: new Map(),
    courses: new Map(),
    learners: new Map(),
    groups: new Map(),
    group_courses: new Map(),
    enrollments: new Map()
  };

  let contragents: CdoprofContragent[] | undefined;
  const loadContragents = async () =>
    (contragents ??= await collect(input.client.iterateContragents()));

  const knownCounterparties = new Set(
    snapshot.counterparties
      .filter((item) => item.sourceSystem === CDOPROF_SOURCE_SYSTEM && item.externalId)
      .map((item) => item.externalId!)
  );
  if (domains.has('counterparties')) {
    const records = pick(
      'counterparties',
      (await loadContragents()).map((record) => ({
        sourceId: String(record.id),
        mapped: mapContragent(record)
      }))
    );
    drafts.counterparties = draftsOf(records);
    byDomain.counterparties = planCounterparties(records, snapshot, tenantId);
    /* Компания, которую этот запуск перенесёт или сопоставит, для слушателей — известна. */
    byDomain.counterparties
      .filter((row) => row.action === 'created' || row.action === 'updated')
      .forEach((row) => knownCounterparties.add(row.sourceId));
  }
  if (domains.has('directions')) {
    /* Повтор кода разводится по ВСЕМУ источнику до отбора: повтор ошибок получит тот же код. */
    const records = pick(
      'directions',
      withUniqueCodes(
        (await collect(input.client.iterateParentCourses())).map((record) => ({
          sourceId: String(record.id),
          mapped: mapParentCourse(record)
        })),
        'Код направления'
      )
    );
    drafts.directions = draftsOf(records);
    byDomain.directions = planDirections(records, snapshot, tenantId);
  }
  if (domains.has('courses')) {
    const records = pick(
      'courses',
      withUniqueCodes(
        (await collect(input.client.iterateCourses())).map((record) => ({
          sourceId: String(record.id),
          mapped: mapCourse(record)
        })),
        'Код курса'
      )
    );
    byDomain.courses = planCourses(records, snapshot, tenantId);
    drafts.courses = draftsOf(records);
  }
  if (domains.has('learners')) {
    const records = pick(
      'learners',
      (await collect(input.client.iterateStudents())).map((record) => ({
        sourceId: String(record.id),
        mapped: mapStudent(record, input.today)
      }))
    );
    drafts.learners = draftsOf(records);
    byDomain.learners = planLearners(records, snapshot, tenantId, knownCounterparties);
  }
  if (domains.has('groups')) {
    const records = pick(
      'groups',
      withUniqueCodes(
        (await collect(input.client.iterateGroups())).map((record) => ({
          sourceId: String(record.id),
          mapped: mapGroup(record, input.today)
        })),
        'Номер группы'
      )
    );
    drafts.groups = draftsOf(records);
    byDomain.groups = planGroups(records, snapshot, tenantId);
  }
  /* Прохождения — общий источник курсов групп и зачислений: читаются один раз. */
  let trainings: CdoprofTrainingsResponse[] | undefined;
  const loadTrainings = async () => {
    if (!trainings) {
      trainings = [];
      for (const contragent of await loadContragents()) {
        trainings.push(await input.client.getContragentTrainings(contragent.id));
      }
    }
    return trainings;
  };
  /* Группы нужны курсам групп и зачислениям, даже если сами в этот запуск не входят. */
  let groupSide: { rows: ImportRowPlan[]; drafts: Map<string, GroupDraft> } | undefined;
  const loadGroupSide = async () => {
    if (!groupSide) {
      if (byDomain.groups) {
        groupSide = { rows: byDomain.groups, drafts: drafts.groups };
      } else {
        const records = withUniqueCodes(
          (await collect(input.client.iterateGroups())).map((record) => ({
            sourceId: String(record.id),
            mapped: mapGroup(record, input.today)
          })),
          'Номер группы'
        );
        groupSide = { rows: planGroups(records, snapshot, tenantId), drafts: draftsOf(records) };
      }
      sides.groups = new Map([
        ...snapshotGroupIds(snapshot, tenantId),
        ...targetsOf(groupSide.rows)
      ]);
    }
    return groupSide;
  };

  if (domains.has('group_courses')) {
    const records = pick('group_courses', groupCoursePairs(await loadTrainings()));
    drafts.group_courses = draftsOf(records);
    await loadGroupSide();
    /* Запуск только курсов групп: стороны пары ищутся тем же ходом, что и при их собственном переносе. */
    const courseRows =
      byDomain.courses ??
      planCourses(
        (await collect(input.client.iterateCourses())).map((record) => ({
          sourceId: String(record.id),
          mapped: mapCourse(record)
        })),
        snapshot,
        tenantId
      );
    sides.courses = targetsOf(courseRows);
    byDomain.group_courses = planGroupCourses(
      records,
      snapshot,
      tenantId,
      (id) => sides.groups.get(id),
      (id) => sides.courses.get(id)
    );
  }
  if (domains.has('enrollments')) {
    const groups = await loadGroupSide();
    const records = pick(
      'enrollments',
      enrollmentsFromTrainings(await loadTrainings(), (id) => groups.drafts.get(id))
    );
    drafts.enrollments = draftsOf(records);
    sides.learners = new Map([
      ...snapshot.learners
        .filter(
          (item) =>
            item.tenantId === tenantId &&
            item.sourceSystem === CDOPROF_SOURCE_SYSTEM &&
            item.externalId
        )
        .map((item): [string, string] => [item.externalId!, item.id]),
      ...targetsOf(byDomain.learners)
    ]);
    byDomain.enrollments = planEnrollments(
      records,
      snapshot,
      tenantId,
      (id) => sides.learners.get(id),
      (id) => sides.groups.get(id)
    );
  }
  return { byDomain, drafts, sides };
};

const snapshotGroupIds = (snapshot: MatchSnapshot, tenantId: string): Array<[string, string]> =>
  (snapshot.groups ?? [])
    .filter(
      (item) =>
        item.tenantId === tenantId && item.sourceSystem === CDOPROF_SOURCE_SYSTEM && item.externalId
    )
    .map((item) => [item.externalId!, item.id]);

/** Все строки плана в порядке доменов. */
export const planRows = (plan: ImportPlan): ImportRowPlan[] =>
  DOMAIN_ORDER.flatMap((domain) => plan.byDomain[domain] ?? []);

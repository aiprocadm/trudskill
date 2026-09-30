import { documentKindOf } from '../../documents/document-kinds.js';

/**
 * Пакет документов группы (ТЗ перехода с CDOPROF, МГ-F2.1, Фаза 3, срез 21.1).
 *
 * «Какие документы должна получить группа» — это строки наборов документов её курсов (у строки
 * вид, шаблон, «обязательный»). «Что уже есть» — выпущенные документы и задачи выпуска.
 * Здесь чистые правила: из них получаются таблица «вид × состояние» и план выпуска в порядке
 * CDOPROF — приказы → протокол → документы слушателей (номер удостоверения может зависеть от
 * номера протокола). Данные собирают `MvpService` и `DocumentsService`.
 */

export interface PackageEntry {
  kindCode?: string | undefined;
  templateId: string;
  templateType: string;
  templateName: string;
  isRequired: boolean;
}

export type PackageScope = 'group' | 'learner';
export type PackageKindState = 'not_started' | 'in_progress' | 'partial' | 'issued' | 'failed';

export interface PackageDocumentFact {
  id: string;
  templateId: string;
  kindCode?: string | undefined;
  sourceEntityType: string;
  sourceEntityId: string;
}

export interface PackageTaskFact {
  templateId: string;
  kindCode?: string | undefined;
  sourceEntityType: string;
  sourceEntityId: string;
  status: string;
}

export interface PackageKindRow {
  key: string;
  kindCode?: string | undefined;
  /** Название для человека: вид документа, а без вида — название шаблона. */
  title: string;
  scope: PackageScope;
  templateId: string;
  isRequired: boolean;
  expected: number;
  issued: number;
  inProgress: number;
  failed: number;
  state: PackageKindState;
  documentIds: string[];
}

const LEARNER_TEMPLATE_TYPES = new Set(['certificate', 'diploma', 'reference', 'attestation']);

/** Документ на группу или на каждого слушателя — по виду, а без вида — по типу бланка. */
export const scopeOf = (entry: Pick<PackageEntry, 'kindCode' | 'templateType'>): PackageScope => {
  const kind = documentKindOf(entry.kindCode);
  if (kind)
    return kind.scope === 'learner' || kind.scope === 'learner_course' ? 'learner' : 'group';
  return LEARNER_TEMPLATE_TYPES.has(entry.templateType) ? 'learner' : 'group';
};

/** Порядок выпуска CDOPROF: приказы → протоколы → остальное на группу → документы слушателей. */
export const issueRank = (entry: Pick<PackageEntry, 'kindCode' | 'templateType'>): number => {
  if (scopeOf(entry) === 'learner') return 3;
  if (entry.templateType === 'order') return 0;
  if (entry.templateType === 'protocol') return 1;
  return 2;
};

const entryKey = (entry: PackageEntry) => entry.kindCode ?? `template:${entry.templateId}`;

const matches = (
  entry: PackageEntry,
  fact: { templateId: string; kindCode?: string | undefined }
) => (entry.kindCode ? fact.kindCode === entry.kindCode : fact.templateId === entry.templateId);

/** Строки наборов по всем курсам группы — без повторов одного вида (или шаблона без вида). */
export function uniqueEntries(entries: readonly PackageEntry[]): PackageEntry[] {
  const seen = new Map<string, PackageEntry>();
  for (const entry of entries) {
    const key = entryKey(entry);
    const known = seen.get(key);
    // Обязательный хоть в одном курсе — обязательный для группы.
    if (!known) seen.set(key, { ...entry });
    else if (entry.isRequired) known.isRequired = true;
  }
  return [...seen.values()].sort((a, b) => issueRank(a) - issueRank(b));
}

/** Таблица «вид × состояние» пакета группы. */
export function packageState(input: {
  groupId: string;
  entries: readonly PackageEntry[];
  enrollmentIds: readonly string[];
  documents: readonly PackageDocumentFact[];
  tasks: readonly PackageTaskFact[];
  kindName: (kindCode: string) => string | undefined;
}): PackageKindRow[] {
  const inGroup = (
    fact: { sourceEntityType: string; sourceEntityId: string },
    scope: PackageScope
  ) =>
    scope === 'group'
      ? fact.sourceEntityType === 'group' && fact.sourceEntityId === input.groupId
      : fact.sourceEntityType === 'enrollment' && input.enrollmentIds.includes(fact.sourceEntityId);

  return uniqueEntries(input.entries).map((entry) => {
    const scope = scopeOf(entry);
    const expected = scope === 'group' ? 1 : input.enrollmentIds.length;
    const docs = input.documents.filter((d) => matches(entry, d) && inGroup(d, scope));
    const issuedSources = new Set(docs.map((d) => d.sourceEntityId));
    const tasks = input.tasks.filter((t) => matches(entry, t) && inGroup(t, scope));
    const inProgress = new Set(
      tasks
        .filter(
          (t) =>
            (t.status === 'queued' || t.status === 'running') &&
            !issuedSources.has(t.sourceEntityId)
        )
        .map((t) => t.sourceEntityId)
    ).size;
    const failed = new Set(
      tasks
        .filter((t) => t.status === 'failed' && !issuedSources.has(t.sourceEntityId))
        .map((t) => t.sourceEntityId)
    ).size;
    const issued = Math.min(issuedSources.size, expected);
    const state: PackageKindState =
      expected > 0 && issued >= expected
        ? 'issued'
        : inProgress > 0
          ? 'in_progress'
          : failed > 0
            ? 'failed'
            : issued > 0
              ? 'partial'
              : 'not_started';
    return {
      key: entryKey(entry),
      kindCode: entry.kindCode,
      title: (entry.kindCode ? input.kindName(entry.kindCode) : undefined) ?? entry.templateName,
      scope,
      templateId: entry.templateId,
      isRequired: entry.isRequired,
      expected,
      issued,
      inProgress,
      failed,
      state,
      documentIds: docs.map((d) => d.id)
    };
  });
}

/** Задача пакета: что выпустить и для кого. Порядок массива — порядок выпуска. */
export interface PackageTaskPlan {
  entry: PackageEntry;
  sourceEntityType: 'group' | 'enrollment';
  sourceEntityId: string;
}

/** План выпуска: групповые документы — один раз, документы слушателей — каждому готовому. */
export function planPackageIssue(input: {
  groupId: string;
  entries: readonly PackageEntry[];
  kindCodes?: readonly string[] | undefined;
  eligibleEnrollmentIds: readonly string[];
}): PackageTaskPlan[] {
  const chosen = uniqueEntries(input.entries).filter(
    (entry) => !input.kindCodes?.length || input.kindCodes.includes(entryKey(entry))
  );
  const plan: PackageTaskPlan[] = [];
  for (const entry of chosen) {
    if (scopeOf(entry) === 'group') {
      plan.push({ entry, sourceEntityType: 'group', sourceEntityId: input.groupId });
      continue;
    }
    for (const enrollmentId of input.eligibleEnrollmentIds) {
      plan.push({ entry, sourceEntityType: 'enrollment', sourceEntityId: enrollmentId });
    }
  }
  return plan;
}

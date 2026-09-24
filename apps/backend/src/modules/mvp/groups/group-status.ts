import { ConflictException } from '@nestjs/common';

/**
 * Статусы группы CDOPROF (ТЗ перехода §4, §6.1 МГ-B3.1; Фаза 2, срез 8.1, РМ45–РМ46).
 *
 * Цепочка: draft → recruiting → in_progress → exam → documents → closed → archived;
 * `cancelled` — из любого состояния до `closed`. Старые значения снимка (`scheduled`, `active`,
 * `completed`) на входе принимаются и трактуются как соседи по цепочке, но хранимые данные
 * не переписываются — фронт до среза 8.3 показывает их прежними подписями.
 */
export const GROUP_STATUSES = [
  'draft',
  'recruiting',
  'in_progress',
  'exam',
  'documents',
  'closed',
  'archived',
  'cancelled'
] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

/** Порядок по цепочке (без `cancelled`). */
const CHAIN: ReadonlyArray<GroupStatus> = [
  'draft',
  'recruiting',
  'in_progress',
  'exam',
  'documents',
  'closed',
  'archived'
];

/** Старые значения снимка → канонический статус (РМ45). */
export const LEGACY_GROUP_STATUS: Readonly<Record<string, GroupStatus>> = {
  scheduled: 'recruiting',
  active: 'in_progress',
  completed: 'closed'
};

/** Подписи для текстов ошибок — человеку, а не коду. */
export const GROUP_STATUS_LABEL: Readonly<Record<GroupStatus, string>> = {
  draft: 'Черновик',
  recruiting: 'Набор',
  in_progress: 'Учатся',
  exam: 'Экзамен',
  documents: 'Ждут документов',
  closed: 'Закрыта',
  archived: 'В архиве',
  cancelled: 'Отменена'
};

/** Канонический статус для любого принятого значения; неизвестное — `null`. */
export function normalizeGroupStatus(raw: unknown): GroupStatus | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if ((GROUP_STATUSES as ReadonlyArray<string>).includes(value)) return value as GroupStatus;
  return LEGACY_GROUP_STATUS[value] ?? null;
}

export function isKnownGroupStatus(raw: unknown): boolean {
  return normalizeGroupStatus(raw) !== null;
}

/** Куда можно перейти вручную из `from` (РМ46): соседи по цепочке, отмена до закрытия, архив из закрытой/отменённой. */
export function allowedGroupTransitions(from: GroupStatus): GroupStatus[] {
  if (from === 'cancelled') return ['archived'];
  if (from === 'archived') return ['closed'];
  const index = CHAIN.indexOf(from);
  const targets: GroupStatus[] = [];
  const previous = CHAIN[index - 1];
  const next = CHAIN[index + 1];
  if (previous) targets.push(previous);
  if (next) targets.push(next);
  if (index < CHAIN.indexOf('closed')) targets.push('cancelled');
  return targets;
}

export function canTransitionGroupStatus(from: GroupStatus, to: GroupStatus): boolean {
  return allowedGroupTransitions(from).includes(to);
}

/** 409 `group_status_transition_invalid` с перечнем допустимых переходов. */
export function assertGroupStatusTransition(fromRaw: unknown, toRaw: unknown): GroupStatus {
  const from = normalizeGroupStatus(fromRaw) ?? 'draft';
  const to = normalizeGroupStatus(toRaw);
  if (!to) {
    throw new ConflictException({
      code: 'group_status_transition_invalid',
      message: `Статус «${String(toRaw)}» неизвестен. Допустимые: ${GROUP_STATUSES.map((s) => GROUP_STATUS_LABEL[s]).join(', ')}.`
    });
  }
  if (from === to) return to;
  if (!canTransitionGroupStatus(from, to)) {
    const allowed = allowedGroupTransitions(from)
      .map((s) => `«${GROUP_STATUS_LABEL[s]}»`)
      .join(', ');
    throw new ConflictException({
      code: 'group_status_transition_invalid',
      message: `Из «${GROUP_STATUS_LABEL[from]}» нельзя перевести в «${GROUP_STATUS_LABEL[to]}». Доступно: ${allowed || 'ничего'}.`
    });
  }
  return to;
}

/** Закрытая, архивная или отменённая группа: даты, состав и код менять нельзя (МГ-B4.1). */
export function isGroupLocked(statusRaw: unknown): boolean {
  const status = normalizeGroupStatus(statusRaw);
  return status === 'closed' || status === 'archived' || status === 'cancelled';
}

/** Быстрые отборы реестра (МГ-B3.2) — паритет с фильтром CDOPROF. */
export const GROUP_QUICK_FILTERS = [
  'learning',
  'exam_this_week',
  'awaiting_documents',
  'ended_without_documents',
  'ends_today',
  'archive'
] as const;
export type GroupQuickFilter = (typeof GROUP_QUICK_FILTERS)[number];

export const GROUP_QUICK_FILTER_LABEL: Readonly<Record<GroupQuickFilter, string>> = {
  learning: 'Учатся',
  exam_this_week: 'Экзамен на этой неделе',
  awaiting_documents: 'Ждут документов',
  ended_without_documents: 'Закончились без документов',
  ends_today: 'Заканчиваются сегодня',
  archive: 'Архив'
};

export function isGroupQuickFilter(raw: unknown): raw is GroupQuickFilter {
  return typeof raw === 'string' && (GROUP_QUICK_FILTERS as ReadonlyArray<string>).includes(raw);
}

/** Границы ISO-недели `YYYY-MM-DD` (понедельник–воскресенье), дата — календарная, без пояса. */
export function isoWeekBounds(date: string): { from: string; to: string } {
  const at = new Date(`${date}T00:00:00Z`);
  const day = at.getUTCDay() || 7;
  const monday = new Date(at);
  monday.setUTCDate(at.getUTCDate() - (day - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

/**
 * Отбор из строки запроса реестра (`GET /groups`): `status` — один или несколько через запятую,
 * `quick` — быстрый отбор, `responsible_id`, периоды `start_from/to`, `end_from/to`,
 * `exam_from/to` (`YYYY-MM-DD`), `include_archived`. Непонятное значение отбрасывается.
 */
export function parseGroupFilter(query: Record<string, unknown>): GroupFilter {
  const filter: GroupFilter = {};
  const str = (key: string): string | undefined => {
    const value = query[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const date = (key: string): string | undefined => {
    const value = str(key);
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  };
  const status = str('status');
  if (status) {
    const statuses = status
      .split(',')
      .map((s) => s.trim())
      .filter((s) => isKnownGroupStatus(s));
    if (statuses.length > 0) filter.statuses = statuses;
  }
  const quick = str('quick');
  if (isGroupQuickFilter(quick)) filter.quick = quick;
  const responsible = str('responsible_id');
  if (responsible) filter.responsibleUserId = responsible;
  const startFrom = date('start_from');
  const startTo = date('start_to');
  const endFrom = date('end_from');
  const endTo = date('end_to');
  const examFrom = date('exam_from');
  const examTo = date('exam_to');
  if (startFrom) filter.startFrom = startFrom;
  if (startTo) filter.startTo = startTo;
  if (endFrom) filter.endFrom = endFrom;
  if (endTo) filter.endTo = endTo;
  if (examFrom) filter.examFrom = examFrom;
  if (examTo) filter.examTo = examTo;
  const archived = str('include_archived');
  if (archived === '1' || archived === 'true') filter.includeArchived = true;
  return filter;
}

/** Что умеет отбирать реестр групп (снимок, память и SQL — одна семантика). */
export interface GroupFilter {
  /** Один или несколько статусов (канонических или старых — сравнение по нормализованному). */
  statuses?: string[];
  quick?: GroupQuickFilter;
  responsibleUserId?: string;
  startFrom?: string;
  startTo?: string;
  endFrom?: string;
  endTo?: string;
  examFrom?: string;
  examTo?: string;
  /** По умолчанию архив скрыт (МГ-B6.2); явный статус/отбор `archive` его показывает. */
  includeArchived?: boolean;
}

interface GroupLike {
  status: string;
  startDate?: string;
  endDate?: string;
  examDate?: string;
  responsibleUserId?: string;
}

const dateOf = (value: string | undefined): string | undefined =>
  value ? value.slice(0, 10) : undefined;

/**
 * Отбор групп для снимка и памяти. `today` — календарная дата в поясе центра. Семантика
 * повторена в `PostgresGroupsRepository` по колонкам; расхождение — дефект, а не «так вышло».
 */
export function filterGroups<T extends GroupLike>(
  groups: T[],
  filter: GroupFilter,
  today: string
): T[] {
  const statuses = filter.statuses
    ?.map((s) => normalizeGroupStatus(s))
    .filter((s): s is GroupStatus => !!s);
  const week = isoWeekBounds(today);
  return groups.filter((group) => {
    const status = normalizeGroupStatus(group.status) ?? 'draft';
    const start = dateOf(group.startDate);
    const end = dateOf(group.endDate);
    const exam = dateOf(group.examDate);
    if (statuses && statuses.length > 0 && !statuses.includes(status)) return false;
    if (filter.responsibleUserId && group.responsibleUserId !== filter.responsibleUserId)
      return false;
    if (filter.startFrom && (!start || start < filter.startFrom)) return false;
    if (filter.startTo && (!start || start > filter.startTo)) return false;
    if (filter.endFrom && (!end || end < filter.endFrom)) return false;
    if (filter.endTo && (!end || end > filter.endTo)) return false;
    if (filter.examFrom && (!exam || exam < filter.examFrom)) return false;
    if (filter.examTo && (!exam || exam > filter.examTo)) return false;
    switch (filter.quick) {
      case 'learning':
        if (status !== 'in_progress') return false;
        break;
      case 'exam_this_week':
        if (!exam || exam < week.from || exam > week.to) return false;
        if (status === 'archived' || status === 'cancelled') return false;
        break;
      case 'awaiting_documents':
        if (status !== 'documents') return false;
        break;
      case 'ended_without_documents':
        if (!end || end >= today) return false;
        if (!(status === 'in_progress' || status === 'exam' || status === 'documents'))
          return false;
        break;
      case 'ends_today':
        if (end !== today) return false;
        if (status === 'archived' || status === 'cancelled') return false;
        break;
      case 'archive':
        if (status !== 'archived') return false;
        break;
      default:
        break;
    }
    const wantsArchive =
      filter.includeArchived ||
      filter.quick === 'archive' ||
      (statuses?.includes('archived') ?? false);
    if (status === 'archived' && !wantsArchive) return false;
    return true;
  });
}

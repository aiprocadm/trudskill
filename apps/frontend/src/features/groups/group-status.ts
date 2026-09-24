/**
 * Статусы группы CDOPROF на экране (ТЗ перехода §4, §6.1 МГ-B3; Фаза 2, срез 8.3).
 *
 * Словарь повторяет бэкенд (`mvp/groups/group-status.ts`): те же восемь канонических
 * статусов, те же старые синонимы снимка (`scheduled/active/completed`), которые сервер не
 * переписывает (РМ45). Подписи — для чипа, отбора и списка переходов; тексты — те же, что
 * сервер пишет в 409, чтобы человек читал одно и то же слово на экране и в ошибке.
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

const CHAIN: ReadonlyArray<GroupStatus> = [
  'draft',
  'recruiting',
  'in_progress',
  'exam',
  'documents',
  'closed',
  'archived'
];

const LEGACY: Record<string, GroupStatus> = {
  scheduled: 'recruiting',
  active: 'in_progress',
  completed: 'closed'
};

/** Подписи статусов группы — как на бэкенде (`GROUP_STATUS_LABEL`). */
export const GROUP_STATUS_LABEL: Record<GroupStatus, string> = {
  draft: 'Черновик',
  recruiting: 'Набор',
  in_progress: 'Учатся',
  exam: 'Экзамен',
  documents: 'Ждут документов',
  closed: 'Закрыта',
  archived: 'В архиве',
  cancelled: 'Отменена'
};

export const normalizeGroupStatus = (raw: string | undefined): GroupStatus | null => {
  if (!raw) return null;
  if ((GROUP_STATUSES as ReadonlyArray<string>).includes(raw)) return raw as GroupStatus;
  return LEGACY[raw] ?? null;
};

/** Подпись статуса группы; неизвестный — общей подписью чипа (латиницей не останется). */
export const groupStatusLabel = (
  raw: string | undefined,
  fallback: (s: string) => string
): string => {
  const status = normalizeGroupStatus(raw);
  return status ? GROUP_STATUS_LABEL[status] : fallback(raw ?? 'draft');
};

/** Куда можно перевести вручную (РМ46) — зеркало правила сервера. */
export const allowedGroupTransitions = (raw: string | undefined): GroupStatus[] => {
  const from = normalizeGroupStatus(raw) ?? 'draft';
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
};

export const isGroupArchivable = (raw: string | undefined): boolean => {
  const status = normalizeGroupStatus(raw);
  return status === 'closed' || status === 'cancelled';
};

/** Закрытая, архивная или отменённая (и старая `completed`): даты, код и компания не правятся — зеркало сервера (МГ-B4.1). */
export const isGroupLocked = (raw: string | undefined): boolean => {
  const status = normalizeGroupStatus(raw);
  return status === 'closed' || status === 'archived' || status === 'cancelled';
};

/** Быстрые отборы реестра (МГ-B3.2) — ключи и подписи как на сервере. */
export const GROUP_QUICK_FILTERS = [
  { value: 'learning', label: 'Учатся' },
  { value: 'exam_this_week', label: 'Экзамен на этой неделе' },
  { value: 'awaiting_documents', label: 'Ждут документов' },
  { value: 'ended_without_documents', label: 'Закончились без документов' },
  { value: 'ends_today', label: 'Заканчиваются сегодня' },
  { value: 'archive', label: 'Архив' }
] as const;

export const STUDY_FORM_LABEL: Record<string, string> = {
  distance: 'Дистанционная',
  in_person: 'Очная',
  blended: 'Очно-заочная'
};

/** Период `05.11.2026 — 18.12.2026`; без дат — прочерк. */
export const formatDateRu = (iso: string | undefined): string => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

export const formatPeriod = (from: string | undefined, to: string | undefined): string => {
  if (!from && !to) return '—';
  return `${formatDateRu(from)} — ${formatDateRu(to)}`;
};

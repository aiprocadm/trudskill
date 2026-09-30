/**
 * Подписи и правила экрана «Перенос данных» (срез 23.5): всё, что можно проверить без браузера.
 * Кодов на экране нет — только слова (правило 2 «Продукт должен быть понятен»).
 */
import type {
  ImportDomain,
  ImportRowDto,
  ImportRunDomain,
  ImportRunDto,
  ImportRunStatus
} from './api';

export const DOMAIN_LABELS: Record<ImportRunDomain, string> = {
  all: 'Всё сразу',
  counterparties: 'Компании',
  directions: 'Направления',
  courses: 'Курсы',
  learners: 'Слушатели',
  groups: 'Группы',
  group_courses: 'Курсы групп',
  enrollments: 'Зачисления'
};

/** Порядок в списке выбора — порядок переноса (ТЗ §13.4). */
export const DOMAIN_OPTIONS: ImportRunDomain[] = [
  'all',
  'counterparties',
  'directions',
  'courses',
  'learners',
  'groups',
  'group_courses',
  'enrollments'
];

const STATUS_LABELS: Record<ImportRunStatus, string> = {
  queued: 'В очереди',
  running: 'Идёт',
  succeeded: 'Готово',
  partial: 'Готово, есть ошибки',
  failed: 'Не выполнен',
  cancelled: 'Отменён'
};

export const runStatusLabel = (status: ImportRunStatus): string =>
  STATUS_LABELS[status] ?? 'Неизвестно';

/** Цвет метки — по ключу палитры, слова — отдельно (сторож `status-color-not-alone`). */
export const runChipStatus = (status: ImportRunStatus): string => {
  switch (status) {
    case 'succeeded':
      return 'completed';
    case 'partial':
      return 'pending';
    default:
      return status;
  }
};

export const isRunActive = (run: Pick<ImportRunDto, 'status'>): boolean =>
  run.status === 'queued' || run.status === 'running';

/** Итог запуска одной строкой: сухой прогон говорит «будет», перенос — «сделано». */
export const runSummary = (run: Pick<ImportRunDto, 'dryRun' | 'stats' | 'status'>): string => {
  if (isRunActive(run)) return 'Идёт перенос — отчёт появится по окончании.';
  const s = run.stats;
  if (!s || s.total === 0) return 'Строк нет.';
  const parts = [
    `${run.dryRun ? 'будет создано' : 'создано'} ${s.created}`,
    `${run.dryRun ? 'будет дополнено' : 'дополнено'} ${s.updated}`,
    `пропущено ${s.skipped}`,
    ...(s.mergeCandidates > 0 ? [`на решение ${s.mergeCandidates}`] : []),
    ...(s.failed > 0 ? [`ошибок ${s.failed}`] : [])
  ];
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** «Повторить только ошибки» — только у переноса с ошибками; сухой прогон ничего не переносил. */
export const canRetry = (run: Pick<ImportRunDto, 'dryRun' | 'stats' | 'status'>): boolean =>
  !run.dryRun && !isRunActive(run) && (run.stats?.failed ?? 0) > 0;

/** Отборы отчёта: что человек ищет — ошибки и кандидатов на слияние. */
export const ROW_FILTERS = [
  { id: 'all', label: 'Все строки' },
  { id: 'failed', label: 'Не перенесено', query: { action: 'failed' as const } },
  { id: 'merge', label: 'На решение: похожие записи', query: { errorCode: 'merge_candidate' } },
  { id: 'created', label: 'Новые', query: { action: 'created' as const } },
  { id: 'updated', label: 'Дополненные', query: { action: 'updated' as const } },
  { id: 'skipped', label: 'Пропущенные', query: { action: 'skipped' as const } }
] as const;

export type RowFilterId = (typeof ROW_FILTERS)[number]['id'];

/** Итог строки словами: у пропуска их несколько, и человеку важно, какой именно. */
export const rowResultLabel = (
  row: Pick<ImportRowDto, 'action' | 'errorCode'>,
  dryRun: boolean
): string => {
  if (row.errorCode === 'merge_candidate') return 'Похожая запись — решите вручную';
  if (row.errorCode === 'unchanged') return 'Уже перенесено';
  switch (row.action) {
    case 'created':
      return dryRun ? 'Будет создано' : 'Создано';
    case 'updated':
      return dryRun ? 'Будет дополнено' : 'Дополнено';
    case 'skipped':
      return 'Пропущено';
    case 'failed':
      return 'Не перенесено';
    default:
      return 'Неизвестно';
  }
};

/** Что за запись: имя, название, номер или код из выжимки; в крайнем случае — номер в источнике. */
export const rowSubject = (row: Pick<ImportRowDto, 'raw' | 'sourceId' | 'domain'>): string => {
  const raw = row.raw ?? {};
  const pick = (key: string) =>
    typeof raw[key] === 'string' && raw[key] !== '—' ? (raw[key] as string) : undefined;
  const named = pick('name') ?? pick('title') ?? pick('number') ?? pick('code');
  return named
    ? `${named} (№ ${row.sourceId} в прежней системе)`
    : `№ ${row.sourceId} в прежней системе`;
};

export const domainLabel = (domain: ImportDomain | ImportRunDomain): string =>
  DOMAIN_LABELS[domain] ?? 'Прочее';

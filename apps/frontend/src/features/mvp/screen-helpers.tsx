'use client';

import { FilterBar, statusAccessibleLabel } from '@trudskill/ui';

import { SectionError } from '../../components/state-wrappers';
import { describeError } from '../../lib/errors/error-text';

/*
 * Общий слой экранов монолита (§8.3 «Границы разбиения»): пока последний экран не уехал
 * из `features/mvp/screens.tsx`, разделяемые мелочи живут здесь, рядом с `hooks.ts`.
 * Вынесены при разбиении волны 1 (Фаза 4 редизайна, срез 2) — экраны групп и карточка
 * слушателя переехали в свои папки, а эти помощники нужны и им, и оставшимся экранам.
 */
/**
 * Статусы зачисления по-русски (`TXT-006`).
 *
 * Словарь жил в двух файлах одновременно (`mvp/screens.tsx` и карточка группы). Карточке
 * слушателя он нужен третьим — вместо третьей копии он переехал сюда, в общий слой.
 */
export const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  active: 'Учится',
  suspended: 'Приостановлен',
  completed: 'Завершил',
  cancelled: 'Отменён'
};

/**
 * Виды документов по-русски (`TXT-006`). Жил в карточке слушателя (learner-pdf-card),
 * экрану «Мои курсы» нужен вторым — вместо копии словарь переехал в общий слой.
 */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  certificate: 'Удостоверение',
  protocol: 'Протокол',
  order: 'Приказ',
  diploma: 'Диплом',
  attestation: 'Свидетельство об аттестации',
  reference: 'Справка',
  report: 'Отчёт',
  contract: 'Договор'
};

/**
 * Дата человеку — днём, месяцем и годом, а не машинной строкой `2026-03-12T00:00:00Z`.
 * Пустое значение остаётся прочерком: выдумывать «сегодня» вместо отсутствующей даты нельзя.
 */
export const formatDate = (value: string | undefined | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ru-RU');
};

/**
 * `TXT-004`: текст ошибки для человека — что произошло и что делать.
 *
 * Раньше эта функция брала `normalized.message`, то есть **сырое сообщение сервера**, и тем
 * самым обходила человеческий текст: двенадцать экранов показывали через неё «Unexpected API
 * error» и подобное. Теперь разбор общий — тот же, что у `SectionError`.
 */
export const readApiMessage = (error: unknown) => describeError(error).message;

export const MutationError = ({ message }: { message: string | null }) =>
  message ? <SectionError message={message} /> : null;

/**
 * Приведение строк к виду, который принимает таблица пакета.
 *
 * Жило в монолите; понадобилось вынесенным экранам — перенесено в общий слой (§8.3),
 * чтобы не заводить вторую такую же функцию.
 */
export const toTableRows = <T extends object>(rows: T[]): Record<string, unknown>[] =>
  rows as unknown as Record<string, unknown>[];

/*
 * Поиск и отбор по состоянию — общая пара для реестров монолита.
 * Перенесены в общий слой (§8.3) при выносе экранов курсов: ими пользуются оба места.
 */
export const STATUS_OPTIONS = [
  'active',
  'blocked',
  'draft',
  'archived',
  'published',
  'pending',
  'suspended',
  'completed',
  'cancelled'
] as const;

export const RegistryControls = ({
  q,
  setQ,
  status,
  setStatus
}: {
  q: string;
  setQ: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
}) => (
  <FilterBar>
    <input
      placeholder="Поиск"
      value={q}
      onChange={(event) => setQ(event.target.value)}
      aria-label="Поиск"
    />
    {/*
      Подпись — по-русски: фильтр показывал человеку машинные значения («active», «blocked»,
      «cancelled»), хотя готовая подпись статуса уже жила в пакете рядом с чипом.
    */}
    <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Статус">
      <option value="">Все статусы</option>
      {STATUS_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {statusAccessibleLabel(option)}
        </option>
      ))}
    </select>
  </FilterBar>
);

/*
 * Скелет списка на время загрузки. Жил в монолите; после выноса пользователей понадобился
 * и там, и здесь — перенесён в общий слой (§8.3), а не продублирован.
 */
export const ListSkeleton = ({ lines = 4 }: { lines?: number }) => (
  <div className="ui-skeleton-block" aria-hidden>
    {Array.from({ length: lines }, (_, i) => (
      <div key={i} className="ui-skeleton-line" style={{ width: `${70 + (i % 3) * 10}%` }} />
    ))}
  </div>
);

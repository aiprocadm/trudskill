/**
 * Календарь (ТЗ перехода §5.1, МГ-G1.1/G3.3; Фаза 5, срез 24.1).
 *
 * События не хранятся: календарь — запрос по источникам (ТЗ §5.4.4). Тип события говорит, откуда
 * оно и какого цвета на экране; `source` — куда вести человека по «Открыть».
 */

export const CALENDAR_EVENT_TYPES = [
  'group_start',
  'group_end',
  'exam',
  'exam_window',
  'materials_access_end',
  'practice',
  'deadline',
  'task'
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

/** Типы, которые идут из дат группы: видны с правом `groups.read`. */
export const GROUP_EVENT_TYPES: readonly CalendarEventType[] = [
  'group_start',
  'group_end',
  'exam',
  'exam_window',
  'materials_access_end',
  'practice'
];

export interface CalendarEvent {
  /** `тип:источник[:день]` — устойчив между запросами. */
  id: string;
  type: CalendarEventType;
  title: string;
  /** `YYYY-MM-DD` для событий на весь день, ISO-момент — для событий со временем. */
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  source: { type: 'group' | 'task'; id: string };
  group?: { id: string; code: string };
  counterparty?: { name: string };
  /** Для «Окончания обучения» и экзамена — сколько слушателей. */
  learnersCount?: number;
  /** Задача просрочена (срок прошёл, не выполнена). */
  overdue?: boolean;
}

export interface CalendarQuery {
  from: string;
  to: string;
  types?: CalendarEventType[];
  mine?: boolean;
  groupStatus?: string;
  counterpartyId?: string;
  directionId?: string;
  q?: string;
}

/** Больше — «загружается год целиком» (ТЗ §18): 400 `range_too_wide`. Умолчание, не закон. */
export const DEFAULT_MAX_RANGE_DAYS = 93;

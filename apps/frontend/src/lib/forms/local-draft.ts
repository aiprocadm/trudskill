/**
 * Черновик длинной формы с отметкой времени (ТЗ «Стабилизация, UX и развитие», задача 10.3).
 *
 * **Что было.** Черновик мастера курса существовал и писался в хранилище браузера, но
 * восстанавливался МОЛЧА. Человек открывал «Создать курс» и видел наполовину заполненную
 * форму, не понимая, откуда она: его это работа или чужая, вчерашняя или месячной давности.
 * Дальше два исхода, оба плохие: он затирает нужное или создаёт второй такой же курс.
 *
 * **Поэтому ТЗ требует не черновик, а ВОПРОС с отметкой времени:** «Черновик от 14:20,
 * восстановить?». Отметка времени и есть ответ на «моё ли это»: человек помнит, когда он
 * тут был.
 *
 * **Хранилище браузера ненадёжно по построению.** Приватное окно, очищенные данные сайта,
 * запрет на хранение — любое обращение может бросить исключение или вернуть пустоту. Поэтому
 * каждое чтение и запись обёрнуты, а форма обязана работать, когда черновика нет вовсе.
 */

/**
 * Сколько дней черновик считается свежим.
 *
 * Не «чтобы не копилось». Черновик недельной давности человек уже не помнит, и предложить его
 * — значит подсунуть незнакомый текст под видом своего. Лучше чистая форма, чем чужая работа.
 *
 * Значение по умолчанию, а не константа: срок жизни черновика — настройка (правило ТЗ о
 * числах).
 */
export const DEFAULT_DRAFT_LIFETIME_DAYS = 7;

const MIN_DRAFT_LIFETIME_DAYS = 1;
const MAX_DRAFT_LIFETIME_DAYS = 90;

/**
 * Привести настройку срока к допустимому. Непонятное значение — это значение по умолчанию,
 * а не отключённый черновик: опечатка в настройке не должна незаметно отнимать защиту.
 */
export const resolveDraftLifetimeDays = (raw: unknown): number => {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_DRAFT_LIFETIME_DAYS;
  const whole = Math.floor(value);
  if (whole < MIN_DRAFT_LIFETIME_DAYS) return MIN_DRAFT_LIFETIME_DAYS;
  if (whole > MAX_DRAFT_LIFETIME_DAYS) return MAX_DRAFT_LIFETIME_DAYS;
  return whole;
};

/** Что лежит в хранилище: сами данные и когда их записали. */
export interface DraftEnvelope<T> {
  savedAt: string;
  value: T;
}

export type DraftState<T> =
  | { status: 'none' }
  | { status: 'stale'; savedAt: Date }
  | { status: 'ready'; savedAt: Date; value: T };

/** Упаковать черновик к записи. */
export const draftEnvelope = <T>(value: T, now: Date): DraftEnvelope<T> => ({
  savedAt: now.toISOString(),
  value
});

/**
 * Разобрать то, что лежало в хранилище.
 *
 * Любой сбор — «черновика нет», а не исключение: испорченная запись не должна мешать
 * создавать курс. Отдельно отмечается просроченный черновик — его надо не предлагать, но и
 * стереть, иначе он будет лежать вечно.
 */
export const readDraft = <T>(
  raw: string | null | undefined,
  now: Date,
  lifetimeDays: number = DEFAULT_DRAFT_LIFETIME_DAYS
): DraftState<T> => {
  if (!raw) return { status: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'none' };
  }
  if (!parsed || typeof parsed !== 'object') return { status: 'none' };
  const envelope = parsed as Partial<DraftEnvelope<T>>;
  if (typeof envelope.savedAt !== 'string' || envelope.value === undefined) {
    /*
     * Черновик из старой формы хранения — без отметки времени. Предлагать его нельзя: без
     * времени человеку не на что опереться в ответе «моё ли это». Считаем, что черновика нет.
     */
    return { status: 'none' };
  }
  const savedAt = new Date(envelope.savedAt);
  if (Number.isNaN(savedAt.getTime())) return { status: 'none' };

  const ageDays = (now.getTime() - savedAt.getTime()) / 86_400_000;
  /*
   * Отметка из будущего — это переведённые часы или чужая машина, а не черновик завтрашнего
   * дня. Такой записи верить нельзя, но и молча подставлять её тоже: считаем просроченной.
   */
  if (ageDays < 0 || ageDays > resolveDraftLifetimeDays(lifetimeDays)) {
    return { status: 'stale', savedAt };
  }
  return { status: 'ready', savedAt, value: envelope.value as T };
};

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря'
];

const twoDigits = (value: number): string => String(value).padStart(2, '0');

/**
 * Текст предложения восстановить.
 *
 * **Сегодняшний черновик называется временем, вчерашний и старше — датой.** «Черновик от
 * 14:20» про позавчерашнюю работу вводит в заблуждение сильнее, чем молчание: человек
 * прочитает это как «двадцать минут назад» и восстановит не глядя.
 */
export const draftPrompt = (savedAt: Date, now: Date): string => {
  const time = `${twoDigits(savedAt.getHours())}:${twoDigits(savedAt.getMinutes())}`;
  const sameDay =
    savedAt.getFullYear() === now.getFullYear() &&
    savedAt.getMonth() === now.getMonth() &&
    savedAt.getDate() === now.getDate();
  if (sameDay) return `Черновик от ${time} — восстановить?`;
  const month = MONTHS[savedAt.getMonth()] ?? '';
  return `Черновик от ${savedAt.getDate()} ${month}, ${time} — восстановить?`;
};

/** Кнопки ответа. Называют результат, а не «Да» и «Нет» (`TXT-002`). */
export const DRAFT_RESTORE_LABEL = 'Восстановить черновик';
export const DRAFT_DISCARD_LABEL = 'Начать заново';

/**
 * Чтение из хранилища браузера со всеми его отказами.
 *
 * Обращение к хранилищу бросает исключение в приватном окне и при запрете на данные сайта.
 * Форма обязана открыться и там.
 */
export const readDraftFrom = <T>(
  store: Pick<Storage, 'getItem'> | undefined,
  key: string,
  now: Date,
  lifetimeDays?: number
): DraftState<T> => {
  if (!store) return { status: 'none' };
  try {
    return readDraft<T>(store.getItem(key), now, lifetimeDays);
  } catch {
    return { status: 'none' };
  }
};

/** Запись в хранилище браузера. Отказ хранилища не должен ронять форму. */
export const writeDraftTo = <T>(
  store: Pick<Storage, 'setItem'> | undefined,
  key: string,
  value: T,
  now: Date
): void => {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(draftEnvelope(value, now)));
  } catch {
    /* Хранилище переполнено или запрещено — форма продолжает работать без черновика. */
  }
};

/** Удаление черновика: после сохранения и после отказа от восстановления. */
export const clearDraftIn = (store: Pick<Storage, 'removeItem'> | undefined, key: string): void => {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* см. выше */
  }
};

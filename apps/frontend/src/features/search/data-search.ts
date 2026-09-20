import { apiRequest } from '../../lib/api/client';

/**
 * Поиск по данным для строки поиска в шапке (ТЗ «Стабилизация, UX и развитие», 3.6 / Н6).
 *
 * **Что было.** `Ctrl+K` искал только по названиям пунктов меню. «серт» → «Ничего не найдено»,
 * хотя есть и «Удостоверения», и «Документы». Человек ищет не раздел — он ищет СВОЁ: фамилию
 * слушателя, номер документа, название группы (журнал 590).
 *
 * **Почему отбор по правам делается на сервере, а не здесь.** Прямое требование ТЗ, и причина
 * простая: скрыть строку на экране недостаточно — данные к тому моменту уже ушли из системы, и
 * человек, открывший средства разработчика, видит всё, что «скрыли».
 */

export type SearchEntity = 'learner' | 'group' | 'course' | 'counterparty' | 'document';

export interface DataHit {
  entity: SearchEntity;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  /** Русское название типа — на экране не должно быть ни одного кода. */
  entityLabel: string;
}

/** Подписи типов. Зеркало серверных: расхождение стережёт тест. */
export const SEARCH_ENTITY_LABELS: Record<SearchEntity, string> = {
  learner: 'Слушатели',
  group: 'Группы',
  course: 'Курсы',
  counterparty: 'Компании',
  document: 'Документы'
};

/** Подсказка в пустой строке поиска (ТЗ 3.6, пункт 4). */
export const SEARCH_EMPTY_HINT =
  'Введите фамилию слушателя, номер документа, название группы, курса или компании.';

/**
 * Подсказка, когда ничего не нашлось.
 *
 * Называет сам запрос: без него человек не понимает, искали ли то, что он набрал, — особенно
 * когда он опечатался и не заметил. «Ничего не найдено» не говорит и того, что делать дальше.
 */
export const searchEmptyResult = (query: string): string =>
  query.length === 0
    ? SEARCH_EMPTY_HINT
    : `По запросу «${query}» ничего не нашлось. Проверьте написание или попробуйте часть слова — например, фамилию без имени.`;

/**
 * Спросить сервер.
 *
 * Короткий запрос не отправляется вовсе: один-два символа совпадут почти со всем и выдадут
 * случайную выборку, которая выглядит как ответ.
 */
export const searchData = async (query: string): Promise<DataHit[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const result = await apiRequest<{ items: Omit<DataHit, 'entityLabel'>[] }>(
    `search?q=${encodeURIComponent(trimmed)}`
  );
  return result.items.map((item) => ({
    ...item,
    entityLabel: SEARCH_ENTITY_LABELS[item.entity] ?? 'Найдено'
  }));
};

/**
 * Словарь синонимов поиска (ТЗ «Стабилизация, UX и развитие», 3.6 / Н6).
 *
 * **Что было.** Поиск искал только по названиям пунктов меню. Человек вводил «серт» и получал
 * «Ничего не найдено» — хотя в системе есть и «Удостоверения», и «Документы». Он ищет не раздел,
 * он ищет СВОЁ: фамилию слушателя, номер документа, название группы (журнал 590).
 *
 * **Зачем отдельный файл.** ТЗ прямо: «словарь синонимов — отдельным файлом, чтобы пополнять без
 * правки логики». Слова, которыми люди называют документы, приносит жизнь: сегодня «корочка»,
 * завтра «книжка». Дописать строку в словарь должен мочь тот, кто разбирает обращения
 * пользователей, а не тот, кто правит поиск.
 *
 * **Почему синонимы ведут к ТИПУ, а не к разделу.** «Серт» — это не «перейти в раздел
 * документов», это «показать документы, подходящие под запрос». Разница видна, когда у человека
 * триста документов: раздел не отвечает на вопрос, а найденная строка отвечает.
 */

/** Что ищем. Набор закрыт: новый тип — это новый запрос к базе, а не строка в словаре. */
export type SearchEntity = 'learner' | 'group' | 'course' | 'counterparty' | 'document';

/**
 * Слово → тип. Ключи в нижнем регистре и без окончаний: сравнение идёт по началу слова, поэтому
 * «удостовер» покрывает и «удостоверение», и «удостоверения», и «удостоверению».
 */
export const SEARCH_SYNONYMS: ReadonlyArray<{ prefix: string; entity: SearchEntity }> = [
  /* Документы — здесь разнобой самый большой: у каждого центра своё слово. */
  { prefix: 'серт', entity: 'document' },
  { prefix: 'удостовер', entity: 'document' },
  { prefix: 'корочк', entity: 'document' },
  { prefix: 'документ', entity: 'document' },
  { prefix: 'диплом', entity: 'document' },
  { prefix: 'свидетельств', entity: 'document' },
  { prefix: 'протокол', entity: 'document' },

  /* Люди. «Ученик» и «курсант» — как их называют в центрах, хотя в системе они «слушатели». */
  { prefix: 'слушател', entity: 'learner' },
  { prefix: 'ученик', entity: 'learner' },
  { prefix: 'курсант', entity: 'learner' },
  { prefix: 'обучающ', entity: 'learner' },

  { prefix: 'групп', entity: 'group' },
  { prefix: 'поток', entity: 'group' },

  { prefix: 'курс', entity: 'course' },
  { prefix: 'программ', entity: 'course' },

  { prefix: 'компан', entity: 'counterparty' },
  { prefix: 'организац', entity: 'counterparty' },
  { prefix: 'заказчик', entity: 'counterparty' },
  { prefix: 'контрагент', entity: 'counterparty' }
];

/**
 * На какие типы намекает запрос.
 *
 * Пустой ответ означает «намёка нет» — искать надо везде, а не нигде. Это важнее, чем кажется:
 * человек чаще вводит фамилию или номер, чем слово «слушатель», и поиск, который без намёка
 * молчит, бесполезен в самом частом случае.
 */
export const entitiesHintedBy = (query: string): SearchEntity[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hinted = new Set<SearchEntity>();
  for (const word of words) {
    for (const { prefix, entity } of SEARCH_SYNONYMS) {
      if (word.startsWith(prefix)) hinted.add(entity);
    }
  }
  return [...hinted];
};

/**
 * Право, без которого тип не показывается в результатах.
 *
 * **Отбор по правам делается на СЕРВЕРЕ** (прямое требование ТЗ 3.6). Скрыть строку на экране
 * недостаточно: данные к тому моменту уже ушли из системы, и человек, открывший средства
 * разработчика, видит всё, что «скрыли».
 */
export const SEARCH_PERMISSION: Record<SearchEntity, string> = {
  learner: 'learners.read',
  group: 'groups.read',
  course: 'courses.read',
  counterparty: 'counterparties.read',
  document: 'documents.read'
};

/** Что человеку вообще позволено искать — по его правам. */
export const allowedEntities = (permissions: readonly string[] | undefined): SearchEntity[] => {
  const held = new Set(permissions ?? []);
  return (Object.keys(SEARCH_PERMISSION) as SearchEntity[]).filter((entity) =>
    held.has(SEARCH_PERMISSION[entity])
  );
};

/**
 * Итог: где искать по этому запросу для этого человека.
 *
 * Намёк СУЖАЕТ область, но не расширяет: попросив «сертификат», человек с правом только на
 * слушателей не получит документы. Обратный порядок («намёк важнее прав») был бы дырой в правах,
 * открываемой одним словом в строке поиска.
 */
export const searchScope = (
  query: string,
  permissions: readonly string[] | undefined
): SearchEntity[] => {
  const allowed = allowedEntities(permissions);
  const hinted = entitiesHintedBy(query);
  if (hinted.length === 0) return allowed;
  const narrowed = allowed.filter((entity) => hinted.includes(entity));
  /*
   * Намёк есть, но всё намёкнутое человеку недоступно — ищем по всему, что ему можно. Иначе
   * поиск молча возвращает пустоту, и человек решает, что данных нет, хотя их просто не его
   * правами искать.
   */
  return narrowed.length > 0 ? narrowed : allowed;
};

/** Подсказка в пустой строке поиска (ТЗ 3.6, пункт 4). */
export const SEARCH_EMPTY_HINT =
  'Введите фамилию слушателя, номер документа, название группы, курса или компании.';

/**
 * Подсказка, когда ничего не нашлось.
 *
 * Называет сам запрос: без него человек не понимает, искали ли то, что он набрал, — особенно
 * когда он опечатался и не заметил.
 */
export const searchEmptyResult = (query: string): string =>
  `По запросу «${query}» ничего не нашлось. Проверьте написание или попробуйте часть слова — например, фамилию без имени.`;

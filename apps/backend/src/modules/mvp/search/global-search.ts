import { maskedSnils } from '../pii-masking.js';
import { type SearchEntity, searchScope } from './search-synonyms.js';

/**
 * Поиск по данным, а не по названиям разделов (ТЗ «Стабилизация, UX и развитие», 3.6 / Н6).
 *
 * **Что было.** `Ctrl+K` искал только по пунктам меню. «серт» → «Ничего не найдено», хотя есть и
 * «Удостоверения», и «Документы». Администратору платформы при этом предлагались пункты
 * слушателя — «Мой кабинет», «Мои курсы» (журнал 590).
 *
 * **Главное в этом поиске — не находить лишнего.** Строка поиска есть у всех, и она соблазняет
 * ввести фамилию знакомого. Поэтому область поиска считается по ПРАВАМ, на сервере, до всякого
 * обращения к данным.
 *
 * **Зачем отдельный чистый модуль.** Отбор по правам, разбор синонимов и сведение результатов —
 * это правила, а не запросы. Проверить их надо без базы, иначе они проверяются только там, где
 * их труднее всего проверять.
 */

export interface SearchHit {
  entity: SearchEntity;
  id: string;
  /** Что человек увидит строкой. */
  title: string;
  /** Чем эта строка отличается от соседней: группа, номер, компания. */
  subtitle?: string;
  /** Куда ведёт. */
  href: string;
}

/** Источник данных: то, что служба умеет читать. Разделено ради проверки правил без базы. */
export interface SearchSource {
  learners: Array<{
    id: string;
    lastName: string;
    firstName: string;
    snils?: string;
    login?: string;
  }>;
  groups: Array<{ id: string; name: string; courseTitle?: string }>;
  courses: Array<{ id: string; title: string }>;
  counterparties: Array<{ id: string; name: string }>;
  documents: Array<{ id: string; number: string; learnerName?: string }>;
}

const norm = (value: string): string => value.toLowerCase().trim();

/** Цифры отдельно: номер документа и СНИЛС люди вводят и с разделителями, и без. */
const digits = (value: string): string => value.replace(/\D/g, '');

const matches = (haystack: string, needle: string): boolean =>
  norm(haystack).includes(norm(needle));

/**
 * Сколько строк отдаём на тип.
 *
 * Пять — не «чтобы быстрее». Список, где сорок строк одного типа, не помогает: человек ищет
 * конкретное и должен увидеть его сразу или уточнить запрос. Сорок строк заставляют
 * вглядываться, то есть делают ровно то, чего поиск должен избегать.
 */
export const SEARCH_LIMIT_PER_ENTITY = 5;

/**
 * Найти.
 *
 * Возвращает плоский список, сгруппированный по типам на экране, — порядок типов здесь и
 * задаёт порядок групп: сначала люди, потом их группы, потом всё остальное. Так устроен и сам
 * вопрос: чаще всего ищут человека.
 */
export const search = (
  query: string,
  permissions: readonly string[] | undefined,
  source: SearchSource
): SearchHit[] => {
  const trimmed = query.trim();
  /*
   * Один символ — это ещё не запрос: он совпадёт почти со всем и выдаст случайную выборку,
   * которая выглядит как ответ. Два — уже осмысленный кусок фамилии или номера.
   */
  if (trimmed.length < 2) return [];

  const scope = new Set(searchScope(trimmed, permissions));
  const q = norm(trimmed);
  const qDigits = digits(trimmed);
  const hits: SearchHit[] = [];

  if (scope.has('learner')) {
    hits.push(
      ...source.learners
        .filter(
          (learner) =>
            matches(`${learner.lastName} ${learner.firstName}`, q) ||
            (learner.login ? matches(learner.login, q) : false) ||
            /*
             * По СНИЛС ищем только когда введены цифры: буквенный запрос не должен случайно
             * совпасть с номером, а короткий набор цифр — выдать пол-базы.
             */
            (qDigits.length >= 4 && learner.snils ? digits(learner.snils).includes(qDigits) : false)
        )
        .slice(0, SEARCH_LIMIT_PER_ENTITY)
        .map((learner) => ({
          entity: 'learner' as const,
          id: learner.id,
          title: `${learner.lastName} ${learner.firstName}`,
          /*
           * В подсказке СНИЛС показан ЧАСТИЧНО — как и в списках (ТЗ 17.2). Поиск не должен
           * становиться обходным путём к персональным данным: строка поиска есть у всех.
           */
          ...(learner.snils ? { subtitle: maskedSnils(learner.snils) } : {}),
          href: `/learners/${learner.id}`
        }))
    );
  }

  if (scope.has('group')) {
    hits.push(
      ...source.groups
        .filter((group) => matches(group.name, q))
        .slice(0, SEARCH_LIMIT_PER_ENTITY)
        .map((group) => ({
          entity: 'group' as const,
          id: group.id,
          title: group.name,
          ...(group.courseTitle ? { subtitle: group.courseTitle } : {}),
          href: `/groups/${group.id}`
        }))
    );
  }

  if (scope.has('course')) {
    hits.push(
      ...source.courses
        .filter((course) => matches(course.title, q))
        .slice(0, SEARCH_LIMIT_PER_ENTITY)
        .map((course) => ({
          entity: 'course' as const,
          id: course.id,
          title: course.title,
          href: `/courses/${course.id}`
        }))
    );
  }

  if (scope.has('counterparty')) {
    hits.push(
      ...source.counterparties
        .filter((cp) => matches(cp.name, q))
        .slice(0, SEARCH_LIMIT_PER_ENTITY)
        .map((cp) => ({
          entity: 'counterparty' as const,
          id: cp.id,
          title: cp.name,
          href: `/counterparties/${cp.id}`
        }))
    );
  }

  if (scope.has('document')) {
    hits.push(
      ...source.documents
        .filter(
          (doc) =>
            matches(doc.number, q) ||
            (qDigits.length >= 2 ? digits(doc.number).includes(qDigits) : false)
        )
        .slice(0, SEARCH_LIMIT_PER_ENTITY)
        .map((doc) => ({
          entity: 'document' as const,
          id: doc.id,
          title: `№ ${doc.number}`,
          ...(doc.learnerName ? { subtitle: doc.learnerName } : {}),
          href: `/documents/${doc.id}`
        }))
    );
  }

  return hits;
};

/** Русские названия групп результата — на экране не должно быть ни одного кода. */
export const SEARCH_ENTITY_LABELS: Record<SearchEntity, string> = {
  learner: 'Слушатели',
  group: 'Группы',
  course: 'Курсы',
  counterparty: 'Компании',
  document: 'Документы'
};

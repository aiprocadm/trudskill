/**
 * Карточка курса глазами методиста (ТЗ «Стабилизация, UX и развитие», 8.4).
 *
 * **Как было.** Вкладки на карточке появились ещё в 5.7, но состав их не совпадал с тем, что
 * ТЗ назвало поимённо: «Состав программы · Нормативные параметры · Документы по окончании ·
 * Версии». Аттестации — того, чем обучение заканчивается, — отдельного места не было вовсе:
 * методист собирал программу здесь, а проверял, есть ли у неё экзамен, в другом разделе.
 * «Версии» же не предмет разговора, а свойство параметров: версия программы и есть набор
 * нормативных параметров на дату.
 *
 * **Стало ровно по ТЗ:** Параметры · Программа · Аттестация · Документы.
 */

export interface CourseTab {
  id: string;
  label: string;
}

/** Порядок = порядок работы: сначала «что за программа», потом «из чего», чем кончается, что выдаём. */
export const COURSE_TABS: CourseTab[] = [
  { id: 'params', label: 'Параметры' },
  { id: 'program', label: 'Программа' },
  { id: 'assessment', label: 'Аттестация' },
  { id: 'documents', label: 'Документы' }
];

/**
 * Прежние имена вкладок остаются рабочими в адресе.
 *
 * Вкладка живёт в адресной строке (`?tab=…`), и такие ссылки люди кладут в переписку и в
 * закладки. Переименовать вкладку и молча сломать чужую ссылку — то же самое, что переставить
 * дверь и не повесить табличку. Старое имя переводится в новое, а не отбрасывается.
 */
const TAB_ALIASES: Record<string, string> = {
  content: 'program',
  versions: 'params'
};

export const resolveCourseTab = (raw: string | null | undefined): string => {
  const wanted = (raw ?? '').trim();
  const mapped = TAB_ALIASES[wanted] ?? wanted;
  return COURSE_TABS.some((tab) => tab.id === mapped) ? mapped : COURSE_TABS[0]!.id;
};

/** Адрес предпросмотра: та же программа, какой её увидит слушатель (ТЗ 8.4). */
export const coursePreviewHref = (courseId: string): string => `/courses/${courseId}/preview`;

/**
 * Итоговый экзамен курса — тест, не привязанный к модулю.
 *
 * Тесты модулей промежуточные и экзамена не заменяют: слушатель пройдёт все модули и упрётся
 * в отсутствующую аттестацию. То же правило уже работает в сводке обучения — и определение
 * должно быть ОДНО, иначе два экрана начнут расходиться в ответе на один вопрос.
 */
export interface CourseTestRef {
  id: string;
  courseId: string;
  moduleId?: string;
  title: string;
  publishedAt?: string;
  isArchived?: boolean;
}

export const finalExamOf = (tests: CourseTestRef[], courseId: string): CourseTestRef | null =>
  tests.find((test) => test.courseId === courseId && !test.moduleId && !test.isArchived) ?? null;

export const moduleTestsOf = (tests: CourseTestRef[], courseId: string): CourseTestRef[] =>
  tests.filter((test) => test.courseId === courseId && Boolean(test.moduleId) && !test.isArchived);

/**
 * Что сказать методисту про аттестацию курса — словами, а не кодом состояния.
 *
 * Пустой экран с надписью «нет данных» не объясняет ни что это, ни что делать (`TPL-006`).
 */
export const assessmentSummary = (
  exam: CourseTestRef | null
): { title: string; hint: string; ready: boolean } => {
  if (!exam) {
    return {
      title: 'Итогового экзамена нет',
      hint: 'Слушатели дойдут до конца программы и упрутся: проверить знания будет нечем. Создайте итоговый тест — это тест курса без привязки к модулю.',
      ready: false
    };
  }
  if (!exam.publishedAt) {
    return {
      title: 'Итоговый экзамен не опубликован',
      hint: 'Черновик слушателю не выдаётся. Опубликуйте тест, иначе обучение закончится ничем.',
      ready: false
    };
  }
  return {
    title: 'Итоговый экзамен готов',
    hint: 'Слушатели смогут дойти до конца программы и подтвердить знания.',
    ready: true
  };
};

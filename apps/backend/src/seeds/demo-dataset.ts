/**
 * Демонстрационный набор данных (ТЗ «Стабилизация, UX и развитие», 18.1, **решение Р19**).
 *
 * **Зачем.** В ревью диаграммы аналитики выглядели как строчки с нулями — просто потому, что
 * данных не было. Для человека, которому показывают продукт, «нули» и «не работает» неотличимы:
 * он видит пустой график и делает вывод о функции, а не о наполнении. Без этого набора
 * платформу нельзя показывать клиенту (журнал 588).
 *
 * **Что задал владелец (Р19), дословно:** 2 учебных центра (один образцовый, второй пустой —
 * чтобы показывать мастер первого запуска), 3 компании-заказчика, 5 курсов, 8 групп в разных
 * состояниях, 120 слушателей с реалистичным распределением прогресса, 90 выданных документов,
 * история за 4 месяца.
 *
 * **Почему набор описывается чистой функцией, а не пишется сразу в базу.** Состав — это решение
 * владельца, и его надо уметь проверить, не поднимая базу. Запись — отдельный шаг: он меняется
 * вместе со схемой, а состав не должен.
 *
 * **Почему всё детерминировано.** Демонстрация, которая каждый раз выглядит по-новому, — это
 * демонстрация, к которой нельзя подготовиться: показывающий не знает, что окажется на экране.
 * Случайности здесь нет вовсе, «разброс» даётся расчётом от номера записи.
 */

/** Состав набора — числа Р19. Менять можно только решением владельца. */
export const DEMO_DATASET_SHAPE = {
  tenants: 2,
  counterparties: 3,
  courses: 5,
  groups: 8,
  learners: 120,
  documents: 90,
  historyMonths: 4
} as const;

/**
 * Состояния, в которых бывают группы. Восемь групп раскладываются по ним так, чтобы на экране
 * было видно ВСЕ три: показывать продукт, где все группы в одном состоянии, бессмысленно.
 */
export const DEMO_GROUP_STATES = ['recruiting', 'in_progress', 'closed'] as const;
export type DemoGroupState = (typeof DEMO_GROUP_STATES)[number];

/**
 * Как разложены 120 слушателей по стадиям.
 *
 * Доли не круглые намеренно: «поровну» выглядит как заглушка и вызывает у смотрящего ровно то
 * подозрение, которого мы избегаем. Это распределение похоже на настоящее — большинство учится,
 * часть не начинала, меньшинство не сдало.
 */
export const DEMO_PROGRESS_MIX = {
  /** Не приступал: назначен и не открыл ни одного материала. */
  notStarted: 24,
  /** Учится: часть материалов пройдена. */
  inProgress: 42,
  /** Сдал: экзамен пройден, документ выдан или на подходе. */
  passed: 42,
  /** Не сдал: ждёт повторной проверки знаний. */
  failed: 12
} as const;

/**
 * Начало диапазона СНИЛС для демо-данных.
 *
 * Номера ниже 001-001-998 в России **не выдаются**, и для них не проверяется контрольное число.
 * Это ровно то, что нужно демо-набору: номер заведомо ничей, но система его принимает и
 * показывает как настоящий. Взять «красивый» номер вроде 123-456-789 00 нельзя — он может
 * принадлежать живому человеку (журнал 588).
 */
export const DEMO_SNILS_PREFIX = '000-000-';

/** СНИЛС для демо-слушателя по его номеру. */
export const demoSnils = (index: number): string => {
  const tail = String(index % 1000).padStart(3, '0');
  const check = String(index % 100).padStart(2, '0');
  return `${DEMO_SNILS_PREFIX}${tail} ${check}`;
};

export interface DemoTenant {
  id: string;
  name: string;
  /** Образцовый центр наполнен; второй пуст — на нём показывают мастер первого запуска. */
  populated: boolean;
}

export interface DemoLearner {
  id: string;
  fullName: string;
  snils: string;
  stage: keyof typeof DEMO_PROGRESS_MIX;
}

export interface DemoGroup {
  id: string;
  title: string;
  state: DemoGroupState;
  /** Сколько месяцев назад группа началась — отсюда берётся динамика на графиках. */
  startedMonthsAgo: number;
}

export interface DemoDataset {
  tenants: DemoTenant[];
  counterparties: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; title: string; hours: number }>;
  groups: DemoGroup[];
  learners: DemoLearner[];
  documents: Array<{ id: string; learnerId: string; issuedMonthsAgo: number }>;
}

/** Фамилии и имена вымышленные: ни одного реального человека в наборе нет. */
const SURNAMES = [
  'Ветров',
  'Зорин',
  'Лапин',
  'Мирошник',
  'Нефёдов',
  'Осипов',
  'Пряхин',
  'Рогачёв',
  'Сазонов',
  'Тихомиров',
  'Устинов',
  'Филатов'
];
const NAMES = ['Алексей', 'Борис', 'Виктор', 'Геннадий', 'Дмитрий', 'Егор'];
const PATRONYMICS = ['Петрович', 'Сергеевич', 'Иванович', 'Андреевич'];

const COURSE_TITLES = [
  'Охрана труда для руководителей и специалистов',
  'Пожарная безопасность: общие требования',
  'Оказание первой помощи пострадавшим',
  'Работы на высоте, 2 группа',
  'Электробезопасность, III группа до 1000 В'
];

const COUNTERPARTY_NAMES = [
  'ООО «Строймонтаж-Регион»',
  'АО «Северная логистика»',
  'ООО «Пищевой комбинат №4»'
];

/**
 * Собрать набор.
 *
 * Чистая функция без обращений к времени и случайности: `nowMonth` передаётся снаружи, чтобы
 * набор, собранный дважды, совпадал сам с собой. Демонстрация, выглядящая каждый раз по-новому,
 * — это демонстрация, к которой нельзя подготовиться.
 */
export const buildDemoDataset = (): DemoDataset => {
  const tenants: DemoTenant[] = [
    { id: 'tenant_demo', name: 'Учебный центр «Пример»', populated: true },
    /*
     * Второй центр ПУСТ намеренно (Р19): на нём показывают мастер первого запуска. Наполнить
     * его значило бы лишиться самой убедительной части показа — как выглядит начало работы.
     */
    { id: 'tenant_demo_empty', name: 'Учебный центр «Новый»', populated: false }
  ];

  const counterparties = COUNTERPARTY_NAMES.map((name, index) => ({
    id: `cp_demo_${index + 1}`,
    name
  }));

  const courses = COURSE_TITLES.map((title, index) => ({
    id: `course_demo_${index + 1}`,
    title,
    /* Часы разные: одинаковые выглядят как заглушка. */
    hours: [40, 16, 8, 24, 72][index] ?? 16
  }));

  const groups: DemoGroup[] = Array.from({ length: DEMO_DATASET_SHAPE.groups }, (_, index) => {
    const state = DEMO_GROUP_STATES[index % DEMO_GROUP_STATES.length]!;
    return {
      id: `group_demo_${index + 1}`,
      title: `${COURSE_TITLES[index % COURSE_TITLES.length]!.split(':')[0]}, поток ${index + 1}`,
      state,
      /*
       * Разброс по месяцам и даёт динамику на графиках: набор, где всё началось вчера, рисует
       * ту же плоскую линию, что и пустая база.
       */
      startedMonthsAgo: index % DEMO_DATASET_SHAPE.historyMonths
    };
  });

  const stages: Array<keyof typeof DEMO_PROGRESS_MIX> = [];
  for (const [stage, count] of Object.entries(DEMO_PROGRESS_MIX)) {
    for (let i = 0; i < count; i += 1) stages.push(stage as keyof typeof DEMO_PROGRESS_MIX);
  }

  const learners: DemoLearner[] = Array.from(
    { length: DEMO_DATASET_SHAPE.learners },
    (_, index) => ({
      id: `learner_demo_${index + 1}`,
      fullName: `${SURNAMES[index % SURNAMES.length]!} ${NAMES[index % NAMES.length]!} ${PATRONYMICS[
        index % PATRONYMICS.length
      ]!}`,
      snils: demoSnils(index + 1),
      stage: stages[index] ?? 'inProgress'
    })
  );

  /*
   * Документы выдаются только тем, кто сдал, — иначе набор противоречит сам себе: на экране
   * слушатель «не начинал», а удостоверение у него есть.
   */
  const passed = learners.filter((learner) => learner.stage === 'passed');
  const documents = Array.from({ length: DEMO_DATASET_SHAPE.documents }, (_, index) => ({
    id: `doc_demo_${index + 1}`,
    learnerId: (passed[index % passed.length] ?? learners[0]!).id,
    issuedMonthsAgo: index % DEMO_DATASET_SHAPE.historyMonths
  }));

  return { tenants, counterparties, courses, groups, learners, documents };
};

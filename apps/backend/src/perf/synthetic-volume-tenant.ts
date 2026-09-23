/**
 * Синтетический тенант «объём CDOPROF» для спайка производительности (ТЗ перехода с CDOPROF,
 * §15.1 МГ-A3.1; позиция 3 очереди).
 *
 * Зачем синтетика, а не живые данные: ключа API у агента нет (🚫 О1), а решение по Фазе 1
 * («переводить ли хранение на нормализованные таблицы») нужно принимать по замеру, а не по
 * ощущению. Для замера важны ОБЪЁМ и ФОРМА данных, а не их содержание.
 *
 * Три правила генератора:
 *
 *   • **детерминизм** — один `seed` даёт один и тот же набор; замер «до» и «после» Фазы 1
 *     сравним только на одинаковых данных;
 *   • **без ПДн** — ни СНИЛС, ни почты, ни телефона, ни даты рождения. Не из скромности:
 *     слушателей с ОТКРЫТЫМИ ПДн бэкенд помечает к перезаписи при первом чтении, и замер
 *     «сколько стоит показать список» превратился бы в «сколько стоит переписать 14 000
 *     строк». Фамилии — из короткого словаря, они не принадлежат никому;
 *   • **ссылочная целостность** — каждое зачисление указывает на существующие группу и
 *     слушателя, каждая группа — на существующего заказчика; иначе замер ловил бы ошибки
 *     данных вместо задержки.
 *
 * Форма набора — параметры со значением по умолчанию из обследования CDOPROF (§13.4 МГ-K4.1),
 * не константы.
 */
import type {
  Counterparty,
  Course,
  Enrollment,
  EnrollmentStatus,
  GroupCourse,
  GroupEntity,
  Learner
} from '../modules/mvp/mvp.types.js';

export interface SyntheticShape {
  counterparties: number;
  courses: number;
  groups: number;
  learners: number;
  enrollments: number;
}

/** Обследование CDOPROF 23.09.2026: 1 622 контрагента, ~427 курсов, 24 756 групп, 13 755 слушателей. */
export const DEFAULT_SYNTHETIC_SHAPE: SyntheticShape = {
  counterparties: 1622,
  courses: 427,
  groups: 25_000,
  learners: 14_000,
  enrollments: 30_000
};

export interface SyntheticTenant {
  counterparties: Counterparty[];
  courses: Course[];
  groups: GroupEntity[];
  groupCourses: GroupCourse[];
  learners: Learner[];
  enrollments: Enrollment[];
}

export interface RuntimeRow {
  collection: string;
  id: string;
  data: unknown;
}

/** Детерминированный генератор чисел (mulberry32): достаточно для формы данных, не для криптографии. */
const makeRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const LAST_NAMES = [
  'Иванов',
  'Петров',
  'Сидоров',
  'Кузнецов',
  'Смирнов',
  'Попов',
  'Волков',
  'Соколов',
  'Лебедев',
  'Козлов',
  'Новиков',
  'Морозов',
  'Орлов',
  'Егоров',
  'Семёнов'
];
const FIRST_NAMES = ['Иван', 'Пётр', 'Анна', 'Мария', 'Сергей', 'Ольга', 'Николай', 'Елена'];
const MIDDLE_NAMES = ['Иванович', 'Петровна', 'Сергеевич', 'Николаевна', 'Олегович', 'Андреевна'];
const POSITIONS = [
  'Инженер',
  'Мастер',
  'Электромонтёр',
  'Специалист по охране труда',
  'Начальник участка'
];
const COURSE_TOPICS = [
  'Охрана труда',
  'Пожарная безопасность',
  'Работы на высоте',
  'Электробезопасность',
  'Первая помощь',
  'Промышленная безопасность'
];
const ENROLLMENT_STATUSES: ReadonlyArray<[EnrollmentStatus, number]> = [
  ['completed', 0.7],
  ['active', 0.2],
  ['cancelled', 0.1]
];

const START = Date.UTC(2021, 0, 1);
const END = Date.UTC(2026, 8, 1);

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

export const buildSyntheticCdoprofTenant = (
  tenantId: string,
  shape: SyntheticShape = DEFAULT_SYNTHETIC_SHAPE,
  seed = 1
): SyntheticTenant => {
  const random = makeRandom(seed);
  const pick = <T>(items: ReadonlyArray<T>): T => items[Math.floor(random() * items.length)] as T;
  const isoBetween = (): string =>
    new Date(START + Math.floor(random() * (END - START))).toISOString();
  const base = (id: string, createdAt: string) => ({
    id,
    tenantId,
    status: 'active',
    createdAt,
    updatedAt: createdAt
  });

  const counterparties: Counterparty[] = Array.from({ length: shape.counterparties }, (_, i) => {
    const n = i + 1;
    return {
      ...base(`cp_${pad(n, 6)}`, isoBetween()),
      code: `CP-${pad(n, 6)}`,
      name: `ООО «Заказчик ${n}»`,
      legalName: `Общество с ограниченной ответственностью «Заказчик ${n}»`
    };
  });

  const courses: Course[] = Array.from({ length: shape.courses }, (_, i) => {
    const n = i + 1;
    return {
      ...base(`crs_${pad(n, 5)}`, isoBetween()),
      code: `R${1 + (n % 40)}.${String.fromCharCode(1040 + (n % 8))}`,
      title: `${pick(COURSE_TOPICS)}. Программа ${n}`,
      isArchived: random() < 0.15
    };
  });

  const groups: GroupEntity[] = Array.from({ length: shape.groups }, (_, i) => {
    const n = i + 1;
    const createdAt = isoBetween();
    const code = `${createdAt.slice(0, 4)}-${pad(n, 5)}`;
    return {
      ...base(`grp_${pad(n, 6)}`, createdAt),
      code,
      name: `Группа ${code}`,
      counterpartyId: pick(counterparties).id
    };
  });

  const groupCourses: GroupCourse[] = groups.map((group, i) => ({
    ...base(`gc_${pad(i + 1, 6)}`, group.createdAt),
    groupId: group.id,
    courseId: pick(courses).id,
    sortOrder: 0,
    durationDays: 30
  }));

  const learners: Learner[] = Array.from({ length: shape.learners }, (_, i) => {
    const n = i + 1;
    return {
      ...base(`lrn_${pad(n, 6)}`, isoBetween()),
      learnerNo: pad(n, 9),
      lastName: pick(LAST_NAMES),
      firstName: pick(FIRST_NAMES),
      middleName: pick(MIDDLE_NAMES),
      position: pick(POSITIONS),
      organizationUnitId: pick(counterparties).id
    };
  });

  const pickStatus = (): EnrollmentStatus => {
    const roll = random();
    let acc = 0;
    for (const [status, weight] of ENROLLMENT_STATUSES) {
      acc += weight;
      if (roll < acc) return status;
    }
    return 'completed';
  };

  const enrollments: Enrollment[] = Array.from({ length: shape.enrollments }, (_, i) => {
    const group = pick(groups);
    const status = pickStatus();
    return {
      ...base(`enr_${pad(i + 1, 6)}`, group.createdAt),
      groupId: group.id,
      learnerId: pick(learners).id,
      status,
      enrolledAt: group.createdAt,
      ...(status === 'completed' ? { completedAt: group.createdAt } : {})
    };
  });

  return { counterparties, courses, groups, groupCourses, learners, enrollments };
};

/** Строки для `learning.mvp_runtime_documents`: имена коллекций — как в `mvp-collections.ts`. */
export const toRuntimeRows = (tenant: SyntheticTenant): RuntimeRow[] => {
  const rows: RuntimeRow[] = [];
  const push = (collection: keyof SyntheticTenant) => {
    for (const item of tenant[collection]) rows.push({ collection, id: item.id, data: item });
  };
  push('counterparties');
  push('courses');
  push('groups');
  push('groupCourses');
  push('learners');
  push('enrollments');
  return rows;
};

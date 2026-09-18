import { getNavigationView } from './helpers';
import { resolveRoleHome } from './role-home';

import type { UserSession } from '../../entities/session/model';

/**
 * `GOAL-2` · «кликов до частой задачи: 4–5 → ≤3».
 *
 * Цель формулировалась словами, а слова не считаются. Здесь она превращается в данные:
 * у каждой роли есть пять частых задач (`roleBlueprints.topJobs` — это ТЗ §3.1), и для
 * каждой указано, **куда человек идёт** и **сколько шагов делает уже внутри экрана**.
 *
 * Почему не «просто маршрут». Половина частых задач заканчивается не переходом, а
 * действием: «Зачислить слушателя в группу» — это реестр групп, потом карточка нужной
 * группы, потом кнопка зачисления. Если считать только адрес, получится единица, и
 * метрика будет врать в приятную сторону.
 */

/** Куда ведёт частая задача и сколько шагов делается уже на экране. */
export interface TopJobRoute {
  /** Адрес раздела, с которого начинается работа. */
  href: string;
  /**
   * Шаги внутри раздела: выбор строки в реестре, нажатие первичного действия. Ноль —
   * задача решается самим экраном (обзор, очередь проверки).
   */
  stepsInside: number;
}

/**
 * Частая задача → путь. Ключ — ровно та формулировка, что стоит в `topJobs`: сторож
 * сверяет списки на равенство, поэтому переименованная задача без пути не проедет.
 */
export const TOP_JOB_ROUTES: Record<string, TopJobRoute> = {
  // Администратор платформы
  'Проверить здоровье арендаторов': { href: '/workspace', stepsInside: 0 },
  'Завести или приостановить центр': { href: '/platform/tenants', stepsInside: 1 },
  'Разобрать очередь и сбои': { href: '/admin/operations', stepsInside: 0 },
  'Проверить лицензии и оплату': { href: '/admin/licenses', stepsInside: 0 },
  'Поднять журнал действий': { href: '/audit', stepsInside: 0 },

  // Администратор центра
  'Увидеть, что горит сегодня': { href: '/workspace', stepsInside: 0 },
  // Реестр групп → карточка группы → «Зачислить слушателя».
  'Зачислить слушателя в группу': { href: '/groups', stepsInside: 2 },
  // Та же карточка: «Закрыть группу» — первичное действие экрана.
  'Закрыть группу и выдать документы': { href: '/groups', stepsInside: 2 },
  'Выгрузить реестр в надзор': { href: '/gov-export', stepsInside: 1 },
  'Найти слушателя и ответить по нему': { href: '/learners', stepsInside: 1 },

  // Менеджер
  'Собрать группу под заказчика': { href: '/groups', stepsInside: 1 },
  'Выдать документы группе': { href: '/documents', stepsInside: 1 },
  'Ответить заказчику по прогрессу': { href: '/admin/clients', stepsInside: 1 },
  'Выгрузить отчёт': { href: '/reports', stepsInside: 1 },

  // Методист
  'Собрать программу курса': { href: '/courses', stepsInside: 1 },
  'Обновить материалы и версии': { href: '/materials', stepsInside: 1 },
  'Собрать тест и задания': { href: '/assessment', stepsInside: 1 },
  'Передать курс на публикацию': { href: '/courses', stepsInside: 2 },
  'Найти пробелы в программах': { href: '/methodist', stepsInside: 0 },

  // Преподаватель
  'Проверить работы в очереди': { href: '/teacher/review', stepsInside: 0 },
  'Посмотреть прогресс группы': { href: '/groups', stepsInside: 1 },
  'Ответить слушателям': { href: '/notifications', stepsInside: 1 },
  'Спланировать занятия': { href: '/learning/calendar', stepsInside: 0 },
  'Открыть материалы курса': { href: '/courses', stepsInside: 1 },

  // Слушатель
  'Продолжить обучение с последнего места': { href: '/learner', stepsInside: 1 },
  'Сдать тест или задание': { href: '/learner/tests', stepsInside: 1 },
  'Проверить сроки': { href: '/learner', stepsInside: 0 },
  'Забрать документы об обучении': { href: '/learner/documents', stepsInside: 1 },
  'Прочитать сообщения от учебного центра': { href: '/notifications', stepsInside: 1 }
  /*
   * «Написать преподавателю» снята вместе с чатом (решение владельца Р3, ТЗ 5.12.6).
   * Задача вернётся в фазе 11 вместе с обращением в учебный центр, которое уходит письмом
   * администратору: держать в списке частых задач ту, у которой нет рабочего пути, —
   * значит обещать человеку несуществующее (журнал 482).
   */
};

/** Столько кликов не бывает: адрес не достижим из меню этой роли. */
export const UNREACHABLE = Number.POSITIVE_INFINITY;

/**
 * Сколько кликов от домашнего экрана роли до адреса.
 *
 * 0 — это и есть домашний экран; 1 — пункт короткого меню роли; 2 — пункт внутри группы
 * (сначала раскрыть группу, потом выбрать) или дочерний раздел пункта меню.
 */
export const clicksToRoute = (session: UserSession, href: string): number => {
  const home = resolveRoleHome(session);
  if (href === home) return 0;

  const view = getNavigationView(session);
  if (view.main.some((item) => item.href === href)) return 1;
  if (view.more.some((item) => item.href === href)) return 2;

  // Дочерний адрес: `/groups/123` достижим через `/groups`. Берём самого длинного
  // родителя — иначе `/learner` перехватил бы всё, что начинается на `/learner/`.
  const parents = [...view.main, ...view.more]
    .filter((item) => item.href !== '/' && href.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length);

  const parent = parents[0];
  if (!parent) return UNREACHABLE;
  return clicksToRoute(session, parent.href) + 1;
};

/** Кликов до частой задачи: дорога до раздела плюс шаги внутри него. */
export const clicksToJob = (session: UserSession, job: string): number => {
  const route = TOP_JOB_ROUTES[job];
  if (!route) return UNREACHABLE;
  const toRoute = clicksToRoute(session, route.href);
  if (toRoute === UNREACHABLE) return UNREACHABLE;
  return toRoute + route.stepsInside;
};

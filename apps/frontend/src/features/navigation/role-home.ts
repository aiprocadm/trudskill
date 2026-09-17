import { evaluateRouteAccess } from './helpers';
import { normalizeRoleCode } from './role-code';

import type { UserSession } from '../../entities/session/model';

/**
 * ФТ-H2 (Фаза 5 Task 1): куда человек попадает сразу после входа.
 *
 * **Зачем это вообще понадобилось.** Настоящие дашборды в системе уже написаны —
 * кабинет слушателя (`/learner`) и attention center администратора (`/workspace`)
 * тянут живые данные. Но корневая страница о них не знала и показывала витрину
 * из плиток-ссылок: то есть вход уводил ОТ работающего дашборда к оглавлению.
 * Слушателя она перенаправляла (это было зашито прямо в компонент), остальные роли —
 * нет, а `manager` и `counterparty_rep` вдобавок не имели ни одной плитки и видели
 * пустую страницу с надписью «Роль не определена».
 *
 * **Почему таблица, а не ветвление в компоненте.** Маршрут роли — это данные: их
 * можно проверить тестом, перечислить в обзоре и поменять, не трогая разметку.
 * Ветвление `if (roles.has(...)) router.replace(...)` в JSX разрастается с каждой
 * новой ролью и незаметно расходится с правами.
 */

/*
 * Синонимы ролей живут в листе `role-code.ts` — одной таблицей на маршруты, чертежи и словарь
 * имён (ТЗ 4.1). Реэкспорт оставлен: вызывающие берут `normalizeRoleCode` отсюда.
 */

export { normalizeRoleCode };

/**
 * Домашний маршрут роли. **Порядок = приоритет**, когда ролей у человека несколько.
 *
 * Слушатель стоит первым намеренно: так вело себя перенаправление ДО этой правки, и
 * менять точку приземления у тех, кто одновременно учится и администрирует, в рамках
 * задачи «довести перенаправление до остальных ролей» было бы отдельным решением.
 * Если понадобится отдавать приоритет рабочей роли — меняется порядок этого списка,
 * и больше ничего.
 */
export const ROLE_HOME_ROUTES: ReadonlyArray<{ role: string; href: string }> = [
  { role: 'learner', href: '/learner' },
  { role: 'counterparty_rep', href: '/counterparty-portal' },
  { role: 'tenant_admin', href: '/workspace' },
  { role: 'platform_admin', href: '/workspace' },
  // Фаза 5 Task 2: у методиста появилась своя сводка — ведём на неё, а не на список
  // курсов. У менеджера дашборда нет, поэтому он идёт в основной рабочий раздел.
  { role: 'methodist', href: '/methodist' },
  { role: 'manager', href: '/groups' }
];

/**
 * Куда вести сессию. `null` — вести некуда, показывается витрина-запасной вариант.
 *
 * Доступность маршрута проверяется теми же правилами, что и обычная навигация:
 * права роли могли измениться миграцией, и перенаправление на закрытую страницу
 * выбросило бы человека на «доступ запрещён» сразу после успешного входа —
 * то есть выглядело бы как поломка входа.
 */
export const resolveRoleHome = (
  session: UserSession | null,
  canAccess: (href: string) => boolean = (href) => evaluateRouteAccess(href, session).kind === 'ok'
): string | null => {
  if (!session) return null;
  const roles = new Set((session.roles ?? []).map(normalizeRoleCode));
  for (const entry of ROLE_HOME_ROUTES) {
    if (!roles.has(entry.role)) continue;
    if (!canAccess(entry.href)) continue;
    return entry.href;
  }
  return null;
};

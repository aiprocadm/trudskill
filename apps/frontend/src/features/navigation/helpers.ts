import { type RouteMeta, navigationModel, routeMeta } from './model';
import { getSessionRoleBlueprints } from './role-blueprints';
import { hasPermission } from '../../lib/rbac/permissions';

import type { UserSession } from '../../entities/session/model';

const normalizePath = (path: string) => {
  const withoutQuery = path.split('?')[0] ?? '/';
  if (withoutQuery === '/') return '/';
  return withoutQuery.replace(/\/+$/, '') || '/';
};

/*
 * Ревизия 2026-08-26. Сопоставление шло по СТРОКЕ, а в реестре есть шаблоны с подстановкой:
 * `/admin/tests/[id]`, `/learner/tests/[testId]/attempt/[attemptId]`. Реальный путь выглядит
 * как `/learner/tests/tst_71c/attempt/att_3` — с литеральными скобками он не совпадал НИКОГДА,
 * и такие правила просто не работали: доступ решало более общее правило раздела.
 *
 * Для семи записей это ничего не меняло (право то же, что у раздела), а для трёх меняло:
 * прохождение теста, просмотр результата и сдача работы объявлены строже, чем сам раздел.
 * Методист, у которого есть чтение тестов, но нет `assessment.attempts.take` (сверено по
 * `iam.role_permissions` живой базы), открывал экран прохождения чужого теста. Данные он
 * оттуда не получал — ручки требуют своё право, — но вместо честного «нет доступа» видел
 * экран и ошибку в нём.
 *
 * Теперь сегмент `[что-угодно]` совпадает с любым непустым сегментом пути. Префиксное
 * поведение сохранено: шаблон короче пути по-прежнему покрывает всё, что ниже.
 */
const isPatternMatch = (path: string, pattern: string) => {
  if (path === pattern) return true;
  if (pattern === '/') return false;
  if (!pattern.includes('[')) return path.startsWith(`${pattern}/`);

  const pathSegments = path.split('/').filter(Boolean);
  const patternSegments = pattern.split('/').filter(Boolean);
  if (pathSegments.length < patternSegments.length) return false;
  return patternSegments.every((segment, index) =>
    segment.startsWith('[') && segment.endsWith(']')
      ? Boolean(pathSegments[index])
      : segment === pathSegments[index]
  );
};

export const resolveRouteMeta = (path: string): RouteMeta | null => {
  const normalized = normalizePath(path);
  const matched = routeMeta.find((entry) => isPatternMatch(normalized, entry.pattern));
  return matched?.meta ?? null;
};

export const getVisibleNavigation = (session: UserSession | null) => {
  if (!session) return [];
  return navigationModel.filter((item) =>
    hasPermission(session.permissions, item.requiredPermissions)
  );
};

/** Кабинет слушателя: «Моё обучение», «Мои тесты», «Мои документы» — разделы «за себя». */
const isLearnerCabinet = (href: string) => href === '/learner' || href.startsWith('/learner/');

/** Пункты без адресата — общие для любой роли. */
const SHARED_NAV = new Set(['/notifications', '/chat', '/learning/calendar']);

/*
 * Журнал 344, 345. Права у сотрудника и слушателя пересекаются (`courses.read`,
 * `assessment.tests.read` есть у обоих по 0038), поэтому «видно по правам» — ещё не «своё»:
 * менеджеру по правам виден весь кабинет слушателя, и им добивалось его главное меню;
 * слушателю по правам видны «Курсы», «Тесты», «Задания» сотрудников — дубли его кабинета
 * в чужой терминологии, а «Обучение: сводка» отвечала ему отказом. Меню собирается для
 * адресата: сотруднику — разделы сотрудника, слушателю — его кабинет, общее — всем.
 * Адресат — по чертежам ролей сессии; без чертежа (представитель заказчика, незнакомая
 * роль) фильтра нет — показывается всё, что открыто правами. Права это не трогает:
 * палитра (`getVisibleNavigation`) и доступ по адресу (`evaluateRouteAccess`) — как были.
 */
const forAudience = (
  items: ReturnType<typeof getVisibleNavigation>,
  session: UserSession | null
) => {
  const blueprints = getSessionRoleBlueprints(session);
  if (!blueprints.length) return items;
  const asLearner = blueprints.some((item) => item.role === 'learner');
  const asStaff = blueprints.some((item) => item.role !== 'learner');
  return items.filter(
    (item) => SHARED_NAV.has(item.href) || (isLearnerCabinet(item.href) ? asLearner : asStaff)
  );
};

export const getNavigationView = (session: UserSession | null) => {
  const visible = forAudience(getVisibleNavigation(session), session);
  const baseMain = visible.filter((item) => item.navSlot !== 'more');
  const baseMore = visible.filter((item) => item.navSlot === 'more');
  const roleOrder = getSessionRoleBlueprints(session).flatMap((item) => item.primaryNav);

  if (!roleOrder.length) {
    return { main: baseMain.slice(0, 7), more: baseMore };
  }

  const byHref = new Map(visible.map((item) => [item.href, item]));
  const roleMain = roleOrder
    .map((href) => byHref.get(href))
    .filter((item): item is (typeof visible)[number] => Boolean(item));
  const roleSet = new Set(roleMain.map((item) => item.href));
  const extraMain = baseMain.filter((item) => !roleSet.has(item.href));
  const fullMain = [...roleMain, ...extraMain].slice(0, 7);
  const fullMainSet = new Set(fullMain.map((item) => item.href));
  const fullMore = visible.filter((item) => !fullMainSet.has(item.href));

  return { main: fullMain, more: fullMore };
};

export const evaluateRouteAccess = (
  path: string,
  session: UserSession | null
): { kind: 'ok' | 'redirect-login' | 'forbidden' | 'not-found' } => {
  const meta = resolveRouteMeta(path);
  if (!meta) return { kind: 'not-found' };
  if (meta.public) return { kind: 'ok' };
  if (!session) return { kind: 'redirect-login' };
  if (!hasPermission(session.permissions, meta.requiredPermissions)) return { kind: 'forbidden' };
  return { kind: 'ok' };
};

/**
 * Какой пункт меню считать активным для текущего адреса (ТЗ 2.2, пункт 3).
 *
 * Было: пункт подсвечивался, если адрес НАЧИНАЕТСЯ с его ссылки. На вложенных адресах это
 * зажигало сразу два пункта — на «Моих курсах» горели и «Мой кабинет», и «Мои курсы». Таких
 * вложенных пар в меню девять, то есть весь кабинет слушателя и настройки центра. Человек
 * видел два «вы здесь» одновременно и переставал верить подсветке вообще.
 *
 * Стало: подходящих пунктов может быть несколько, активным становится САМЫЙ ТОЧНЫЙ — самая
 * длинная подходящая ссылка. Вложенная страница без своего пункта (карточка курса) по-прежнему
 * подсвечивает родителя: человеку важно видеть, что он «в Курсах».
 */
export const activeNavHref = (pathname: string, hrefs: readonly string[]): string | null => {
  const matching = hrefs.filter((href) => pathname === href || pathname.startsWith(`${href}/`));
  if (matching.length === 0) return null;
  return matching.reduce((longest, href) => (href.length > longest.length ? href : longest));
};

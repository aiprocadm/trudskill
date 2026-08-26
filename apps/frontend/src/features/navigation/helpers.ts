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

export const getNavigationView = (session: UserSession | null) => {
  const visible = getVisibleNavigation(session);
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

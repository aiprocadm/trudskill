import { type RouteMeta, navigationModel, routeMeta } from './model';
import { getSessionRoleBlueprints } from './role-blueprints';
import { hasPermission } from '../../lib/rbac/permissions';

import type { UserSession } from '../../entities/session/model';

const normalizePath = (path: string) => {
  const withoutQuery = path.split('?')[0] ?? '/';
  if (withoutQuery === '/') return '/';
  return withoutQuery.replace(/\/+$/, '') || '/';
};

const isPatternMatch = (path: string, pattern: string) =>
  path === pattern || (pattern !== '/' && path.startsWith(`${pattern}/`));

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

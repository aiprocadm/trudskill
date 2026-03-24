import { hasPermission } from '../../lib/rbac/permissions';
import type { UserSession } from '../../entities/session/model';
import { navigationModel, routeMeta, type RouteMeta } from './model';

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
  return navigationModel.filter((item) => hasPermission(session.permissions, item.requiredPermissions));
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

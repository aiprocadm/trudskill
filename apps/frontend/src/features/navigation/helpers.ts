import { hasPermission } from '../../lib/rbac/permissions';
import type { UserSession } from '../../entities/session/model';
import { navigationModel, routeMeta } from './model';

export const getVisibleNavigation = (session: UserSession | null) => {
  if (!session) return [];
  return navigationModel.filter((item) => hasPermission(session.permissions, item.requiredPermissions));
};

export const evaluateRouteAccess = (
  path: string,
  session: UserSession | null
): { kind: 'ok' | 'redirect-login' | 'forbidden' | 'not-found' } => {
  const meta = routeMeta[path];
  if (!meta) return { kind: 'not-found' };
  if (meta.public) return { kind: 'ok' };
  if (!session) return { kind: 'redirect-login' };
  if (!hasPermission(session.permissions, meta.requiredPermissions)) return { kind: 'forbidden' };
  return { kind: 'ok' };
};

import type { UserSession } from '../../entities/session/model';
import { ApiClientError } from '../api/client';
import { authApi } from './auth-api';
import { resolveRolePermissions } from './permission-map';
import { sessionStore } from './session-store';

const loginToUserIdMap: Record<string, string> = {
  platform_admin: 'u_platform_admin',
  tenant_admin: 'u_tenant_admin',
  manager: 'u_manager',
  methodist: 'u_methodist',
  blocked_user: 'u_blocked'
};

const resolveUserId = (login: string, fallback?: string) => loginToUserIdMap[login] ?? fallback ?? '';

const hydrateSession = async (userId: string, tokens: UserSession['tokens']): Promise<UserSession> => {
  const [user, roles] = await Promise.all([authApi.me(userId), authApi.userRoles(userId)]);
  const roleCodes = roles.map((item) => item.code);
  return { user, tokens, roles: roleCodes, permissions: resolveRolePermissions(roleCodes) };
};

export const sessionManager = {
  getCurrentSession: () => sessionStore.get(),
  async login(login: string, password: string): Promise<UserSession> {
    const tokens = await authApi.login({ login, password });
    const userId = resolveUserId(login);
    const session = await hydrateSession(userId, tokens);
    sessionStore.set(session);
    return session;
  },
  async bootstrap(): Promise<UserSession | null> {
    const existing = sessionStore.get();
    if (!existing) return null;
    try {
      const session = await hydrateSession(existing.user.id, existing.tokens);
      sessionStore.set(session);
      return session;
    } catch (error) {
      if (error instanceof ApiClientError && error.normalized.isAuthError) {
        return this.tryRefresh(existing);
      }
      throw error;
    }
  },
  async tryRefresh(existing?: UserSession): Promise<UserSession | null> {
    const session = existing ?? sessionStore.get();
    if (!session) return null;
    try {
      const tokens = await authApi.refresh({ refreshToken: session.tokens.refreshToken }, session.user.id);
      const refreshed = await hydrateSession(session.user.id, tokens);
      sessionStore.set(refreshed);
      return refreshed;
    } catch {
      this.clear();
      return null;
    }
  },
  async logout(): Promise<void> {
    const session = sessionStore.get();
    if (!session) return;
    try {
      await authApi.logout({ sessionId: session.tokens.sessionId }, session.user.id);
    } finally {
      this.clear();
    }
  },
  clear() {
    sessionStore.clear();
  }
};

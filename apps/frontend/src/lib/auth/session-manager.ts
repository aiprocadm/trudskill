import { authApi } from './auth-api';
import { resolveRolePermissions } from './permission-map';
import { sessionStore } from './session-store';

import type { UserSession } from '../../entities/session/model';

const hydrateSession = async (tokens: UserSession['tokens']): Promise<UserSession> => {
  const user = await authApi.me(tokens.accessToken);
  const roles = await authApi.userRoles(user.id, tokens.accessToken);
  const roleCodes = roles.map((item) => item.code);
  return { user, tokens, roles: roleCodes, permissions: resolveRolePermissions(roleCodes) };
};

export const sessionManager = {
  getCurrentSession: () => sessionStore.get(),
  async login(login: string, password: string): Promise<UserSession> {
    const tokens = await authApi.login({ login, password });
    const session = await hydrateSession(tokens);
    sessionStore.set(session);
    return session;
  },
  async bootstrap(): Promise<UserSession | null> {
    sessionStore.hydrateFromStorage();
    return this.tryRefresh();
  },
  async tryRefresh(): Promise<UserSession | null> {
    try {
      const tokens = await authApi.refresh();
      const refreshed = await hydrateSession(tokens);
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
      await authApi.logout({ sessionId: session.tokens.sessionId }, session.tokens.accessToken);
    } finally {
      this.clear();
    }
  },
  clear() {
    sessionStore.clear();
  }
};

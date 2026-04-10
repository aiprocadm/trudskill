'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { sessionManager } from '../../lib/auth/session-manager';

import type { UserSession } from '../../entities/session/model';
import type { PropsWithChildren } from 'react';

interface AuthContextValue {
  session: UserSession | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<UserSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<UserSession | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sessionManager
      .bootstrap()
      .then((nextSession) => setSession(nextSession))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      login: async (login, password) => {
        const nextSession = await sessionManager.login(login, password);
        setSession(nextSession);
        return nextSession;
      },
      logout: async () => {
        await sessionManager.logout();
        setSession(null);
      },
      refresh: async () => {
        const refreshed = await sessionManager.tryRefresh();
        setSession(refreshed);
        return refreshed;
      }
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};

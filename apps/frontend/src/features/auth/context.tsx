'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { sessionManager } from '../../lib/auth/session-manager';

import type { UserSession } from '../../entities/session/model';
import type { TotpChallengeResponse } from '../../lib/auth/auth-api';
import type { PropsWithChildren } from 'react';

interface AuthContextValue {
  session: UserSession | null;
  loading: boolean;
  /** Возвращает сессию либо 2FA-challenge (тогда сессии ещё нет — нужен verifyTotp). */
  login: (login: string, password: string) => Promise<UserSession | TotpChallengeResponse>;
  loginWithMagicLink: (token: string) => Promise<UserSession | TotpChallengeResponse>;
  verifyTotp: (challengeToken: string, code: string) => Promise<UserSession>;
  /** ФТ-D2.2 (срез 3): сделать текущей сессию, выданную входом «от имени». */
  adoptSession: (session: UserSession) => void;
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
        const outcome = await sessionManager.login(login, password);
        if (!('totpRequired' in outcome)) {
          setSession(outcome);
        }
        return outcome;
      },
      loginWithMagicLink: async (token) => {
        const outcome = await sessionManager.loginWithMagicLink(token);
        if (!('totpRequired' in outcome)) {
          setSession(outcome);
        }
        return outcome;
      },
      verifyTotp: async (challengeToken, code) => {
        const nextSession = await sessionManager.verifyTotp(challengeToken, code);
        setSession(nextSession);
        return nextSession;
      },
      adoptSession: (nextSession) => {
        sessionManager.adopt(nextSession);
        setSession(nextSession);
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

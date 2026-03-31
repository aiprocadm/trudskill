import type { UserSession } from '../../entities/session/model';

const KEY = 'cdoprof.session.v1';
type PersistedSession = Omit<UserSession, 'tokens'>;

let memorySession: UserSession | null = null;

const toPersistedSession = (session: UserSession): PersistedSession => {
  const { tokens: _tokens, ...rest } = session;
  return rest;
};

const stripLegacyTokens = (value: unknown): PersistedSession | null => {
  if (!value || typeof value !== 'object') return null;
  const session = value as Partial<UserSession>;
  const { tokens: _tokens, ...rest } = session;
  return rest as PersistedSession;
};

export const sessionStore = {
  get(): UserSession | null {
    return memorySession;
  },
  set(session: UserSession) {
    memorySession = session;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, JSON.stringify(toPersistedSession(session)));
  },
  clear() {
    memorySession = null;
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(KEY);
  },
  hydrateFromStorage() {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const persisted = stripLegacyTokens(JSON.parse(raw));
      if (!persisted) {
        window.localStorage.removeItem(KEY);
        return null;
      }
      window.localStorage.setItem(KEY, JSON.stringify(persisted));
      return persisted;
    } catch {
      window.localStorage.removeItem(KEY);
      return null;
    }
  }
};

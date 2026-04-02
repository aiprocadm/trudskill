import type { UserSession } from '../../entities/session/model';

const KEY = 'cdoprof.session.v1';

type PersistedSession = UserSession;

let memorySession: UserSession | null = null;

const toPersistedSession = (session: UserSession): PersistedSession => session;

const parsePersistedSession = (value: unknown): PersistedSession | null => {
  if (!value || typeof value !== 'object') return null;
  const session = value as Partial<UserSession>;
  if (!session.user || !session.tokens || !session.roles || !session.permissions) return null;
  if (!session.tokens.accessToken || !session.tokens.refreshToken || !session.tokens.sessionId) return null;
  return session as PersistedSession;
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
      const persisted = parsePersistedSession(JSON.parse(raw));
      if (!persisted) {
        window.localStorage.removeItem(KEY);
        return null;
      }
      return persisted;
    } catch {
      window.localStorage.removeItem(KEY);
      return null;
    }
  }
};

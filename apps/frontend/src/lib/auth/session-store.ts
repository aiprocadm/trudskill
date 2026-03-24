import type { UserSession } from '../../entities/session/model';

const KEY = 'cdoprof.session.v1';

export const sessionStore = {
  get(): UserSession | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserSession;
    } catch {
      return null;
    }
  },
  set(session: UserSession) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, JSON.stringify(session));
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(KEY);
  }
};

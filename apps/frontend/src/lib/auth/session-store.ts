import type { UserSession } from '../../entities/session/model';

/*
 * BR-020/BR-021 — ВЫКАТКА N+1: окно двойного чтения закрыто.
 *
 * Ключ содержит номер версии значения (`.v1`) — версия не сбрасывалась, менялся только
 * префикс бренда. Прежнее имя (`cdoprof.session.v1`) больше не читается и не пишется: у
 * тех, кто заходил за время окна, снимок уже переехал (запись = миграция), у остальных
 * он просто не поднимется — человек увидит форму входа.
 *
 * Читать снимок из ключа, который мы считаем удалённым, было бы худшим из вариантов: там
 * ФИО, логин, почта, роли и полный список прав.
 */
const KEY = 'trudskill.session.v1';

type PersistedSession = Omit<UserSession, 'tokens'>;

let memorySession: UserSession | null = null;

/**
 * Кто хочет знать о смене сессии (журнал 350).
 *
 * Хранилище узнаёт о смерти сессии первым — например, когда обновление по cookie не удалось
 * после 401. Экран же держит сессию в состоянии React и до появления подписки узнавал о ней
 * только при перезагрузке страницы: человек оставался на закрытом экране и на каждое
 * действие получал «Войдите заново», никуда при этом не переходя.
 */
type SessionListener = (session: UserSession | null) => void;
const listeners = new Set<SessionListener>();

const notify = (session: UserSession | null): void => {
  for (const listener of [...listeners]) {
    try {
      listener(session);
    } catch {
      // Один упавший подписчик не отменяет вестей остальным: сессия важнее их ошибок.
    }
  }
};

const toPersistedSession = (session: UserSession): PersistedSession => ({
  user: session.user,
  roles: session.roles,
  permissions: session.permissions
});

const parsePersistedSession = (value: unknown): PersistedSession | null => {
  if (!value || typeof value !== 'object') return null;
  const session = value as Partial<UserSession>;
  if (!session.user || !session.roles || !session.permissions) return null;
  return session as PersistedSession;
};

/*
 * Обращение к localStorage бросает в приватных режимах некоторых браузеров, и тогда
 * падал бы весь запуск приложения. Соседние хранилища (подсказка меню, черновик курса)
 * давно защищены — здесь защиты не было, а двойное чтение удваивает число обращений.
 */
const storage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const safeRemove = (store: Storage, key: string): void => {
  try {
    store.removeItem(key);
  } catch {
    /* приватный режим — молча, это не повод ронять выход */
  }
};

export const sessionStore = {
  get(): UserSession | null {
    return memorySession;
  },
  /** Подписаться на смену сессии; возвращает отписку. */
  subscribe(listener: SessionListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(session: UserSession) {
    memorySession = session;
    notify(session);
    const store = storage();
    if (!store) return;
    try {
      store.setItem(KEY, JSON.stringify(toPersistedSession(session)));
    } catch {
      return;
    }
  },
  clear() {
    memorySession = null;
    notify(null);
    const store = storage();
    if (!store) return;
    safeRemove(store, KEY);
  },
  hydrateFromStorage(): PersistedSession | null {
    const store = storage();
    if (!store) return null;
    let raw: string | null = null;
    try {
      raw = store.getItem(KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const persisted = parsePersistedSession(JSON.parse(raw));
      if (!persisted) {
        safeRemove(store, KEY);
        return null;
      }
      return persisted;
    } catch {
      safeRemove(store, KEY);
      return null;
    }
  }
};

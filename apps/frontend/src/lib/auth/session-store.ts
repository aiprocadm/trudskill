import type { UserSession } from '../../entities/session/model';

/*
 * BR-020/BR-021 — ВЫКАТКА N периода двойного чтения (60 дней).
 *
 * Ключ уже содержит номер версии значения (`.v1`) — версия НЕ сбрасывается, меняется
 * только префикс бренда. Читаем новый ключ → при отсутствии старый; пишем всегда новый;
 * при выходе чистим ОБА (иначе снимок сессии останется под старым ключом и восстановится
 * при следующем заходе — «Выйти» не выйдет).
 *
 * Выкатка N+1 (через 60 дней, отдельный PR): убрать LEGACY_KEY и чтение старого,
 * старые значения дочистить при первом заходе.
 */
const KEY = 'trudskill.session.v1';
const LEGACY_KEY = 'cdoprof.session.v1';

type PersistedSession = Omit<UserSession, 'tokens'>;

let memorySession: UserSession | null = null;

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
  set(session: UserSession) {
    memorySession = session;
    const store = storage();
    if (!store) return;
    try {
      store.setItem(KEY, JSON.stringify(toPersistedSession(session)));
    } catch {
      return;
    }
    /*
     * Запись — это и есть миграция: снимок переехал под новый ключ, прежний больше
     * не нужен. Без этой строки под старым ключом бессрочно оставались бы ФИО, логин,
     * почта, роли и полный список прав — на общем компьютере учебного класса это
     * прямая утечка персональных данных (ФТ-H6).
     */
    safeRemove(store, LEGACY_KEY);
  },
  clear() {
    memorySession = null;
    const store = storage();
    if (!store) return;
    safeRemove(store, KEY);
    safeRemove(store, LEGACY_KEY);
  },
  hydrateFromStorage(): PersistedSession | null {
    const store = storage();
    if (!store) return null;
    let raw: string | null = null;
    let usedKey = KEY;
    try {
      // Новый ключ, при его отсутствии — прежний (период двойного чтения).
      raw = store.getItem(KEY);
      if (raw === null) {
        usedKey = LEGACY_KEY;
        raw = store.getItem(LEGACY_KEY);
      }
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const persisted = parsePersistedSession(JSON.parse(raw));
      if (!persisted) {
        safeRemove(store, usedKey);
        return null;
      }
      return persisted;
    } catch {
      safeRemove(store, usedKey);
      return null;
    }
  }
};

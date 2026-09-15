import { authApi } from './auth-api';
import { sessionStore } from './session-store';
import { setSessionAuth, setSessionRecovery } from '../api/client';

import type { TotpChallengeResponse } from './auth-api';
import type { UserSession } from '../../entities/session/model';

const hydrateSession = async (tokens: UserSession['tokens']): Promise<UserSession> => {
  // §5.160: permissions come from the backend (/auth/me, resolved from iam.role_permissions) —
  // the SSOT. We no longer derive them client-side from a static map that drifted out of sync.
  const user = await authApi.me(tokens.accessToken);
  const roles = await authApi.userRoles(user.id, tokens.accessToken);
  const roleCodes = roles.map((item) => item.code);
  return { user, tokens, roles: roleCodes, permissions: user.permissions };
};

/** Идущее обновление сессии: один запрос на всех, кто получил 401 разом. */
let inFlightRecovery: Promise<string | null> | null = null;

/**
 * Выход прошёл на устройстве, но сервер отзыв не подтвердил.
 *
 * Отдельный класс, а не просто проброс, чтобы экран мог отличить «выйти не удалось вовсе»
 * от «вышли здесь, но сеанс на сервере может быть ещё жив» — это разные сообщения человеку.
 */
export class LogoutNotConfirmedError extends Error {
  constructor(readonly cause: unknown) {
    super(
      'Выход выполнен на этом устройстве, но сервер не подтвердил завершение сеанса. ' +
        'Если вы за чужим компьютером, завершите сеанс вручную в разделе «Люди и доступ» ' +
        'или попросите об этом администратора.'
    );
    this.name = 'LogoutNotConfirmedError';
  }
}

export const sessionManager = {
  getCurrentSession: () => sessionStore.get(),
  async login(login: string, password: string): Promise<UserSession | TotpChallengeResponse> {
    const tokens = await authApi.login({ login, password });
    if ('totpRequired' in tokens) {
      return tokens;
    }
    const session = await hydrateSession(tokens);
    sessionStore.set(session);
    return session;
  },
  async loginWithMagicLink(token: string): Promise<UserSession | TotpChallengeResponse> {
    const tokens = await authApi.magicLinkRedeem({ token });
    if ('totpRequired' in tokens) {
      return tokens;
    }
    const session = await hydrateSession(tokens);
    sessionStore.set(session);
    return session;
  },
  /**
   * ФТ-D2.2 (срез 3): принять уже собранную сессию (вход «от имени» из платформенной
   * админки). Токены выданы сервером impersonate-ручкой, refresh-cookie уже стоит —
   * остаётся сделать сессию текущей, как это делает login.
   */
  adopt(session: UserSession): UserSession {
    sessionStore.set(session);
    return session;
  },
  /** Второй шаг 2FA-логина: challenge из login/redeem + код из приложения. */
  async verifyTotp(challengeToken: string, code: string): Promise<UserSession> {
    const tokens = await authApi.verifyTotp({ challengeToken, code });
    const session = await hydrateSession(tokens);
    sessionStore.set(session);
    return session;
  },
  async bootstrap(): Promise<UserSession | null> {
    sessionStore.hydrateFromStorage();
    return this.tryRefresh();
  },
  /*
   * Журнал 350. Обновление сессии, запрошенное клиентом после 401, — ОДНО на всех.
   *
   * Токен обновления одноразовый: бэкенд считает повторное предъявление кражей
   * (`refresh_replay`) и гасит цепочку сессий. Экран открывает несколько запросов сразу,
   * и через 15 минут работы все они получают 401 одновременно. Если каждый пойдёт
   * обновляться сам, первый обновит, а остальные будут выглядеть как кража — и человека
   * выкинет вместо того, чтобы починить ему сессию.
   *
   * Поэтому пока обновление идёт, остальные ждут его результат. Замок снимается в любом
   * случае: следующее падение обновляет заново.
   */
  async recoverSession(): Promise<string | null> {
    inFlightRecovery ??= this.tryRefresh()
      .then((session) => session?.tokens.accessToken ?? null)
      .finally(() => {
        inFlightRecovery = null;
      });
    return inFlightRecovery;
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
    /*
     * При заходе прямо на страницу выхода (закладка, ссылка в новой вкладке, F5) память
     * ВСЕГДА пуста: она заполняется только после успешного восстановления сессии, а оно
     * идёт четырьмя запросами. Прежний код в этом случае просто выходил из функции —
     * серверную сессию никто не отзывал, cookie оставалась живой, и восстановление,
     * идущее следом, поднимало сессию заново: «Выйти» возвращало человека в кабинет,
     * а на общем компьютере учебного класса следующий садившийся попадал под чужой
     * учётной записью (ФТ-H6).
     *
     * Поэтому сессию сначала поднимаем по cookie — и выходим уже по-настоящему,
     * с отзывом на сервере. Если поднять нечего, выходить и не из чего: чистим хранилище.
     */
    const session = sessionStore.get() ?? (await this.tryRefresh());
    if (!session) {
      this.clear();
      return;
    }
    /*
     * ⚠️ Сбой отзыва нельзя проглатывать (журнал 119).
     *
     * Локальное хранилище чистится в любом случае — иначе человек, нажавший «Выйти»,
     * остался бы залогиненным на экране, и это хуже. Но если сервер не подтвердил отзыв
     * (нет сети, 500), сессия там **живёт до истечения срока**: на общем компьютере
     * учебного центра это чужой доступ к чужому личному делу.
     *
     * Поэтому ошибка не гасится, а поднимается наверх с признаком `serverRevokeFailed` —
     * вызывающий обязан сказать человеку, что выход прошёл только на этом устройстве.
     */
    try {
      await authApi.logout({ sessionId: session.tokens.sessionId }, session.tokens.accessToken);
    } catch (error) {
      this.clear();
      throw new LogoutNotConfirmedError(error);
    }
    this.clear();
  },
  clear() {
    sessionStore.clear();
  }
};

/*
 * Клиент лежит НИЖЕ слоя сессии и про него ничего не знает — поэтому точку восстановления
 * ставим отсюда. Так 401 на рабочем запросе один раз обновляет сессию и повторяет запрос,
 * а если обновить нечем — сессия стирается, и подписчики хранилища (контекст входа)
 * уводят человека на экран входа.
 */
setSessionRecovery(() => sessionManager.recoverSession());

/*
 * Подпись вошедшего — оттуда же и по той же причине (ТЗ 2.3 / Б5).
 *
 * Раньше токен обязан был передать каждый вызывающий руками, и двадцать два вызова в пяти
 * разделах этого не делали: сервер отвечал «вход не выполнен», а человек сидел в системе со
 * своим именем в шапке. Теперь не передал — берётся отсюда.
 *
 * Центр обязателен вместе с токеном: охрана сверяет центр из токена с заголовком запроса, и
 * один токен без центра на стенде с несколькими центрами дал бы отказ по несовпадению — то же
 * «вход не выполнен», только по другой причине.
 */
setSessionAuth(() => {
  const session = sessionStore.get();
  if (!session) return null;
  return {
    accessToken: session.tokens.accessToken,
    tenantId: session.user.tenantId,
    userId: session.user.id
  };
});

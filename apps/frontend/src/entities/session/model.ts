import type { AuthTokensContract } from '@trudskill/api-contracts';
export interface CurrentUser {
  id: string;
  tenantId: string;
  login: string;
  email: string | null;
  status: 'active' | 'blocked';
  displayName: string;
  /**
   * Кто из поддержки вошёл «от имени» (ТЗ 13.5).
   *
   * Пусто у обычной сессии. Заполнено — значит в кабинете работает администратор платформы,
   * и это обязано быть видно: и полосой сверху, и пометкой в подтверждениях опасных действий.
   * Признак приходит с сервера (`auth/me`), а не выводится по ролям: роль в таком режиме
   * ровно та же, что у настоящего сотрудника центра, — по ней режим неотличим.
   */
  impersonatedBy?: string;
  /**
   * Название центра — для полосы режима «от имени» (ТЗ 13.5).
   *
   * Приходит только в этом режиме: обычной работе оно ни к чему. Нужно, чтобы полоса называла
   * центр словами, а не кодом: сырой идентификатор человеку запрещён правилом продукта.
   */
  tenantName?: string;
}

export type SessionTokens = AuthTokensContract;

export interface UserSession {
  user: CurrentUser;
  tokens: SessionTokens;
  permissions: string[];
  roles: string[];
}

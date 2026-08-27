import { apiRequest } from '../api/client';
import { resolveCurrentTenantId } from '../tenant/current-tenant';

import type { LoginRequest, LoginResponse, LogoutRequest, MeResponse } from '../api/types';

export interface RoleDto {
  code: string;
}

export interface MagicLinkRequestPayload {
  email: string;
}

export interface MagicLinkRequestResponse {
  status: 'sent';
}

export interface MagicLinkRedeemPayload {
  token: string;
}

export type MagicLinkRedeemResponse = LoginResponse | TotpChallengeResponse;

/** ФТ-G3: у пользователя включена 2FA — сессии нет, нужен второй шаг /auth/2fa/verify. */
export interface TotpChallengeResponse {
  totpRequired: true;
  challengeToken: string;
}

export const isTotpChallenge = (
  value: LoginResponse | TotpChallengeResponse
): value is TotpChallengeResponse => 'totpRequired' in value && value.totpRequired === true;

export interface TotpStatusResponse {
  enabled: boolean;
  pending: boolean;
  eligible: boolean;
}

export interface TotpSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export const authApi = {
  // ФТ-D3.2: вход идёт в тот центр, чей адрес открыт. Без поддомена — арендатор
  // из настроек, то есть прежнее поведение.
  login: async (payload: LoginRequest) =>
    apiRequest<LoginResponse | TotpChallengeResponse>('/auth/login', {
      method: 'POST',
      body: payload,
      credentials: 'include',
      auth: { tenantHint: await resolveCurrentTenantId() }
    }),
  verifyTotp: (payload: { challengeToken: string; code: string }) =>
    apiRequest<LoginResponse>('/auth/2fa/verify', {
      method: 'POST',
      body: payload,
      credentials: 'include'
    }),
  totpStatus: (accessToken: string) =>
    apiRequest<TotpStatusResponse>('/auth/2fa/status', {
      auth: { accessToken },
      credentials: 'include'
    }),
  totpSetup: (accessToken: string) =>
    apiRequest<TotpSetupResponse>('/auth/2fa/setup', {
      method: 'POST',
      auth: { accessToken },
      credentials: 'include'
    }),
  totpConfirm: (code: string, accessToken: string) =>
    apiRequest<{ enabled: true }>('/auth/2fa/confirm', {
      method: 'POST',
      body: { code },
      auth: { accessToken },
      credentials: 'include'
    }),
  totpDisable: (code: string, accessToken: string) =>
    apiRequest<{ enabled: false }>('/auth/2fa/disable', {
      method: 'POST',
      body: { code },
      auth: { accessToken },
      credentials: 'include'
    }),
  /**
   * Восстановление сессии по cookie.
   *
   * ⚠️ Журнал 120. Раньше оба запроса шли БЕЗ подсказки арендатора, то есть с центром по
   * умолчанию: на поддомене любого другого центра каждая перезагрузка страницы кончалась
   * отказом, и человека выбрасывало на вход. Вход (`login`) подсказку передавал давно —
   * восстановление про неё забыли, хотя это ровно тот же довходной запрос.
   *
   * Подсказка резолвится один раз на оба запроса: `/auth/csrf` тоже довходной, и без
   * центра он выдаст токен не того арендатора.
   */
  refresh: async () => {
    const tenantHint = await resolveCurrentTenantId();
    const csrf = await apiRequest<{ csrfToken: string }>('/auth/csrf', {
      method: 'GET',
      credentials: 'include',
      auth: { tenantHint }
    });
    return apiRequest<LoginResponse>('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': csrf.csrfToken },
      auth: { tenantHint }
    });
  },
  logout: (payload: LogoutRequest, accessToken: string) =>
    apiRequest<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      body: payload,
      auth: { accessToken },
      credentials: 'include'
    }),
  me: (accessToken: string) =>
    apiRequest<MeResponse>('/auth/me', { auth: { accessToken }, credentials: 'include' }),
  userRoles: (userId: string, accessToken: string) =>
    apiRequest<RoleDto[]>(`/users/${userId}/roles`, {
      auth: { accessToken },
      credentials: 'include'
    }),
  // Ревизия 2026-08-27 (порция 23): обе ручки довходные — подсказка арендатора обязана
  // ехать с запросом (как у login/refresh), иначе на поддомене центра ссылка уйдёт
  // в арендатора по умолчанию (тот же класс, что запись 214 журнала про refresh).
  magicLinkRequest: async (payload: MagicLinkRequestPayload) =>
    apiRequest<MagicLinkRequestResponse>('/auth/magic-link/request', {
      method: 'POST',
      body: payload,
      credentials: 'include',
      auth: { tenantHint: await resolveCurrentTenantId() }
    }),
  magicLinkRedeem: async (payload: MagicLinkRedeemPayload) =>
    apiRequest<LoginResponse | TotpChallengeResponse>('/auth/magic-link/redeem', {
      method: 'POST',
      body: payload,
      credentials: 'include',
      auth: { tenantHint: await resolveCurrentTenantId() }
    })
};

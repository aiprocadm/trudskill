import { apiRequest } from '../api/client';

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
  login: (payload: LoginRequest) =>
    apiRequest<LoginResponse | TotpChallengeResponse>('/auth/login', {
      method: 'POST',
      body: payload,
      credentials: 'include'
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
  refresh: async () => {
    const csrf = await apiRequest<{ csrfToken: string }>('/auth/csrf', {
      method: 'GET',
      credentials: 'include'
    });
    return apiRequest<LoginResponse>('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': csrf.csrfToken }
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
  magicLinkRequest: (payload: MagicLinkRequestPayload) =>
    apiRequest<MagicLinkRequestResponse>('/auth/magic-link/request', {
      method: 'POST',
      body: payload,
      credentials: 'include'
    }),
  magicLinkRedeem: (payload: MagicLinkRedeemPayload) =>
    apiRequest<LoginResponse | TotpChallengeResponse>('/auth/magic-link/redeem', {
      method: 'POST',
      body: payload,
      credentials: 'include'
    })
};

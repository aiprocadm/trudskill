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

export type MagicLinkRedeemResponse = LoginResponse;

export const authApi = {
  login: (payload: LoginRequest) =>
    apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: payload,
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
    apiRequest<MagicLinkRedeemResponse>('/auth/magic-link/redeem', {
      method: 'POST',
      body: payload,
      credentials: 'include'
    })
};

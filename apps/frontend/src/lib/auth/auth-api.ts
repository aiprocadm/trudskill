import { apiRequest } from '../api/client';
import type { LoginRequest, LoginResponse, LogoutRequest, MeResponse } from '../api/types';
import type { RefreshRequestContract } from '@cdoprof/api-contracts';

export interface RoleDto {
  code: string;
}

export const authApi = {
  login: (payload: LoginRequest) =>
    apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: payload, credentials: 'include' }),
  refresh: (payload: RefreshRequestContract) =>
    apiRequest<LoginResponse>('/auth/refresh', { method: 'POST', body: payload, credentials: 'include' }),
  logout: (payload: LogoutRequest, accessToken: string) =>
    apiRequest<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      body: payload,
      auth: { accessToken },
      credentials: 'include'
    }),
  me: (accessToken: string) => apiRequest<MeResponse>('/auth/me', { auth: { accessToken }, credentials: 'include' }),
  userRoles: (userId: string, accessToken: string) =>
    apiRequest<RoleDto[]>(`/users/${userId}/roles`, { auth: { accessToken }, credentials: 'include' })
};

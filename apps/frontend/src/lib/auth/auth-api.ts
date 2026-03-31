import { apiRequest } from '../api/client';
import type { LoginRequest, LoginResponse, LogoutRequest, MeResponse, RefreshRequest } from '../api/types';

export interface RoleDto {
  code: string;
}

export const authApi = {
  login: (payload: LoginRequest) => apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: payload }),
  refresh: (payload: RefreshRequest) =>
    apiRequest<LoginResponse>('/auth/refresh', { method: 'POST', body: payload }),
  logout: (payload: LogoutRequest, accessToken: string) =>
    apiRequest<{ success: boolean }>('/auth/logout', { method: 'POST', body: payload, auth: { accessToken } }),
  me: (accessToken: string) => apiRequest<MeResponse>('/auth/me', { auth: { accessToken } }),
  userRoles: (userId: string, accessToken: string) =>
    apiRequest<RoleDto[]>(`/users/${userId}/roles`, { auth: { accessToken } })
};

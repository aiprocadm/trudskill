import { apiRequest } from '../api/client';
import type { LoginRequest, LoginResponse, LogoutRequest, MeResponse, RefreshRequest } from '../api/types';

export interface RoleDto {
  code: string;
}

export const authApi = {
  login: (payload: LoginRequest) => apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: payload }),
  refresh: (payload: RefreshRequest, userId: string) =>
    apiRequest<LoginResponse>('/auth/refresh', { method: 'POST', body: payload, auth: { userId } }),
  logout: (payload: LogoutRequest, userId: string) =>
    apiRequest<{ success: boolean }>('/auth/logout', { method: 'POST', body: payload, auth: { userId } }),
  me: (userId: string) => apiRequest<MeResponse>('/auth/me', { auth: { userId } }),
  userRoles: (userId: string) => apiRequest<RoleDto[]>(`/users/${userId}/roles`, { auth: { userId } })
};

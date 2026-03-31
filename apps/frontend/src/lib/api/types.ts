import type { CurrentUser } from '../../entities/session/model';

export interface LoginRequest {
  login: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  sessionId: string;
  expiresIn: number;
}

export interface LogoutRequest {
  sessionId: string;
}

export type MeResponse = CurrentUser;

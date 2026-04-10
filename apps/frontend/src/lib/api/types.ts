import type { CurrentUser } from '../../entities/session/model';
import type { AuthTokensContract } from '@cdoprof/api-contracts';

export interface LoginRequest {
  login: string;
  password: string;
}

export type LoginResponse = AuthTokensContract;

export interface LogoutRequest {
  sessionId: string;
}

export type MeResponse = CurrentUser;

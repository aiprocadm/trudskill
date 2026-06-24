import type { SessionResponseContract, UserResponseContract } from '@trudskill/api-contracts';

export type UserStatus = 'active' | 'blocked';

export interface User {
  id: string;
  tenantId: string;
  login: string;
  email: string | null;
  passwordHash: string;
  status: UserStatus;
  displayName: string;
}

export type UserPublicDto = UserResponseContract;

export interface Role {
  id: string;
  tenantId: string;
  code: string;
  name: string;
}

export interface Permission {
  id: string;
  code: string;
  description: string;
}

export interface Session {
  id: string;
  tenantId: string;
  userId: string;
  jti: string;
  parentJti?: string;
  refreshTokenHash: string;
  csrfTokenHash?: string;
  expiresAt: string;
  rotatedAt?: string;
  consumedAt?: string;
  revokedAt?: string;
  revokeReason?: string;
}

export type SessionPublicDto = SessionResponseContract;

export interface AuthEvent {
  id: string;
  tenantId: string;
  userId: string;
  type: 'login' | 'logout' | 'refresh' | 'session_revoke' | 'logout_all' | 'magic_link_login';
  createdAt: string;
}

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

export interface UserPublicDto {
  id: string;
  tenantId: string;
  login: string;
  email: string | null;
  status: UserStatus;
  displayName: string;
}

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
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface SessionPublicDto {
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface AuthEvent {
  id: string;
  tenantId: string;
  userId: string;
  type: 'login' | 'logout' | 'refresh' | 'session_revoke' | 'logout_all';
  createdAt: string;
}

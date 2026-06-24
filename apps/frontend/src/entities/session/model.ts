import type { AuthTokensContract } from '@trudskill/api-contracts';
export interface CurrentUser {
  id: string;
  tenantId: string;
  login: string;
  email: string | null;
  status: 'active' | 'blocked';
  displayName: string;
}

export type SessionTokens = AuthTokensContract;

export interface UserSession {
  user: CurrentUser;
  tokens: SessionTokens;
  permissions: string[];
  roles: string[];
}

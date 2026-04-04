import type { AuthTokensContract } from '@cdoprof/api-contracts';
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

export interface CurrentUser {
  id: string;
  tenantId: string;
  login: string;
  email: string | null;
  status: 'active' | 'blocked';
  displayName: string;
}

export interface SessionTokens {
  accessToken: string;
  sessionId: string;
  expiresIn: number;
}

export interface UserSession {
  user: CurrentUser;
  tokens: SessionTokens;
  permissions: string[];
  roles: string[];
}

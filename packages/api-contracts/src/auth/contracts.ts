export interface AuthClaimsContract {
  tenant_id: string;
  role_codes: string[];
  permission_codes: string[];
  session_id: string;
}

export interface AuthTokensContract {
  accessToken: string;
  sessionId: string;
  expiresIn: number;
  claims?: AuthClaimsContract;
}

export type RefreshRequestContract = Record<string, never>;

export interface UserResponseContract {
  id: string;
  tenantId: string;
  login: string;
  email: string | null;
  status: 'active' | 'blocked';
  displayName: string;
  /** МГ-J3.2 (миграция 0112, РМ74): должность сотрудника; у старых учёток пусто. */
  position?: string | null;
}

export interface SessionResponseContract {
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: string;
  revokedAt?: string;
}

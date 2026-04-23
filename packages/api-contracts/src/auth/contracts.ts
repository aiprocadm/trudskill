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

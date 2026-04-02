export interface AuthTokensContract {
  accessToken: string;
  sessionId: string;
  expiresIn: number;
}

export type RefreshRequestContract = Record<string, never>;

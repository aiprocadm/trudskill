export interface AuthTokensContract {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}

export interface RefreshRequestContract {
  refreshToken: string;
}

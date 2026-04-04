import type { AuthTokensContract } from '@cdoprof/api-contracts';
import { backendEnv } from '../../env.js';

const REFRESH_COOKIE_NAME = 'cdoprof_refresh_token';

const cookieAttributes = () =>
  [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${backendEnv.REFRESH_TOKEN_TTL_SECONDS}`,
    backendEnv.NODE_ENV === 'production' ? 'Secure' : ''
  ]
    .filter(Boolean)
    .join('; ');

export const authCookie = {
  refreshCookieName: REFRESH_COOKIE_NAME,
  attachRefreshCookie(response: { setHeader: (name: string, value: string) => void }, refreshToken: string) {
    response.setHeader(
      'Set-Cookie',
      [`${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}`, cookieAttributes()].join('; ')
    );
  },
  clearRefreshCookie(response: { setHeader: (name: string, value: string) => void }) {
    response.setHeader(
      'Set-Cookie',
      [`${REFRESH_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT']
        .join('; ')
    );
  },
  readRefreshCookie(headers: Record<string, string | string[] | undefined>): string | null {
    const rawCookieHeader = headers.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader) ? rawCookieHeader.join('; ') : rawCookieHeader;
    if (!cookieHeader) return null;
    const item = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${REFRESH_COOKIE_NAME}=`));
    if (!item) return null;
    const rawValue = item.slice(`${REFRESH_COOKIE_NAME}=`.length);
    if (!rawValue) return null;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return null;
    }
  },
  toPublicTokens(tokens: AuthTokensContract & { refreshToken?: string }): AuthTokensContract {
    const { accessToken, sessionId, expiresIn } = tokens;
    return { accessToken, sessionId, expiresIn };
  }
};

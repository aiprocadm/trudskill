import { backendEnv } from '../../env.js';

interface AuthTokensContract {
  accessToken: string;
  sessionId: string;
  expiresIn: number;
  claims?: {
    tenant_id: string;
    role_codes: string[];
    permission_codes: string[];
    session_id: string;
  };
  csrfToken?: string;
}

const REFRESH_COOKIE_NAME = 'cdoprof_refresh_token';
const CSRF_COOKIE_NAME = 'cdoprof_csrf_token';

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

const csrfCookieAttributes = () =>
  [
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${backendEnv.REFRESH_TOKEN_TTL_SECONDS}`,
    backendEnv.NODE_ENV === 'production' ? 'Secure' : ''
  ]
    .filter(Boolean)
    .join('; ');

const readCookie = (
  headers: Record<string, string | string[] | undefined>,
  cookieName: string
): string | null => {
  const rawCookieHeader = headers.cookie;
  const cookieHeader = Array.isArray(rawCookieHeader)
    ? rawCookieHeader.join('; ')
    : rawCookieHeader;
  if (!cookieHeader) return null;
  const item = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (!item) return null;
  const rawValue = item.slice(`${cookieName}=`.length);
  if (!rawValue) return null;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return null;
  }
};

export const authCookie = {
  refreshCookieName: REFRESH_COOKIE_NAME,
  csrfCookieName: CSRF_COOKIE_NAME,
  attachRefreshCookie(
    response: { setHeader: (name: string, value: string) => void },
    refreshToken: string
  ) {
    response.setHeader(
      'Set-Cookie',
      [`${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}`, cookieAttributes()].join('; ')
    );
  },
  attachRefreshAndCsrfCookies(
    response: { setHeader: (name: string, value: string | string[]) => void },
    refreshToken: string,
    csrfToken: string
  ) {
    response.setHeader('Set-Cookie', [
      [`${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}`, cookieAttributes()].join('; '),
      [`${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`, csrfCookieAttributes()].join('; ')
    ]);
  },
  attachCsrfCookie(
    response: { setHeader: (name: string, value: string) => void },
    csrfToken: string
  ) {
    response.setHeader(
      'Set-Cookie',
      [`${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`, csrfCookieAttributes()].join('; ')
    );
  },
  clearRefreshCookie(response: { setHeader: (name: string, value: string) => void }) {
    response.setHeader(
      'Set-Cookie',
      [
        `${REFRESH_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      ].join('; ')
    );
  },
  clearAuthCookies(response: { setHeader: (name: string, value: string | string[]) => void }) {
    response.setHeader('Set-Cookie', [
      [
        `${REFRESH_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      ].join('; '),
      [
        `${CSRF_COOKIE_NAME}=`,
        'Path=/',
        'SameSite=Lax',
        'Max-Age=0',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      ].join('; ')
    ]);
  },
  readRefreshCookie(headers: Record<string, string | string[] | undefined>): string | null {
    return readCookie(headers, REFRESH_COOKIE_NAME);
  },
  readCsrfCookie(headers: Record<string, string | string[] | undefined>): string | null {
    return readCookie(headers, CSRF_COOKIE_NAME);
  },
  toPublicTokens(tokens: AuthTokensContract & { refreshToken?: string }): AuthTokensContract {
    const { accessToken, sessionId, expiresIn, claims } = tokens;
    return { accessToken, sessionId, expiresIn, claims };
  }
};

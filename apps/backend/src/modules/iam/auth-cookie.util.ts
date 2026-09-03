import { toAuthResponse } from './iam-response.mapper.js';
import { backendEnv } from '../../env.js';

import type { AuthTokensContract } from '@trudskill/api-contracts';

/*
 * BR-020/BR-022 — ВЫКАТКА N периода двойного чтения (60 дней).
 *
 * Прямое переименование cookie разлогинило бы всех, у кого открыта сессия: браузер
 * продолжит присылать старое имя, а сервер будет искать новое. Отсюда правила окна:
 *
 * 1. ЧИТАЕМ новое имя, при его отсутствии — прежнее.
 * 2. ПИШЕМ значение под ОБА имени сразу, одинаковое.
 * 3. При выходе гасим ОБА имени.
 *
 * Пункт 2 — не избыточность, а единственный вариант без потерь, и вот почему.
 * Refresh-токен одноразовый: сервер помнит, что прежний потрачен, и повторное
 * предъявление считает кражей — отзывает все сессии человека на всех устройствах.
 *
 * - Писать только новое имя, прежнее не трогать (буква ТЗ) — прежняя cookie остаётся
 *   с ПОТРАЧЕННЫМ значением на 7 суток; откат кода → сервер читает её → ложная кража.
 * - Писать новое, а прежнее гасить — откат кода → сервер не находит вообще ничего →
 *   разлогинены все разом, ровно то, ради чего окно и заводилось.
 * - Писать оба одним значением — прежнее имя всегда содержит АКТУАЛЬНЫЙ токен: откат
 *   проходит без потерь и без ложной кражи. Это и выбрано (отступление от буквы
 *   `BR-020` п.1 записано в журнал расхождений трекера).
 *
 * Выкатка N+1 (через 60 дней, отдельный PR): убрать LEGACY_*, чтение и запись прежних
 * имён — см. docs/REBRANDING_KEYS_ROLLOUT.md.
 */
const REFRESH_COOKIE_NAME = 'trudskill_refresh_token';
const CSRF_COOKIE_NAME = 'trudskill_csrf_token';
const LEGACY_REFRESH_COOKIE_NAME = 'cdoprof_refresh_token';
const LEGACY_CSRF_COOKIE_NAME = 'cdoprof_csrf_token';

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
    // Битая cookie — значит значения нет; разбирать нечего и жаловаться некому.
    return null;
  }
};

/**
 * Cookie с истёкшим сроком — одинаковая для нового и старого имени.
 *
 * `Secure` повторяет живую cookie намеренно: сегодня он не входит в ключ
 * идентичности (имя+домен+путь) и на удаление не влияет, но при будущем переходе
 * на префиксы `__Host-`/`__Secure-` разъехавшиеся атрибуты тихо сломали бы гашение.
 */
const expiredCookie = (cookieName: string, httpOnly: boolean): string =>
  [
    `${cookieName}=`,
    'Path=/',
    httpOnly ? 'HttpOnly' : '',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    backendEnv.NODE_ENV === 'production' ? 'Secure' : ''
  ]
    .filter(Boolean)
    .join('; ');

/** Живая refresh-cookie (HttpOnly). Имя — параметр: на период окна пишутся оба. */
const refreshCookie = (cookieName: string, value: string): string =>
  [`${cookieName}=${encodeURIComponent(value)}`, cookieAttributes()].join('; ');

/** Живая csrf-cookie: намеренно доступна скрипту — её читает и присылает фронт. */
const csrfCookie = (cookieName: string, value: string): string =>
  [`${cookieName}=${encodeURIComponent(value)}`, csrfCookieAttributes()].join('; ');

export const authCookie = {
  refreshCookieName: REFRESH_COOKIE_NAME,
  csrfCookieName: CSRF_COOKIE_NAME,
  /** Прежние имена — только для периода двойного чтения (BR-020). */
  legacyRefreshCookieName: LEGACY_REFRESH_COOKIE_NAME,
  legacyCsrfCookieName: LEGACY_CSRF_COOKIE_NAME,
  attachRefreshCookie(
    response: { setHeader: (name: string, value: string | string[]) => void },
    refreshToken: string
  ) {
    response.setHeader('Set-Cookie', [
      refreshCookie(REFRESH_COOKIE_NAME, refreshToken),
      refreshCookie(LEGACY_REFRESH_COOKIE_NAME, refreshToken)
    ]);
  },
  attachRefreshAndCsrfCookies(
    response: { setHeader: (name: string, value: string | string[]) => void },
    refreshToken: string,
    csrfToken: string
  ) {
    // Оба имени получают ОДНО И ТО ЖЕ актуальное значение — см. пояснение в шапке файла.
    response.setHeader('Set-Cookie', [
      refreshCookie(REFRESH_COOKIE_NAME, refreshToken),
      csrfCookie(CSRF_COOKIE_NAME, csrfToken),
      refreshCookie(LEGACY_REFRESH_COOKIE_NAME, refreshToken),
      csrfCookie(LEGACY_CSRF_COOKIE_NAME, csrfToken)
    ]);
  },
  attachCsrfCookie(
    response: { setHeader: (name: string, value: string | string[]) => void },
    csrfToken: string
  ) {
    response.setHeader('Set-Cookie', [
      csrfCookie(CSRF_COOKIE_NAME, csrfToken),
      csrfCookie(LEGACY_CSRF_COOKIE_NAME, csrfToken)
    ]);
  },
  clearRefreshCookie(response: { setHeader: (name: string, value: string | string[]) => void }) {
    // Гасим и старое имя: иначе «Выйти» оставит рабочий refresh под прежним ключом.
    response.setHeader('Set-Cookie', [
      expiredCookie(REFRESH_COOKIE_NAME, true),
      expiredCookie(LEGACY_REFRESH_COOKIE_NAME, true)
    ]);
  },
  clearAuthCookies(response: { setHeader: (name: string, value: string | string[]) => void }) {
    response.setHeader('Set-Cookie', [
      expiredCookie(REFRESH_COOKIE_NAME, true),
      expiredCookie(CSRF_COOKIE_NAME, false),
      expiredCookie(LEGACY_REFRESH_COOKIE_NAME, true),
      expiredCookie(LEGACY_CSRF_COOKIE_NAME, false)
    ]);
  },
  readRefreshCookie(headers: Record<string, string | string[] | undefined>): string | null {
    return (
      readCookie(headers, REFRESH_COOKIE_NAME) ?? readCookie(headers, LEGACY_REFRESH_COOKIE_NAME)
    );
  },
  readCsrfCookie(headers: Record<string, string | string[] | undefined>): string | null {
    return readCookie(headers, CSRF_COOKIE_NAME) ?? readCookie(headers, LEGACY_CSRF_COOKIE_NAME);
  },
  toPublicTokens(tokens: AuthTokensContract & { refreshToken?: string }): AuthTokensContract {
    return toAuthResponse(tokens);
  }
};

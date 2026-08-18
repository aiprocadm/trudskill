import { describe, expect, it, vi } from 'vitest';

import { authCookie } from './auth-cookie.util.js';

/*
 * BR-020/BR-022 — выкатка N периода двойного чтения имён cookie.
 *
 * Своего теста у `auth-cookie.util` не было вовсе: имена cookie проверялись косвенно,
 * через контроллер олицетворения. Механизм, от которого зависит, разлогинит ли выкатка
 * всех живых пользователей, обязан иметь прямые проверки.
 */

const headersWith = (cookie: string): Record<string, string | string[] | undefined> => ({ cookie });

const makeResponse = () => {
  const setHeader = vi.fn();
  return { setHeader, response: { setHeader } as never };
};

const setCookieList = (setHeader: ReturnType<typeof vi.fn>): string[] => {
  const [, value] = setHeader.mock.calls[0] as [string, string | string[]];
  return Array.isArray(value) ? value : [value];
};

describe('имена cookie аутентификации (BR-020, период двойного чтения)', () => {
  const find = (cookies: string[], name: string): string | undefined =>
    cookies.find((c) => c.startsWith(`${name}=`));

  const isExpired = (cookies: string[], name: string): boolean => {
    const cookie = find(cookies, name);
    return Boolean(cookie && cookie.includes('Max-Age=0'));
  };

  /*
   * Обе пары пишутся ОДНИМ значением. Прежнее имя обязано нести АКТУАЛЬНЫЙ токен:
   * refresh одноразовый, и если под прежним именем осталось бы потраченное значение,
   * откат кода заставил бы сервер счесть его кражей и отозвать все сессии человека.
   * Если же прежнего имени не писать вовсе — откат разлогинил бы всех разом.
   */
  it('значение пишется под ОБА имени, одинаковое', () => {
    const { setHeader, response } = makeResponse();
    authCookie.attachRefreshAndCsrfCookies(response, 'refresh_value', 'csrf_value');

    const cookies = setCookieList(setHeader);
    expect(find(cookies, 'trudskill_refresh_token')).toContain('=refresh_value;');
    expect(find(cookies, 'cdoprof_refresh_token')).toContain('=refresh_value;');
    expect(find(cookies, 'trudskill_csrf_token')).toContain('=csrf_value;');
    expect(find(cookies, 'cdoprof_csrf_token')).toContain('=csrf_value;');
  });

  it('эхо-ручка csrf тоже пишет оба имени одним значением', () => {
    const { setHeader, response } = makeResponse();
    authCookie.attachCsrfCookie(response, 'csrf_value');

    const cookies = setCookieList(setHeader);
    expect(find(cookies, 'trudskill_csrf_token')).toContain('=csrf_value;');
    expect(find(cookies, 'cdoprof_csrf_token')).toContain('=csrf_value;');
  });

  it('одиночная запись refresh пишет оба имени', () => {
    const { setHeader, response } = makeResponse();
    authCookie.attachRefreshCookie(response, 'refresh_value');

    const cookies = setCookieList(setHeader);
    expect(find(cookies, 'trudskill_refresh_token')).toContain('=refresh_value;');
    expect(find(cookies, 'cdoprof_refresh_token')).toContain('=refresh_value;');
  });

  /*
   * Атрибуты живой и гасящей cookie обязаны совпадать: браузер удаляет запись по
   * тройке имя+домен+путь. Проверка добавлена после того, как выяснилось, что убрать
   * `Path=/` из гашения можно было, не уронив ни одного теста, — а без пути гашение
   * из `/api/v1/auth/logout` ушло бы на другой путь и не тронуло настоящую cookie:
   * «Выйти» перестал бы выходить молча.
   */
  it('гасящие cookie повторяют путь и признак HttpOnly живых', () => {
    const { setHeader: setLive, response: live } = makeResponse();
    authCookie.attachRefreshAndCsrfCookies(live, 'r', 'c');
    const liveCookies = setCookieList(setLive);

    const { setHeader: setDead, response: dead } = makeResponse();
    authCookie.clearAuthCookies(dead);
    const deadCookies = setCookieList(setDead);

    for (const name of [
      'trudskill_refresh_token',
      'trudskill_csrf_token',
      'cdoprof_refresh_token',
      'cdoprof_csrf_token'
    ]) {
      const alive = find(liveCookies, name);
      const expired = find(deadCookies, name);
      expect(alive, `живая ${name}`).toBeDefined();
      expect(expired, `гасящая ${name}`).toBeDefined();
      expect(expired).toContain('Path=/');
      expect(expired).toContain('Max-Age=0');
      // HttpOnly у пары «живая/гасящая» обязан совпадать.
      expect(expired!.includes('HttpOnly')).toBe(alive!.includes('HttpOnly'));
    }
  });

  it('читает ПРЕЖНЕЕ имя, когда нового ещё нет — иначе выкатка разлогинила бы всех', () => {
    const headers = headersWith('cdoprof_refresh_token=old_refresh; cdoprof_csrf_token=old_csrf');
    expect(authCookie.readRefreshCookie(headers)).toBe('old_refresh');
    expect(authCookie.readCsrfCookie(headers)).toBe('old_csrf');
  });

  it('когда пришли оба имени — берётся НОВОЕ', () => {
    const headers = headersWith(
      'cdoprof_refresh_token=old_refresh; trudskill_refresh_token=new_refresh; cdoprof_csrf_token=old_csrf; trudskill_csrf_token=new_csrf'
    );
    expect(authCookie.readRefreshCookie(headers)).toBe('new_refresh');
    expect(authCookie.readCsrfCookie(headers)).toBe('new_csrf');
  });

  it('пустой заголовок и чужие cookie не дают ложного значения', () => {
    expect(authCookie.readRefreshCookie({})).toBeNull();
    expect(authCookie.readRefreshCookie(headersWith('other=1; alien_refresh_token=x'))).toBeNull();
  });

  it('выход гасит ОБА имени: иначе прежний refresh молча воскресит сессию', () => {
    const { setHeader, response } = makeResponse();
    authCookie.clearAuthCookies(response);

    const cookies = setCookieList(setHeader);
    const expired = (name: string) =>
      cookies.some((c) => c.startsWith(`${name}=`) && c.includes('Max-Age=0'));

    expect(expired('trudskill_refresh_token')).toBe(true);
    expect(expired('trudskill_csrf_token')).toBe(true);
    expect(expired('cdoprof_refresh_token')).toBe(true);
    expect(expired('cdoprof_csrf_token')).toBe(true);
  });

  it('гашение refresh-cookie покрывает оба имени и сохраняет HttpOnly и путь', () => {
    const { setHeader, response } = makeResponse();
    authCookie.clearRefreshCookie(response);

    const cookies = setCookieList(setHeader);
    expect(cookies).toHaveLength(2);
    expect(cookies.every((c) => c.includes('HttpOnly') && c.includes('Path=/'))).toBe(true);
    expect(isExpired(cookies, 'trudskill_refresh_token')).toBe(true);
    expect(isExpired(cookies, 'cdoprof_refresh_token')).toBe(true);
  });

  it('csrf-cookie остаётся доступной скрипту (без HttpOnly) — её читает фронт', () => {
    const { setHeader, response } = makeResponse();
    authCookie.attachCsrfCookie(response, 'csrf_value');
    const live = find(setCookieList(setHeader), 'trudskill_csrf_token');
    expect(live).toBeDefined();
    expect(live).not.toContain('HttpOnly');
  });
});

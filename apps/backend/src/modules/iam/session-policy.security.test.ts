import { describe, expect, it, vi } from 'vitest';

import { authCookie } from './auth-cookie.util.js';
import { backendEnv } from '../../env.js';

/**
 * ФТ-G7 — «session-политики». Здесь они перестают быть устной договорённостью.
 *
 * Речь про правила хранения пропуска в систему: как долго он живёт и на каких условиях
 * браузер его отдаёт. Каждое из этих правил уже соблюдается в коде — но не проверялось
 * прямо, а значит могло измениться при любой правке и никто бы не заметил.
 *
 * Здесь проверяется ПОЛИТИКА (условия и сроки). Механика двойного чтения имён после
 * переименования проверяется отдельно — в `auth-cookie.util.test.ts`.
 */

const setCookieList = (setHeader: ReturnType<typeof vi.fn>): string[] => {
  const [, value] = setHeader.mock.calls[0] as [string, string | string[]];
  return Array.isArray(value) ? value : [value];
};

const liveCookies = (): string[] => {
  const setHeader = vi.fn();
  authCookie.attachRefreshAndCsrfCookies({ setHeader } as never, 'refresh', 'csrf');
  return setCookieList(setHeader);
};

const cookieNamed = (name: string): string => {
  const found = liveCookies().find((cookie) => cookie.startsWith(`${name}=`));
  expect(found, `cookie ${name} не выставляется`).toBeDefined();
  return found!;
};

describe('политика хранения пропуска в систему (ФТ-G7)', () => {
  /*
   * HttpOnly значит «скрипту не видно». Если бы пропуск на продление сессии был виден
   * скрипту, то любой чужой код, попавший на страницу, смог бы его скопировать и входить
   * от имени человека сколько угодно.
   */
  it('пропуск на продление сессии скрыт от скриптов страницы', () => {
    expect(cookieNamed(authCookie.refreshCookieName)).toContain('HttpOnly');
  });

  /*
   * А вот значение защиты от подделки скрипту видно НАМЕРЕННО: страница обязана прочитать
   * его и положить в заголовок запроса. В этом и смысл — чужая страница прочитать чужую
   * cookie не может, поэтому и заголовок подделать не сможет.
   */
  it('значение защиты от подделки намеренно доступно своей странице', () => {
    expect(cookieNamed(authCookie.csrfCookieName)).not.toContain('HttpOnly');
  });

  /*
   * SameSite=Lax — браузер не приложит cookie к запросу, который затеяла чужая страница.
   * Строже (`Strict`) взять нельзя: тогда человек, пришедший по ссылке из письма со входом,
   * попадёт на сайт «неузнанным».
   */
  it('cookie не прикладываются к запросам с чужих страниц', () => {
    for (const name of [authCookie.refreshCookieName, authCookie.csrfCookieName]) {
      expect(cookieNamed(name)).toContain('SameSite=Lax');
    }
  });

  it('cookie действуют на весь сайт, а не на один раздел', () => {
    // Путь важен не для красоты: гашение при выходе ищет cookie по имени И пути.
    // Разъехались — «Выйти» перестаёт выходить молча (запись 118 журнала расхождений).
    for (const name of [authCookie.refreshCookieName, authCookie.csrfCookieName]) {
      expect(cookieNamed(name)).toContain('Path=/');
    }
  });

  it('срок жизни cookie не бесконечен и совпадает со сроком пропуска', () => {
    const refresh = cookieNamed(authCookie.refreshCookieName);
    expect(refresh).toContain(`Max-Age=${backendEnv.REFRESH_TOKEN_TTL_SECONDS}`);
  });
});

describe('сроки жизни пропусков (ФТ-G7)', () => {
  /*
   * Короткий срок у пропуска доступа — то, что ограничивает ущерб от его утечки: даже
   * украденный, он перестанет работать через считанные минуты.
   */
  it('пропуск доступа живёт минуты, а не часы', () => {
    expect(backendEnv.ACCESS_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
    expect(backendEnv.ACCESS_TOKEN_TTL_SECONDS).toBeGreaterThan(0);
  });

  it('пропуск продления живёт не дольше месяца', () => {
    expect(backendEnv.REFRESH_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(30 * 24 * 60 * 60);
    // И заметно дольше пропуска доступа — иначе продлевать было бы нечем.
    expect(backendEnv.REFRESH_TOKEN_TTL_SECONDS).toBeGreaterThan(
      backendEnv.ACCESS_TOKEN_TTL_SECONDS
    );
  });
});

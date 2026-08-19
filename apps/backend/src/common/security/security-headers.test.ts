import { describe, expect, it } from 'vitest';

import { buildSecurityHeaders, parseCspDirectives } from './security-headers.js';

/*
 * ФТ-G7 — заголовки безопасности.
 *
 * Политика собирается ЧИСТОЙ функцией, а не расставляется по месту вызова: только так её
 * можно прочитать глазами в тесте и не поднимать ради проверки целое приложение.
 *
 * Два вида ответов, и правила у них разные:
 *   'api'   — JSON. Ему не нужно вообще ничего: ни скриптов, ни картинок, ни рамок.
 *   'scorm' — ЧУЖОЙ html/js учебного курса из загруженного пакета. Ему нужны свои скрипты
 *             и стили, иначе ни один курс не запустится.
 */

describe('заголовки безопасности API (ФТ-G7)', () => {
  const api = (isProduction = false) => buildSecurityHeaders({ isProduction, kind: 'api' });

  it('API не разрешает ничего: он отдаёт JSON, а не страницу', () => {
    const csp = parseCspDirectives(api()['Content-Security-Policy']);
    expect(csp['default-src']).toEqual(["'none'"]);
    // Ответ API не должен открываться внутри чужой страницы ни при каких условиях.
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'none'"]);
    expect(csp['form-action']).toEqual(["'none'"]);
  });

  it('браузер не угадывает тип содержимого и не показывает ответ в чужой рамке', () => {
    const headers = api();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    // Дублирует frame-ancestors для старых браузеров, которые CSP не понимают.
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('адрес запроса не утекает на чужие сайты', () => {
    // В путях API встречаются идентификаторы: в Referer им делать нечего.
    expect(api()['Referrer-Policy']).toBe('no-referrer');
  });

  /*
   * HSTS велит браузеру ХОДИТЬ ТОЛЬКО ПО HTTPS и запоминает это надолго. Выставить его
   * в разработке — значит намертво сломать себе localhost без сертификата: браузер запомнит
   * правило для всего домена и обратно его не отменить простым способом.
   */
  it('принудительный HTTPS появляется только в проде', () => {
    expect(api(false)['Strict-Transport-Security']).toBeUndefined();
    const production = api(true)['Strict-Transport-Security'];
    expect(production).toContain('max-age=');
    expect(production).toContain('includeSubDomains');
  });

  it('интерфейсам, которых у API нет, доступ закрыт', () => {
    const policy = api()['Permissions-Policy'];
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('geolocation=()');
  });
});

describe('заголовки безопасности SCORM-контента (ФТ-G7)', () => {
  const scorm = (isProduction = false) => buildSecurityHeaders({ isProduction, kind: 'scorm' });

  /*
   * Курс — чужой код. Запретить ему скрипты нельзя: тогда не запустится ни один курс,
   * а это основная функция раздела. Поэтому политика мягче ровно настолько, насколько
   * нужно курсу, и жёстче везде, где ему ничего не нужно.
   */
  it('курсу разрешены его собственные скрипты и стили', () => {
    const csp = parseCspDirectives(scorm()['Content-Security-Policy']);
    expect(csp['script-src']).toContain("'self'");
    expect(csp['script-src']).toContain("'unsafe-inline'");
    expect(csp['style-src']).toContain("'unsafe-inline'");
  });

  it('курс показывается только внутри нашего окна', () => {
    const csp = parseCspDirectives(scorm()['Content-Security-Policy']);
    // 'self' — а не 'none': курс живёт в iframe нашей же страницы.
    expect(csp['frame-ancestors']).toEqual(["'self'"]);
  });

  /*
   * Главное ограничение для чужого кода: он не должен никуда отправлять то, что видит.
   * Курс работает с системой через мост в родительском окне, а не своими запросами наружу.
   */
  it('курс не может отправить данные на чужой сервер', () => {
    const csp = parseCspDirectives(scorm()['Content-Security-Policy']);
    expect(csp['connect-src']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
    expect(csp['base-uri']).toEqual(["'none'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
  });

  it('тип содержимого курса не угадывается', () => {
    expect(scorm()['X-Content-Type-Options']).toBe('nosniff');
  });

  it('принудительный HTTPS так же только в проде', () => {
    expect(scorm(false)['Strict-Transport-Security']).toBeUndefined();
    expect(scorm(true)['Strict-Transport-Security']).toContain('max-age=');
  });
});

describe('разбор политики', () => {
  it('директива без значений читается как пустой список', () => {
    expect(parseCspDirectives("upgrade-insecure-requests; default-src 'none'")).toEqual({
      'upgrade-insecure-requests': [],
      'default-src': ["'none'"]
    });
  });

  it('пустая строка не роняет разбор', () => {
    expect(parseCspDirectives(undefined)).toEqual({});
  });
});

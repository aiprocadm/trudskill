import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy, parseCspDirectives, staticSecurityHeaders } from './csp';

/*
 * ФТ-G7 — политика безопасности страницы.
 *
 * Политика собирается чистой функцией: её можно прочитать глазами в тесте и не гадать,
 * что именно уходит в браузер. Проверяются не «красивые» директивы, а ПЯТЬ ЖИВЫХ
 * зависимостей, каждую из которых слишком строгая политика молча ломает:
 *   1) логотип учебного центра грузится по произвольной внешней ссылке;
 *   2) запись экзамена требует камеры и микрофона;
 *   3) страница держит соединение реального времени;
 *   4) курс SCORM показывается в рамке нашей же страницы;
 *   5) офлайн-режим работает через служебный сценарий (service worker).
 */

const options = (overrides: Partial<Parameters<typeof buildContentSecurityPolicy>[0]> = {}) =>
  buildContentSecurityPolicy({
    nonce: 'NONCE123',
    apiOrigin: 'https://api.example.ru',
    realtimeOrigin: 'wss://rt.example.ru',
    isProduction: true,
    ...overrides
  });

describe('политика безопасности страницы (ФТ-G7)', () => {
  it('свои скрипты разрешены по одноразовому числу, чужие — нет', () => {
    const csp = parseCspDirectives(options());
    expect(csp['script-src']).toContain("'nonce-NONCE123'");
    expect(csp['script-src']).not.toContain("'unsafe-inline'");
  });

  /*
   * `unsafe-eval` — это разрешение выполнять код, собранный из строки. В бою оно не нужно
   * и является лазейкой; в разработке без него не работает горячая перезагрузка сборщика.
   */
  it('выполнение кода из строки разрешено только в разработке', () => {
    expect(parseCspDirectives(options({ isProduction: true }))['script-src']).not.toContain(
      "'unsafe-eval'"
    );
    expect(parseCspDirectives(options({ isProduction: false }))['script-src']).toContain(
      "'unsafe-eval'"
    );
  });

  it('логотип центра по внешней ссылке не блокируется', () => {
    const imgSrc = parseCspDirectives(options())['img-src'];
    // Центры указывают логотип произвольной ссылкой в настройках брендирования —
    // запрет https: погасил бы логотипы у всех разом.
    expect(imgSrc).toContain('https:');
    expect(imgSrc).toContain('data:');
    expect(imgSrc).toContain('blob:');
  });

  it('запросы разрешены к своему адресу, к API и к соединению реального времени', () => {
    const connect = parseCspDirectives(options())['connect-src'];
    expect(connect).toContain("'self'");
    expect(connect).toContain('https://api.example.ru');
    expect(connect).toContain('wss://rt.example.ru');
  });

  /*
   * Живая проверка в браузере поймала то, чего не видел тест: клиент ходит на сервер
   * уведомлений ДВУМЯ способами — потоком событий по http и веб-сокетом по ws, а для
   * политики это РАЗНЫЕ источники. С одной схемой уведомления молча не приходили бы,
   * и выглядело бы это не как ошибка, а как «оповещения почему-то не работают».
   */
  it('для сервера уведомлений разрешены обе схемы — и поток событий, и веб-сокет', () => {
    const connect = parseCspDirectives(options({ realtimeOrigin: 'ws://rt.example.ru' }))[
      'connect-src'
    ];
    expect(connect).toContain('ws://rt.example.ru');
    expect(connect).toContain('http://rt.example.ru');
  });

  it('защищённый адрес уведомлений тоже даёт обе схемы', () => {
    const connect = parseCspDirectives(options({ realtimeOrigin: 'wss://rt.example.ru' }))[
      'connect-src'
    ];
    expect(connect).toContain('wss://rt.example.ru');
    expect(connect).toContain('https://rt.example.ru');
  });

  it('незаданные адреса не превращаются в мусорные источники', () => {
    const connect = parseCspDirectives(options({ apiOrigin: null, realtimeOrigin: null }))[
      'connect-src'
    ];
    expect(connect).toEqual(["'self'"]);
  });

  it('в адрес попадает только источник, без пути', () => {
    // NEXT_PUBLIC_API_BASE_URL содержит путь (/api/v1); в политике путь не имеет смысла
    // и делает директиву неверной.
    const connect =
      parseCspDirectives(options({ apiOrigin: 'https://api.example.ru/api/v1' }))['connect-src'] ??
      [];
    expect(connect).toContain('https://api.example.ru');
    expect(connect.join(' ')).not.toContain('/api/v1');
  });

  it('наша страница не показывается в чужой рамке, а курс — в нашей', () => {
    const csp = parseCspDirectives(options());
    expect(csp['frame-ancestors']).toEqual(["'self'"]);
    // SCORM-курс открывается в рамке нашей же страницы.
    expect(csp['frame-src']).toContain("'self'");
  });

  it('офлайн-режим и видео не отрезаны', () => {
    const csp = parseCspDirectives(options());
    expect(csp['worker-src']).toContain("'self'");
    expect(csp['worker-src']).toContain('blob:');
    expect(csp['media-src']).toContain('blob:');
  });

  it('закрыто то, чем страница не пользуется', () => {
    const csp = parseCspDirectives(options());
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
  });

  it('шрифты берутся только из сборки — наружу за ними не ходим', () => {
    // next/font вшивает шрифт в сборку сознательно (152-ФЗ: пользователь не ходит
    // на чужой сервер за шрифтом). Политика это фиксирует.
    expect(parseCspDirectives(options())['font-src']).toEqual(["'self'", 'data:']);
  });
});

describe('постоянные заголовки безопасности страницы (ФТ-G7)', () => {
  const asMap = (isProduction: boolean) =>
    Object.fromEntries(staticSecurityHeaders(isProduction).map((h) => [h.key, h.value]));

  /*
   * Запись экзамена (прокторинг) снимает человека на камеру и пишет звук. Политика
   * возможностей по умолчанию в браузерах глухая: не разрешишь явно — камера не включится,
   * и экзамен не запишется. Это ровно тот случай, когда «сделать построже» = сломать функцию.
   */
  it('камера и микрофон разрешены своему источнику — иначе не запишется экзамен', () => {
    const policy = asMap(true)['Permissions-Policy'];
    expect(policy).toContain('camera=(self)');
    expect(policy).toContain('microphone=(self)');
  });

  it('возможности, которыми не пользуемся, закрыты', () => {
    const policy = asMap(true)['Permissions-Policy'];
    expect(policy).toContain('geolocation=()');
    expect(policy).toContain('payment=()');
    expect(policy).toContain('usb=()');
  });

  it('принудительный HTTPS только в проде', () => {
    expect(asMap(false)['Strict-Transport-Security']).toBeUndefined();
    expect(asMap(true)['Strict-Transport-Security']).toContain('max-age=');
  });

  it('тип содержимого не угадывается, адрес не утекает целиком', () => {
    const headers = asMap(true);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    // Страницы содержат идентификаторы в адресе; наружу уходит только источник.
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});

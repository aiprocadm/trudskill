/**
 * ФТ-G7 — политика безопасности страницы и постоянные заголовки безопасности.
 *
 * Что это простыми словами. Политика — записка браузеру: «на этой странице разрешено
 * загружать вот это и ходить вот туда, всё остальное — блокируй». Она нужна, чтобы чужой
 * код, случайно попавший на страницу, не смог ни выполниться, ни отправить куда-то данные
 * человека.
 *
 * Почему одноразовое число (nonce), а не список адресов. Свои скрипты помечаются случайным
 * числом, которое меняется на каждый ответ сервера; браузер выполняет только помеченные.
 * Подделать метку заранее нельзя — она неизвестна до момента запроса.
 *
 * ⚠️ Здесь легко «сделать построже» и незаметно сломать работу. Пять живых зависимостей,
 * каждая из которых закреплена тестом:
 *   1) логотип учебного центра задаётся произвольной внешней ссылкой → `img-src https:`;
 *   2) запись экзамена требует камеры и микрофона → `Permissions-Policy: camera=(self)`;
 *   3) страница держит соединение реального времени → адрес в `connect-src`;
 *   4) курс SCORM показывается в рамке нашей страницы → `frame-src 'self'`;
 *   5) офлайн-режим работает служебным сценарием → `worker-src 'self' blob:`.
 */

/** Год — рекомендованное значение для площадки, готовой к постоянному HTTPS. */
const HSTS_MAX_AGE_SECONDS = 31_536_000;

export interface ContentSecurityPolicyOptions {
  /** Одноразовое число этого ответа. */
  nonce: string;
  /** Адрес API — из него берётся только источник (схема + хост + порт). */
  apiOrigin: string | null;
  /** Адрес соединения реального времени. */
  realtimeOrigin: string | null;
  isProduction: boolean;
}

/**
 * Разбирает политику в словарь «директива → список значений».
 * Тесты сравнивают политику по кускам: сравнение строкой целиком краснеет от простой
 * перестановки директив, ничего не проверяя по существу.
 */
export const parseCspDirectives = (policy: string | undefined): Record<string, string[]> => {
  if (!policy) return {};
  const result: Record<string, string[]> = {};
  for (const chunk of policy.split(';')) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const [name, ...values] = parts;
    if (!name) continue;
    result[name] = values;
  }
  return result;
};

/**
 * Из полного адреса оставляет только источник. `NEXT_PUBLIC_API_BASE_URL` содержит путь
 * (`/api/v1`), а путь в политике не имеет смысла и делает директиву недействительной.
 */
const toOrigin = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

/**
 * Адрес соединения реального времени задан со схемой `ws://`, но клиент ходит туда ДВУМЯ
 * способами: обычным потоком событий по http и веб-сокетом по ws
 * (`lib/realtime/client.ts` сам подменяет схему). Для политики `ws://host` и `http://host` —
 * РАЗНЫЕ источники, поэтому нужны оба.
 *
 * ⚠️ Найдено живой проверкой в браузере, а не тестом: тест подтверждал, что адрес попал в
 * директиву, и молчал о том, что клиент стучится по другой схеме. В бою уведомления были бы
 * заблокированы, а на экране это выглядело бы просто как «оповещения не приходят».
 */
const realtimeSources = (value: string | null): string[] => {
  const origin = toOrigin(value);
  if (!origin) return [];
  const paired = origin.startsWith('wss:')
    ? origin.replace(/^wss:/, 'https:')
    : origin.startsWith('ws:')
      ? origin.replace(/^ws:/, 'http:')
      : origin.startsWith('https:')
        ? origin.replace(/^https:/, 'wss:')
        : origin.replace(/^http:/, 'ws:');
  return [origin, paired];
};

export const buildContentSecurityPolicy = ({
  nonce,
  apiOrigin,
  realtimeOrigin,
  isProduction
}: ContentSecurityPolicyOptions): string => {
  const connect = ["'self'", toOrigin(apiOrigin), ...realtimeSources(realtimeOrigin)].filter(
    (value): value is string => Boolean(value)
  );

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    /*
     * `strict-dynamic` означает «доверяем тому, что загрузил уже доверенный скрипт».
     * Без него пришлось бы перечислять каждый файл сборки — а имена файлов меняются
     * при каждой сборке.
     */
    "'strict-dynamic'",
    // В разработке сборщик выполняет код из строки ради горячей перезагрузки. В бою
    // это лазейка, поэтому разрешение живёт только вне прода.
    ...(isProduction ? [] : ["'unsafe-eval'"])
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    /*
     * Стили остаются с `unsafe-inline` сознательно: Next вставляет служебные стили без
     * метки, и пометить их нечем. Риск от стилей несопоставим с риском от скриптов —
     * выполнить код через стиль в современных браузерах нельзя.
     */
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'"
  ].join('; ');
};

/**
 * Заголовки, не зависящие от конкретного ответа: их можно отдать статически из настроек
 * сборки, не проходя через обработчик запроса.
 */
export const staticSecurityHeaders = (isProduction: boolean): { key: string; value: string }[] => {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // В адресах страниц встречаются идентификаторы — наружу уходит только источник.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: [
        // Запись экзамена снимает человека и пишет звук: не разрешить явно — не запишется.
        'camera=(self)',
        'microphone=(self)',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'interest-cohort=()'
      ].join(', ')
    }
  ];

  if (isProduction) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`
    });
  }

  return headers;
};

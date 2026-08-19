/**
 * ФТ-G7 — заголовки безопасности ответов бэкенда.
 *
 * Зачем это нужно словами. Заголовки безопасности — это записка браузеру: «вот что этой
 * странице разрешено, а всё остальное запрещай». Без них браузер верит любому коду, который
 * оказался на странице, и любому сайту, который решил показать наш ответ у себя в рамке.
 *
 * Почему политика — данные, а не побочный эффект. Функция возвращает готовый набор заголовков,
 * поэтому его можно прочитать глазами в тесте, не поднимая приложение. Прошлые дефекты этого
 * репозитория (запись 118 журнала расхождений) показали: то, что не проверяется прямо,
 * ломается молча.
 *
 * Два вида ответов, потому что источника два и требования у них разные:
 *
 *   `api`   — обычный ответ JSON. Ему не нужно ничего: ни скриптов, ни картинок, ни рамок,
 *             поэтому политика самая жёсткая из возможных — `default-src 'none'`.
 *
 *   `scorm` — html и js УЧЕБНОГО КУРСА из загруженного пакета, то есть чужой код. Запретить
 *             ему скрипты нельзя — не запустится ни один курс. Поэтому послабление ровно
 *             на то, что курсу нужно (свои скрипты, свои стили), и запрет на всё, что ему
 *             не нужно: отправку данных наружу, подмену базового адреса, плагины.
 *
 * ⚠️ Чего эта функция НЕ делает и почему. Курс исполняется на том же источнике, что и
 * приложение, поэтому доступ к родительскому окну у него остаётся. Отрезать его атрибутом
 * `sandbox` нельзя: мост между курсом и системой идёт через `window.API` родительского окна
 * (`apps/frontend/src/features/scorm/scorm-player.tsx`), и `sandbox` без `allow-same-origin`
 * сломает все курсы разом. Настоящее лечение — перевести мост на обмен сообщениями
 * (`postMessage`) и отдавать контент с отдельного источника; это отдельная задача, записана
 * в журнал расхождений.
 */

/** Год. Рекомендованное значение для площадок, готовых к постоянному HTTPS. */
const HSTS_MAX_AGE_SECONDS = 31_536_000;

export type SecurityHeaderKind = 'api' | 'scorm';

export interface SecurityHeaderOptions {
  isProduction: boolean;
  kind: SecurityHeaderKind;
}

/**
 * Разбирает строку политики в словарь «директива → список значений».
 * Нужен тестам: сравнивать политику по кускам надёжнее, чем строкой целиком, — иначе
 * тест краснеет от перестановки директив, ничего не проверяя по существу.
 */
export const parseCspDirectives = (policy: string | undefined): Record<string, string[]> => {
  if (!policy) return {};
  const result: Record<string, string[]> = {};
  for (const chunk of policy.split(';')) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const [name, ...values] = parts;
    result[name] = values;
  }
  return result;
};

const apiPolicy = (): string =>
  [
    // Ответ JSON не грузит ничего и никуда не ходит.
    "default-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');

const scormPolicy = (): string =>
  [
    "default-src 'self'",
    // Курсы — это готовые пакеты сторонних производителей: у них скрипты и стили пишутся
    // прямо в разметку. Без 'unsafe-inline' не запустится ни один.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    // Главное ограничение чужого кода: наружу он ничего не отправит.
    "connect-src 'self'",
    "form-action 'self'",
    // Курс живёт в рамке нашей же страницы — поэтому 'self', а не 'none'.
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "object-src 'none'"
  ].join('; ');

/**
 * Разрешения на возможности браузера. У API их нет вообще: камера, микрофон и геопозиция
 * нужны интерфейсу (запись экзамена), а не ответу JSON.
 */
const apiPermissionsPolicy = (): string =>
  ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()'].join(', ');

export const buildSecurityHeaders = ({
  isProduction,
  kind
}: SecurityHeaderOptions): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Security-Policy': kind === 'api' ? apiPolicy() : scormPolicy(),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };

  if (kind === 'api') {
    // Старые браузеры не знают frame-ancestors — для них дублируем прежним заголовком.
    headers['X-Frame-Options'] = 'DENY';
    headers['Permissions-Policy'] = apiPermissionsPolicy();
  } else {
    headers['X-Frame-Options'] = 'SAMEORIGIN';
  }

  if (isProduction) {
    headers['Strict-Transport-Security'] =
      `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`;
  }

  return headers;
};

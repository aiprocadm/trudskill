import { NextResponse } from 'next/server';

import { buildContentSecurityPolicy, staticSecurityHeaders } from './src/lib/security/csp';
import {
  LEGACY_TENANT_CODE_COOKIE,
  TENANT_CODE_COOKIE,
  resolveTenantHost
} from './src/lib/tenant/host-resolve';

import type { NextRequest } from 'next/server';

/**
 * ФТ-D3.2 (Фаза 4 Task 8): арендатор определяется по адресу сайта.
 *
 * `demo.lms.example.ru` → код `demo` кладётся в cookie, и клиентский код отправляет его
 * как подсказку арендатора вместо значения по умолчанию из настроек. Базовый домен —
 * из `NEXT_PUBLIC_TENANT_BASE_DOMAIN`; пока он не задан, всё работает ровно как раньше
 * (режим одного арендатора), поэтому выкладка кода не ждёт DNS и сертификата.
 *
 * Чужой домен, направленный на нас по ошибке или намеренно, получает ПОНЯТНУЮ страницу,
 * а не белый экран: `rewrite` (а не redirect) сохраняет адрес в строке браузера — человек
 * видит, по какому имени он пришёл.
 *
 * Cookie НЕ HttpOnly сознательно: это не секрет, а подсказка для клиентского кода;
 * настоящая проверка арендатора живёт на сервере (TenantGuard сверяет заголовок с токеном).
 */

const TENANT_NOT_FOUND_PATH = '/tenant-not-found';

/**
 * ФТ-G7. Одноразовое число (nonce) для политики безопасности: своё на каждый ответ.
 * Next помечает им собственные встроенные сценарии, а браузер выполняет только помеченные —
 * чужой код, случайно попавший на страницу, не запустится.
 *
 * Число должно быть непредсказуемым, поэтому берётся из криптографического источника,
 * доступного в среде исполнения обработчика (Web Crypto), а не из `Math.random`.
 */
const createNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};

/**
 * Одно место, где к ответу добавляется политика: и обычный ответ, и страница-объяснение
 * про чужой домен должны быть защищены одинаково. `x-nonce` в запросе — то, как Next
 * узнаёт метку и проставляет её своим сценариям.
 */
const withContentSecurityPolicy = (
  request: NextRequest,
  build: (headers: Headers) => NextResponse
): NextResponse => {
  const nonce = createNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    apiOrigin: process.env.NEXT_PUBLIC_API_BASE_URL ?? null,
    realtimeOrigin: process.env.NEXT_PUBLIC_REALTIME_URL ?? null,
    isProduction: process.env.NODE_ENV === 'production'
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', policy);

  const response = build(requestHeaders);
  response.headers.set('content-security-policy', policy);
  /*
   * Постоянные заголовки ставятся здесь же, а не в файле настроек сборки: тот
   * компилируется отдельно и не может импортировать исходники из `src`. Список заголовков
   * должен жить в одном месте — иначе рано или поздно получится два разных списка.
   */
  for (const { key, value } of staticSecurityHeaders(process.env.NODE_ENV === 'production')) {
    response.headers.set(key, value);
  }
  return response;
};

export function middleware(request: NextRequest): NextResponse {
  const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? '';
  const resolution = resolveTenantHost(request.headers.get('host'), baseDomain);

  if (resolution.kind === 'foreign') {
    // Сама страница-объяснение должна открываться, иначе получится вечная петля.
    if (request.nextUrl.pathname === TENANT_NOT_FOUND_PATH) {
      return withContentSecurityPolicy(request, (headers) =>
        NextResponse.next({ request: { headers } })
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = TENANT_NOT_FOUND_PATH;
    return withContentSecurityPolicy(request, (headers) =>
      NextResponse.rewrite(url, { request: { headers } })
    );
  }

  const response = withContentSecurityPolicy(request, (headers) =>
    NextResponse.next({ request: { headers } })
  );
  if (resolution.kind === 'tenant') {
    response.cookies.set(TENANT_CODE_COOKIE, resolution.code, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false
    });
    // Запись = миграция: прежнее имя гасится сразу, а не только на уходе с поддомена.
    response.cookies.delete(LEGACY_TENANT_CODE_COOKIE);
  } else {
    // Ушли с поддомена на базовый домен — прежняя подсказка врала бы про арендатора.
    // BR-020: гасим и прежнее имя, иначе оно переживёт выкатку и будет читаться дальше.
    response.cookies.delete(TENANT_CODE_COOKIE);
    response.cookies.delete(LEGACY_TENANT_CODE_COOKIE);
  }
  return response;
}

export const config = {
  /*
   * Статику и служебные пути не трогаем: резолв арендатора им ничего не даёт,
   * а лишний проход обработчика на каждой картинке — лишняя работа.
   *
   * Весь `_next` исключён целиком (а не только `static` и `image`): туда же попадает
   * служебное соединение горячей перезагрузки при разработке, и вмешательство в его
   * рукопожатие роняет соединение. Политика этим адресам не нужна — они загружаются
   * страницей, которая уже под политикой.
   */
  matcher: ['/((?!_next|favicon.ico|icons|manifest.webmanifest|sw.js).*)']
};

import { NextResponse } from 'next/server';

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

export function middleware(request: NextRequest): NextResponse {
  const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? '';
  const resolution = resolveTenantHost(request.headers.get('host'), baseDomain);

  if (resolution.kind === 'foreign') {
    // Сама страница-объяснение должна открываться, иначе получится вечная петля.
    if (request.nextUrl.pathname === TENANT_NOT_FOUND_PATH) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = TENANT_NOT_FOUND_PATH;
    return NextResponse.rewrite(url);
  }

  const response = NextResponse.next();
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
  // Статику и служебные пути не трогаем: резолв арендатора им ничего не даёт,
  // а лишний проход middleware на каждой картинке — лишняя работа.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js).*)']
};

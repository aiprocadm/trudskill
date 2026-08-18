import { LEGACY_TENANT_CODE_COOKIE, TENANT_CODE_COOKIE } from './host-resolve';
import { apiRequest } from '../api/client';
import { frontendEnv } from '../config/env';

/**
 * ФТ-D3.2: какой арендатор обслуживается по текущему адресу.
 *
 * Порядок: код из поддомена (cookie от middleware) → идентификатор из настроек.
 * Cookie хранит КОД (`demo`), а API ждёт ИДЕНТИФИКАТОР (`tenant_demo`), поэтому код
 * один раз меняется на идентификатор публичной ручкой и запоминается на время вкладки:
 * дёргать резолв на каждый запрос ради значения, которое меняется только со сменой
 * адреса, — лишняя работа.
 */

export interface PublicTenantDto {
  id: string;
  code: string;
  name: string;
  status: 'trial' | 'active' | 'suspended' | 'archived';
}

const readCookieByName = (cookieHeader: string, cookieName: string): string | null => {
  const entry = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (!entry) return null;
  const value = entry.slice(cookieName.length + 1);
  return value.length > 0 ? decodeURIComponent(value) : null;
};

/**
 * Чтение cookie без зависимостей: middleware ставит её не HttpOnly именно для этого.
 *
 * BR-020: период двойного чтения — новое имя, при отсутствии прежнее. Без этого у
 * человека, зашедшего по адресу своего центра до выкатки, код арендатора «потерялся» бы
 * до следующего прохода middleware.
 */
export const readTenantCodeCookie = (cookieHeader: string | undefined | null): string | null => {
  if (!cookieHeader) return null;
  return (
    readCookieByName(cookieHeader, TENANT_CODE_COOKIE) ??
    readCookieByName(cookieHeader, LEGACY_TENANT_CODE_COOKIE)
  );
};

let cachedTenantId: string | null = null;
let cachedForCode: string | null = null;

/** Сброс памяти резолва — нужен тестам и смене адреса внутри одной сессии. */
export const resetTenantResolution = (): void => {
  cachedTenantId = null;
  cachedForCode = null;
};

/**
 * Идентификатор арендатора для заголовка `x-tenant-id` на ДОвходных запросах.
 * Любой сбой резолва — значение из настроек: невозможность спросить сервер про
 * поддомен не должна закрывать вход в кабинет по основному адресу.
 */
export const resolveCurrentTenantId = async (): Promise<string> => {
  const fallback = frontendEnv.NEXT_PUBLIC_DEFAULT_TENANT_ID;
  if (typeof document === 'undefined') return fallback;

  const code = readTenantCodeCookie(document.cookie);
  if (!code) return fallback;
  if (cachedForCode === code && cachedTenantId) return cachedTenantId;

  try {
    const tenant = await apiRequest<PublicTenantDto>(`/public/tenants/by-code/${code}`);
    cachedForCode = code;
    cachedTenantId = tenant.id;
    return tenant.id;
  } catch {
    return fallback;
  }
};

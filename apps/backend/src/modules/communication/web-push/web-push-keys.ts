/**
 * Pure helpers for validating/normalizing a browser PushSubscription.toJSON() payload.
 * No `web-push` / Nest imports — used by the controller DTO layer and unit-tested in isolation.
 * Mirrors `serializeSubscription` on the frontend (apps/frontend/src/features/push/push-logic.ts).
 */

/** Нормализованная форма подписки для хранения в MVP-state. */
export interface NormalizedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Сырой PushSubscription.toJSON() из браузера. */
interface RawBrowserSubscription {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Проверяет, что объект — корректная браузерная подписка: endpoint — https-URL,
 * keys.p256dh и keys.auth — непустые строки.
 */
export function isValidBrowserSubscription(raw: unknown): raw is Required<RawBrowserSubscription> {
  if (raw === null || typeof raw !== 'object') {
    return false;
  }
  const sub = raw as RawBrowserSubscription;
  if (!isHttpsUrl(sub.endpoint)) {
    return false;
  }
  const keys = sub.keys;
  if (keys === null || typeof keys !== 'object') {
    return false;
  }
  return isNonEmptyString(keys.p256dh) && isNonEmptyString(keys.auth);
}

/**
 * Извлекает endpoint + keys из PushSubscription.toJSON() в плоскую форму.
 * Предполагает уже провалидированный вход (см. isValidBrowserSubscription).
 */
export function normalizeSubscription(raw: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): NormalizedSubscription {
  return {
    endpoint: raw.endpoint,
    p256dh: raw.keys.p256dh,
    auth: raw.keys.auth
  };
}

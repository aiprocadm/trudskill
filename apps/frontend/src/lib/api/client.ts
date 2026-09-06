import { noteServerTime } from './server-clock';
import { frontendEnv } from '../config/env';
import { type NormalizedApiError, normalizeApiError } from '../errors/api-error';
import { errorDetailsLine, humanErrorMessage } from '../errors/error-text';

import type {
  GeneratedApiResponseEnvelope as ApiResponseEnvelope,
  GeneratedApiPath
} from '@trudskill/api-contracts/src/generated/contracts.generated';

/**
 * Ошибка запроса к серверу.
 *
 * `TXT-004`: в `message` лежит текст ДЛЯ ЧЕЛОВЕКА — что произошло и что делать. Раньше туда
 * попадало сообщение сервера слово в слово («Unexpected API error», «Verification link is
 * invalid»), а экраны показывают именно `message` — все 57 мест в приложении. Одна правка
 * здесь исправляет их разом; конкретика русских серверных сообщений при этом сохраняется
 * (см. `humanErrorMessage`).
 *
 * Технические данные никуда не деваются: код, статус и исходный ответ лежат в `normalized`,
 * а готовая строка для спойлера «Подробности» — в `details`.
 */
export class ApiClientError extends Error {
  constructor(public readonly normalized: NormalizedApiError) {
    super(humanErrorMessage(normalized));
    this.name = 'ApiClientError';
  }

  /** Строка для спойлера «Подробности»: код, статус, номер запроса, ответ сервера. */
  get details(): string {
    return errorDetailsLine(this.normalized);
  }
}

/**
 * Что делать, когда сервер ответил «сессия негодна» (401).
 *
 * Ставит слой сессии (`lib/auth/session-manager.ts`), а не клиент: клиент лежит НИЖЕ него —
 * сессия обращается к серверу через этот же клиент, и импорт в обратную сторону замкнул бы
 * круг. Возвращает свежий токен доступа либо `null`, если чинить нечем (тогда сессия уже
 * очищена, и приложение уводит человека на экран входа).
 */
export type SessionRecovery = () => Promise<string | null>;

let sessionRecovery: SessionRecovery | null = null;

/** Поставить (или снять — `null`) восстановление сессии. */
export const setSessionRecovery = (recover: SessionRecovery | null): void => {
  sessionRecovery = recover;
};

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: HeadersInit;
  auth?: { accessToken?: string; tenantHint?: string; userId?: string; tenantId?: string };
  credentials?: RequestCredentials;
}
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const toJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const isResponseEnvelope = <T>(payload: unknown): payload is ApiResponseEnvelope<T> => {
  if (!payload || typeof payload !== 'object') return false;
  const asRecord = payload as Record<string, unknown>;
  const meta = asRecord.meta;
  return (
    'data' in asRecord &&
    typeof meta === 'object' &&
    meta !== null &&
    typeof (meta as Record<string, unknown>).requestId === 'string' &&
    typeof (meta as Record<string, unknown>).correlationId === 'string' &&
    typeof (meta as Record<string, unknown>).timestamp === 'string'
  );
};

export const apiRequestEnvelope = async <T>(
  path: GeneratedApiPath | string,
  options: RequestOptions = {}
): Promise<ApiResponseEnvelope<T>> => {
  const send = async (
    accessToken: string | undefined
  ): Promise<{ response: Response; sentAtMs: number }> => {
    const headers = new Headers(options.headers);
    const method = options.method ?? 'GET';
    headers.set('content-type', 'application/json');
    headers.set('x-correlation-id', crypto.randomUUID());
    const tenantHint =
      options.auth?.tenantHint ??
      options.auth?.tenantId ??
      frontendEnv.NEXT_PUBLIC_DEFAULT_TENANT_ID;
    if (tenantHint) {
      headers.set('x-tenant-id', tenantHint);
    }
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

    const requestInit: RequestInit = {
      method,
      headers,
      cache: 'no-store',
      credentials: options.credentials ?? 'same-origin'
    };
    if (options.body !== undefined) {
      requestInit.body = JSON.stringify(options.body);
    }
    /*
     * Обрыв связи — тоже ответ человеку, и он обязан быть человеческим.
     *
     * `fetch` при отсутствии сети бросает не ошибку с кодом, а `TypeError` браузера:
     * «Failed to fetch» в одном браузере, «NetworkError when attempting to fetch resource»
     * в другом. Этот текст доходил до экрана как есть — по-английски и без ответа на
     * вопрос «что мне делать». Правило `TXT-004` действует и здесь.
     *
     * Статус 0 — признак «ответа не было вовсе»: он отличает обрыв связи от ответа сервера
     * с ошибкой, и по нему экран может решить, предлагать ли повтор.
     */
    let response: Response;
    // Порция 25: засечки вокруг запроса — по ним сверяются часы устройства с часами
    // сервера (см. server-clock.ts). Обратный отсчёт попытки должен идти по серверу.
    const sentAtMs = Date.now();
    try {
      response = await fetch(`${frontendEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, requestInit);
    } catch (networkError) {
      throw new ApiClientError(
        normalizeApiError(0, {
          error: {
            code: 'network_unavailable',
            message: networkError instanceof Error ? networkError.message : 'network request failed'
          }
        })
      );
    }
    return { response, sentAtMs };
  };

  /*
   * Журнал 350. Токен доступа живёт 15 минут, а сессия по cookie — много дольше. Через
   * четверть часа работы каждый запрос отвечал 401, и человек читал «Войдите заново», но
   * никуда не переходил: приложение узнавало о смерти сессии только при перезагрузке
   * страницы. Теперь 401 на РАБОЧЕМ запросе (том, что шёл с токеном) один раз просит слой
   * сессии обновиться и повторяет запрос свежим токеном.
   *
   * Повтор ровно один: если и он получил 401, дело не в сроке токена, и второй круг лишь
   * задержал бы ответ человеку. Запрос без токена (вход, обновление сессии) не трогает
   * восстановление вовсе — иначе обновление сессии вызывало бы само себя.
   */
  let { response, sentAtMs } = await send(options.auth?.accessToken);
  if (response.status === 401 && options.auth?.accessToken && sessionRecovery) {
    const freshToken = await sessionRecovery();
    if (freshToken) {
      ({ response, sentAtMs } = await send(freshToken));
    }
  }

  if (!response.ok) {
    const payload = await toJson(response);
    throw new ApiClientError(normalizeApiError(response.status, payload));
  }

  if (response.status === 204) {
    return {
      data: undefined as T,
      meta: { requestId: '', correlationId: '', timestamp: new Date(0).toISOString() }
    };
  }

  const payload = await toJson(response);

  if (!isResponseEnvelope<T>(payload)) {
    throw new ApiClientError(
      normalizeApiError(500, {
        error: {
          code: 'INVALID_RESPONSE_ENVELOPE',
          message: 'Server response does not match { data, meta } envelope contract'
        }
      })
    );
  }

  noteServerTime(payload.meta.timestamp, sentAtMs, Date.now());
  return payload;
};

export const apiRequest = async <T>(
  path: GeneratedApiPath | string,
  options: RequestOptions = {}
): Promise<T> => {
  const response = await apiRequestEnvelope<T>(path, options);
  return response.data;
};

export interface ApiClient {
  get<T>(path: GeneratedApiPath | string, options?: Omit<RequestOptions, 'method'>): Promise<T>;
  post<T>(
    path: GeneratedApiPath | string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T>;
  put<T>(
    path: GeneratedApiPath | string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T>;
  patch<T>(
    path: GeneratedApiPath | string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T>;
  delete<T>(path: GeneratedApiPath | string, options?: Omit<RequestOptions, 'method'>): Promise<T>;
}

const withMethod = (
  method: HttpMethod,
  options: Omit<RequestOptions, 'method'> = {}
): RequestOptions => ({
  ...options,
  method
});

export const apiClient: ApiClient = {
  get: (path, options = {}) => apiRequest(path, withMethod('GET', options)),
  post: (path, body, options = {}) => apiRequest(path, { ...withMethod('POST', options), body }),
  put: (path, body, options = {}) => apiRequest(path, { ...withMethod('PUT', options), body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...withMethod('PATCH', options), body }),
  delete: (path, options = {}) => apiRequest(path, withMethod('DELETE', options))
};

import { frontendEnv } from '../config/env';
import { type NormalizedApiError, normalizeApiError } from '../errors/api-error';

import type {
  GeneratedApiPath,
  GeneratedApiResponseEnvelope as ApiResponseEnvelope
} from '@cdoprof/api-contracts/src/generated/contracts.generated';

export class ApiClientError extends Error {
  constructor(public readonly normalized: NormalizedApiError) {
    super(normalized.message);
    this.name = 'ApiClientError';
  }
}

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
  const headers = new Headers(options.headers);
  const method = options.method ?? 'GET';
  headers.set('content-type', 'application/json');
  headers.set('x-correlation-id', crypto.randomUUID());
  const tenantHint =
    options.auth?.tenantHint ?? options.auth?.tenantId ?? frontendEnv.NEXT_PUBLIC_DEFAULT_TENANT_ID;
  if (tenantHint) {
    headers.set('x-tenant-id', tenantHint);
  }
  if (options.auth?.accessToken) headers.set('authorization', `Bearer ${options.auth.accessToken}`);

  const requestInit: RequestInit = {
    method,
    headers,
    cache: 'no-store',
    credentials: options.credentials ?? 'same-origin'
  };
  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${frontendEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, requestInit);

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

  return payload;
};

export const apiRequest = async <T>(path: GeneratedApiPath | string, options: RequestOptions = {}): Promise<T> => {
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

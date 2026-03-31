import { frontendEnv } from '../config/env';
import { normalizeApiError, type NormalizedApiError } from '../errors/api-error';

export interface ApiResponseMeta {
  requestId: string;
  correlationId: string;
  timestamp: string;
}

export interface ApiResponseEnvelope<T> {
  data: T;
  meta: ApiResponseMeta;
}

export class ApiClientError extends Error {
  constructor(public readonly normalized: NormalizedApiError) {
    super(normalized.message);
    this.name = 'ApiClientError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: HeadersInit;
  auth?: { accessToken?: string; tenantHint?: string; userId?: string; tenantId?: string };
  credentials?: RequestCredentials;
}

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

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const value = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
};

export const apiRequestEnvelope = async <T>(path: string, options: RequestOptions = {}): Promise<ApiResponseEnvelope<T>> => {
  const headers = new Headers(options.headers);
  const method = options.method ?? 'GET';
  headers.set('content-type', 'application/json');
  headers.set('x-correlation-id', crypto.randomUUID());
  const tenantHint = options.auth?.tenantHint ?? options.auth?.tenantId ?? frontendEnv.NEXT_PUBLIC_DEFAULT_TENANT_ID;
  if (tenantHint) {
    headers.set('x-tenant-id', tenantHint);
  }
  if (options.auth?.accessToken) headers.set('authorization', `Bearer ${options.auth.accessToken}`);
  if (options.credentials === 'include' && method !== 'GET') {
    const csrfToken = getCookie('cdoprof.csrf');
    if (csrfToken) headers.set('x-csrf-token', csrfToken);
  }

  const response = await fetch(`${frontendEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
    credentials: options.credentials ?? 'same-origin'
  });

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

export const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const response = await apiRequestEnvelope<T>(path, options);
  return response.data;
};

export interface ApiClient {
  get<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;
  delete<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T>;
}

const withMethod = (method: RequestOptions['method'], options: RequestOptions = {}): RequestOptions => ({ ...options, method });

export const apiClient: ApiClient = {
  get: (path, options = {}) => apiRequest(path, withMethod('GET', options)),
  post: (path, body, options = {}) => apiRequest(path, { ...withMethod('POST', options), body }),
  put: (path, body, options = {}) => apiRequest(path, { ...withMethod('PUT', options), body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...withMethod('PATCH', options), body }),
  delete: (path, options = {}) => apiRequest(path, withMethod('DELETE', options))
};

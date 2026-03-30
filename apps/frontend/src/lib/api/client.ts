import { frontendEnv } from '../config/env';
import { normalizeApiError, type NormalizedApiError } from '../errors/api-error';

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
  auth?: { userId?: string; tenantId?: string; accessToken?: string };
}

const toJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

export const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  headers.set('x-tenant-id', options.auth?.tenantId ?? frontendEnv.NEXT_PUBLIC_DEFAULT_TENANT_ID);
  headers.set('x-correlation-id', crypto.randomUUID());
  if (options.auth?.userId) headers.set('x-user-id', options.auth.userId);
  if (options.auth?.accessToken) headers.set('authorization', `Bearer ${options.auth.accessToken}`);

  const requestInit: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    cache: 'no-store'
  };

  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${frontendEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, requestInit);

  if (!response.ok) {
    const payload = await toJson(response);
    throw new ApiClientError(normalizeApiError(response.status, payload));
  }

  if (response.status === 204) return undefined as T;
  return (await toJson(response)) as T;
};

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => apiRequest<T>(path, { ...options, method: 'DELETE' })
};

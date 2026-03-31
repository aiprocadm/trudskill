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
  auth?: { accessToken?: string; tenantHint?: string; userId?: string; tenantId?: string };
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
  headers.set('x-correlation-id', crypto.randomUUID());
  const tenantHint = options.auth?.tenantHint ?? options.auth?.tenantId ?? frontendEnv.NEXT_PUBLIC_DEFAULT_TENANT_ID;
  if (tenantHint) {
    headers.set('x-tenant-id', tenantHint);
  }
  if (options.auth?.accessToken) headers.set('authorization', `Bearer ${options.auth.accessToken}`);

  const response = await fetch(`${frontendEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });

  if (!response.ok) {
    const payload = await toJson(response);
    throw new ApiClientError(normalizeApiError(response.status, payload));
  }

  if (response.status === 204) return undefined as T;
  return (await toJson(response)) as T;
};
